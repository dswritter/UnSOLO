package com.unsolo.app.data

import android.content.Context
import android.net.Uri
import com.unsolo.app.core.image.ImageCompressor
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiService
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.AppJson
import com.unsolo.app.core.net.apiCall
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.drop
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.UUID
import okhttp3.MediaType
import okhttp3.RequestBody
import okio.BufferedSink
import okio.ForwardingSink
import okio.buffer

/** Wraps a request body and reports how much of it has been sent (0..1). */
private class ProgressBody(private val inner: RequestBody, private val onProgress: (Float) -> Unit) : RequestBody() {
    override fun contentType(): MediaType? = inner.contentType()
    override fun contentLength(): Long = inner.contentLength()
    override fun writeTo(sink: BufferedSink) {
        val total = contentLength().coerceAtLeast(1)
        var sent = 0L
        var lastPct = -1
        val counting = object : ForwardingSink(sink) {
            override fun write(source: okio.Buffer, byteCount: Long) {
                super.write(source, byteCount)
                sent += byteCount
                val pct = (sent * 100 / total).toInt()
                if (pct != lastPct) { lastPct = pct; onProgress(sent.toFloat() / total) }
            }
        }.buffer()
        inner.writeTo(counting)
        counting.flush()
    }
}

private const val KEY_RAIL = "status_rail"

/** A story being sent in the background: [progress] 0..1 across all photos; [error] once it failed (tap to retry). */
data class StoryUpload(val progress: Float, val photos: Int, val error: String? = null)

/** A status you shared, kept on this phone after it expires so you can share it again. */
@Serializable
data class ArchivedStatus(val id: String, val path: String, val caption: String? = null, val postedAt: Long)

/**
 * 24-hour statuses: the rail (people you can see, yours first), one person's for their profile,
 * sharing (compress → upload → POST /statuses, copies kept in the on-phone archive), seen marks.
 */
class StatusRepository(
    private val context: Context,
    private val api: ApiService,
    private val compressor: ImageCompressor,
    private val scope: CoroutineScope,
    private val events: AppEvents,
    private val db: com.unsolo.app.core.db.AppDatabase,
    private val myUsername: () -> String?,
) {
    private val _rail = MutableStateFlow<List<StatusAuthor>>(emptyList())
    val rail: StateFlow<List<StatusAuthor>> = _rail.asStateFlow()
    private val _posting = MutableStateFlow(false)
    val posting: StateFlow<Boolean> = _posting.asStateFlow()
    private val _upload = MutableStateFlow<StoryUpload?>(null)
    /** The story going up right now (or the one that failed), for the ring on "Your story" and your profile. */
    val upload: StateFlow<StoryUpload?> = _upload.asStateFlow()
    private var lastShare: Triple<List<Uri>, String?, String>? = null
    private var shareJob: kotlinx.coroutines.Job? = null

    init {
        // Show the stories row from the phone at once on launch (minus any that have expired since),
        // then the server's copy replaces it. Every change is saved back, so seen marks and
        // reactions survive a restart too.
        scope.launch {
            val saved = runCatching { db.cache().getAs(KEY_RAIL, StatusesResponse.serializer()) }.getOrNull()?.authors.orEmpty()
            val now = System.currentTimeMillis()
            val live = saved.mapNotNull { a ->
                val items = a.items.filter { i -> runCatching { java.time.Instant.parse(i.expiresAt).toEpochMilli() > now }.getOrDefault(true) }
                if (items.isEmpty()) null else a.copy(items = items, unseen = items.any { !it.seen })
            }
            if (_rail.value.isEmpty() && live.isNotEmpty()) _rail.value = live
            @OptIn(kotlinx.coroutines.FlowPreview::class)
            _rail.drop(1).debounce(400).collect { r ->
                runCatching { db.cache().putAs(KEY_RAIL, StatusesResponse.serializer(), StatusesResponse(r)) }
            }
        }
    }

    suspend fun refresh(): ApiResult<Unit> {
        val r = apiCall { api.statuses() }
        if (r is ApiResult.Ok) _rail.value = r.value.authors
        return (r as? ApiResult.Ok)?.let { ApiResult.Ok(Unit) } ?: (r as? ApiResult.Err ?: ApiResult.Offline)
    }

    /** One person's live statuses (from the rail when we have them). */
    suspend fun forUser(userId: String): StatusAuthor? {
        _rail.value.firstOrNull { it.user.id == userId }?.let { return it }
        val r = apiCall { api.statuses(user = userId) }
        return (r as? ApiResult.Ok)?.value?.authors?.firstOrNull()
    }

    private val seenQueue = mutableSetOf<String>()
    private var seenJob: kotlinx.coroutines.Job? = null

    /** Marks locally at once; sends in one batch a moment later. */
    fun markSeen(authorId: String, id: String) {
        _rail.value = _rail.value.map { a ->
            if (a.user.id != authorId) a else {
                val items = a.items.map { if (it.id == id) it.copy(seen = true) else it }
                a.copy(items = items, unseen = items.any { !it.seen })
            }
        }
        synchronized(seenQueue) { seenQueue += id }
        seenJob?.cancel()
        seenJob = scope.launch {
            kotlinx.coroutines.delay(1500)
            val ids = synchronized(seenQueue) { seenQueue.toList().also { seenQueue.clear() } }
            if (ids.isNotEmpty()) apiCall { api.seenStatuses(SeenStatusesRequest(ids.take(50))) }
        }
    }

    private fun patchItem(id: String, f: (StatusItem) -> StatusItem) {
        _rail.value = _rail.value.map { a -> a.copy(items = a.items.map { if (it.id == id) f(it) else it }) }
    }

    /** Tap = your reaction moves at once; the server's counts replace the guess. Same kind again = take it back. */
    suspend fun react(item: StatusItem, kind: String): Boolean {
        val next = if (item.myReaction == kind) null else kind
        patchItem(item.id) { it.copy(myReaction = next, reactions = it.reactions.toMutableMap().apply {
            item.myReaction?.let { k -> put(k, ((get(k) ?: 1) - 1).coerceAtLeast(0)) }
            next?.let { k -> put(k, (get(k) ?: 0) + 1) }
        }.filterValues { it > 0 }) }
        val r = apiCall { api.reactStatus(item.id, StatusReactionRequest(next)) }
        if (r is ApiResult.Ok) patchItem(item.id) { it.copy(myReaction = r.value.myReaction, reactions = r.value.reactions) }
        else patchItem(item.id) { it.copy(myReaction = item.myReaction, reactions = item.reactions) }
        return r is ApiResult.Ok
    }

    // ---- Comments: the saved copy shows at once, the fresh one replaces it ----

    private val commentsS = ListSerializer(StatusComment.serializer())
    private val _comments = MutableStateFlow<Map<String, List<StatusComment>>>(emptyMap())
    /** Comments per story, as last seen (memory, backed by the on-phone cache). */
    val comments: StateFlow<Map<String, List<StatusComment>>> = _comments.asStateFlow()

    private fun putComments(id: String, list: List<StatusComment>) {
        _comments.value = _comments.value + (id to list)
        scope.launch { runCatching { db.cache().putAs("status_comments:$id", commentsS, list) } }
    }

    /** Saved copy first (instant), then the server's. Returns false if the refresh failed. */
    suspend fun loadComments(id: String): Boolean {
        if (id !in _comments.value) runCatching { db.cache().getAs("status_comments:$id", commentsS) }.getOrNull()?.let { _comments.value = _comments.value + (id to it) }
        val r = apiCall { api.statusComments(id) }
        if (r is ApiResult.Ok) putComments(id, r.value.items)
        return r is ApiResult.Ok
    }

    /** Loads a story's comments in the background while it plays, so opening them is instant. */
    fun prefetchComments(item: StatusItem) {
        if (item.commentCount > 0 && _comments.value[item.id]?.size != item.commentCount) scope.launch { loadComments(item.id) }
    }

    suspend fun comment(id: String, body: String): ApiResult<StatusComment> {
        val r = apiCall { api.commentStatus(id, StatusCommentRequest(body.trim())) }
        if (r is ApiResult.Ok) {
            patchItem(id) { it.copy(commentCount = it.commentCount + 1) }
            putComments(id, _comments.value[id].orEmpty() + r.value)
        }
        return r
    }

    suspend fun delete(id: String): Boolean {
        val r = apiCall { api.deleteStatus(id) }
        if (r is ApiResult.Ok) _rail.value = _rail.value.mapNotNull { a -> a.copy(items = a.items.filter { it.id != id }).takeIf { it.items.isNotEmpty() } }
        return r is ApiResult.Ok
    }

    /**
     * Starts sharing in the background and returns at once, so you can leave the composer. Progress
     * shows as a ring on "Your story"; a message says when it's up (or why it failed, tap to retry).
     */
    fun shareInBackground(uris: List<Uri>, caption: String?, audience: String): Boolean {
        if (_posting.value) { events.emit(AppEvent.Message("Your last story is still going up.")); return false }
        lastShare = Triple(uris, caption, audience)
        _posting.value = true
        _upload.value = StoryUpload(0f, uris.size.coerceAtMost(10))
        shareJob = scope.launch {
            val err = try { share(uris, caption, audience) } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { "Couldn't share your story." }
            if (err == null) {
                _upload.value = null
                lastShare = null
                events.emit(AppEvent.Message(if (uris.isEmpty()) "Your story is up." else "Your story is up. It disappears in 24 hours and stays in your archive."))
            } else {
                _upload.value = _upload.value?.copy(error = err) ?: StoryUpload(0f, uris.size, err)
                events.emit(AppEvent.Message("Your story didn't go up: $err Tap Your story to try again or discard it."))
            }
        }
        return true
    }

    /** Tries the failed story again. */
    fun retryUpload() { val l = lastShare ?: return; _upload.value = null; shareInBackground(l.first, l.second, l.third) }

    /** Forgets the failed story. */
    fun dismissUpload() { if (!_posting.value) { _upload.value = null; lastShare = null } }

    /** Stops the story going up now (nothing is posted). */
    fun cancelUpload() {
        shareJob?.cancel(); shareJob = null
        _posting.value = false; _upload.value = null; lastShare = null
        events.emit(AppEvent.Message("Story cancelled"))
    }

    /** "Offline" also covers a server that didn't answer in time: say which it was. */
    private fun offlineReason(): String {
        val cm = context.getSystemService(android.net.ConnectivityManager::class.java)
        val caps = cm?.getNetworkCapabilities(cm.activeNetwork)
        val online = caps?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
        return if (online) "UnSOLO's server didn't answer in time. Try again in a minute." else "You're offline."
    }

    /** Shares photos (or just text) as statuses. Returns null on success, else a message to show. */
    private suspend fun share(uris: List<Uri>, caption: String?, audience: String): String? {
        try {
            val dir = File(context.cacheDir, "status_out").apply { mkdirs() }
            val refs = mutableListOf<StatusMediaRef>()
            val files = mutableListOf<File>()
            val list = uris.take(10)
            // Each photo: a little for compressing, the rest for sending; the last 5% is creating the story.
            val per = if (list.isEmpty()) 0f else 0.95f / list.size
            fun report(i: Int, f: Float) { _upload.value = _upload.value?.copy(progress = (i * per + f * per).coerceIn(0f, 0.95f)) }
            for ((i, u) in list.withIndex()) {
                val out = File(dir, UUID.randomUUID().toString() + ".jpg")
                runCatching { compressor.compress(u, out) }.getOrElse { return "Couldn't read a photo. Try another." }
                report(i, 0.15f)
                val body = ProgressBody(out.asRequestBody("image/jpeg".toMediaType())) { sent -> report(i, 0.15f + 0.85f * sent) }
                val part = MultipartBody.Part.createFormData("file", out.name, body)
                when (val r = apiCall { api.upload(part, "story".toRequestBody("text/plain".toMediaType())) }) {
                    is ApiResult.Ok -> { refs += StatusMediaRef(r.value.url); files += out; report(i, 1f) }
                    is ApiResult.Err -> return r.message ?: "Couldn't upload that photo."
                    ApiResult.Offline -> return offlineReason()
                }
            }
            return when (val r = apiCall { api.createStatus(CreateStatusRequest(refs, caption?.trim()?.ifBlank { null }, audience)) }) {
                is ApiResult.Ok -> {
                    _upload.value = _upload.value?.copy(progress = 1f)
                    files.forEach { archive(it, caption) }
                    refresh()
                    null
                }
                is ApiResult.Err -> r.message ?: "Couldn't share your story."
                ApiResult.Offline -> offlineReason()
            }
        } finally { _posting.value = false }
    }

    // ---- @mentions: instant local matches, then the server's ----

    private val peopleHits = java.util.concurrent.ConcurrentHashMap<String, List<UserLite>>()
    private val _known = MutableStateFlow<List<UserLite>>(emptyList())

    /** People you follow and people in the stories row: matched on the phone while the search runs. */
    fun warmPeople() {
        if (_known.value.isNotEmpty()) return
        _known.value = _rail.value.map { it.user }
        scope.launch {
            val me = myUsername() ?: return@launch
            (apiCall { api.following(me) } as? ApiResult.Ok)?.value?.items?.let { f -> _known.value = (f + _known.value).distinctBy { it.id } }
        }
    }

    private fun matches(u: UserLite, q: String): Boolean {
        val t = q.lowercase()
        return u.username.lowercase().startsWith(t) || u.name.lowercase().split(' ').any { it.startsWith(t) } || (t.length >= 3 && (u.username.lowercase().contains(t) || u.name.lowercase().contains(t)))
    }

    /** Matches we already have for [q]: earlier answers for it (or a shorter start of it), plus people you follow. */
    fun peopleNow(q: String): List<UserLite> {
        val t = q.lowercase()
        val cached = peopleHits[t] ?: (t.length - 1 downTo 1).firstNotNullOfOrNull { peopleHits[t.take(it)] }?.filter { matches(it, t) }.orEmpty()
        return (_known.value.filter { matches(it, t) } + cached).distinctBy { it.id }.take(10)
    }

    /** People to @mention, by name or username (answers are remembered for this session). */
    suspend fun people(q: String): List<UserLite> {
        val t = q.lowercase()
        peopleHits[t]?.let { return (_known.value.filter { u -> matches(u, t) } + it).distinctBy { u -> u.id }.take(10) }
        val r = (apiCall { api.people(q) } as? ApiResult.Ok)?.value?.items ?: return peopleNow(q)
        peopleHits[t] = r
        return (_known.value.filter { matches(it, t) } + r).distinctBy { it.id }.take(10)
    }

    // ---- Archive (on this phone only) ----

    private val archiveDir get() = File(context.filesDir, "status_archive").apply { mkdirs() }
    private val indexFile get() = File(archiveDir, "index.json")
    private val archiveS = ListSerializer(ArchivedStatus.serializer())
    private val _archive = MutableStateFlow<List<ArchivedStatus>>(emptyList())
    val archive: StateFlow<List<ArchivedStatus>> = _archive.asStateFlow()

    fun loadArchive() {
        _archive.value = runCatching { AppJson.decodeFromString(archiveS, indexFile.readText()) }.getOrDefault(emptyList())
            .filter { File(it.path).exists() }
    }

    private fun archive(file: File, caption: String?) {
        loadArchive()
        val id = UUID.randomUUID().toString()
        val dest = File(archiveDir, "$id.jpg")
        runCatching { file.copyTo(dest, overwrite = true) }.getOrNull() ?: return
        val list = (listOf(ArchivedStatus(id, dest.absolutePath, caption?.trim()?.ifBlank { null }, System.currentTimeMillis())) + _archive.value).take(MAX_ARCHIVE)
        _archive.value.drop(MAX_ARCHIVE - 1).forEach { old -> if (list.none { it.id == old.id }) File(old.path).delete() }
        _archive.value = list
        runCatching { indexFile.writeText(AppJson.encodeToString(archiveS, list)) }
    }

    fun removeFromArchive(id: String) {
        val item = _archive.value.firstOrNull { it.id == id } ?: return
        File(item.path).delete()
        _archive.value = _archive.value - item
        runCatching { indexFile.writeText(AppJson.encodeToString(archiveS, _archive.value)) }
    }

    fun clear() { _rail.value = emptyList(); scope.launch { runCatching { db.cache().delete(KEY_RAIL) } } }

    companion object { const val MAX_ARCHIVE = 200 }
}
