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
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.UUID

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
) {
    private val _rail = MutableStateFlow<List<StatusAuthor>>(emptyList())
    val rail: StateFlow<List<StatusAuthor>> = _rail.asStateFlow()
    private val _posting = MutableStateFlow(false)
    val posting: StateFlow<Boolean> = _posting.asStateFlow()

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

    suspend fun delete(id: String): Boolean {
        val r = apiCall { api.deleteStatus(id) }
        if (r is ApiResult.Ok) _rail.value = _rail.value.mapNotNull { a -> a.copy(items = a.items.filter { it.id != id }).takeIf { it.items.isNotEmpty() } }
        return r is ApiResult.Ok
    }

    /** Shares photos (or just text) as statuses. Returns null on success, else a message to show. */
    suspend fun share(uris: List<Uri>, caption: String?, audience: String): String? {
        if (_posting.value) return "Already sharing"
        _posting.value = true
        try {
            val dir = File(context.cacheDir, "status_out").apply { mkdirs() }
            val refs = mutableListOf<StatusMediaRef>()
            val files = mutableListOf<File>()
            for (u in uris.take(10)) {
                val out = File(dir, UUID.randomUUID().toString() + ".jpg")
                runCatching { compressor.compress(u, out) }.getOrElse { return "Couldn't read a photo. Try another." }
                val part = MultipartBody.Part.createFormData("file", out.name, out.asRequestBody("image/jpeg".toMediaType()))
                when (val r = apiCall { api.upload(part, "story".toRequestBody("text/plain".toMediaType())) }) {
                    is ApiResult.Ok -> { refs += StatusMediaRef(r.value.url); files += out }
                    is ApiResult.Err -> return r.message ?: "Couldn't upload that photo."
                    ApiResult.Offline -> return "You're offline. Try again when you're connected."
                }
            }
            return when (val r = apiCall { api.createStatus(CreateStatusRequest(refs, caption?.trim()?.ifBlank { null }, audience)) }) {
                is ApiResult.Ok -> {
                    files.forEach { archive(it, caption) }
                    refresh()
                    null
                }
                is ApiResult.Err -> r.message ?: "Couldn't share your story."
                ApiResult.Offline -> "You're offline. Try again when you're connected."
            }
        } finally { _posting.value = false }
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

    fun clear() { _rail.value = emptyList() }

    companion object { const val MAX_ARCHIVE = 200 }
}
