package com.unsolo.app.data

import android.content.Context
import android.net.Uri
import androidx.room.withTransaction
import com.unsolo.app.core.analytics.Analytics
import com.unsolo.app.core.db.*
import com.unsolo.app.core.image.ImageCompressor
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.ApiService
import com.unsolo.app.core.net.AppJson
import com.unsolo.app.core.net.apiCall
import com.unsolo.app.core.net.apiUnit
import com.unsolo.app.core.sync.Outbox
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/** What the composer hands over. Matches POST /posts fields. */
data class PostDraft(
    val kind: String,
    val title: String? = null,
    val body: String = "",
    val place: Place? = null,
    val startsOn: String? = null,
    val endsOn: String? = null,
    val spotsTotal: Int? = null,
    val audience: String? = null,
    val estCostText: String? = null,
    val meetingPoint: String? = null,
    val trip: TripLite? = null,
    val showOnTripPage: Boolean? = null,
    val poll: List<String>? = null,
    val tagUsers: List<UserLite> = emptyList(),
)

class TribeRepository(
    private val context: Context,
    private val db: AppDatabase,
    private val api: ApiService,
    private val outbox: Outbox,
    private val account: AccountRepository,
    private val analytics: Analytics,
    private val events: AppEvents,
    private val scope: CoroutineScope,
    private val compressor: ImageCompressor,
) {
    private val postS = Post.serializer()
    private companion object { const val KEY_BLOCKED = "blocked_users" }
    private val tripS = TripLite.serializer()

    fun feedKey(kind: String?) = kind ?: "foryou"

    // ---------- Feed ----------

    fun observeFeed(kind: String?): Flow<FeedState> {
        val key = feedKey(kind)
        val blockedFlow = db.cache().observeAs(KEY_BLOCKED, ListSerializer(String.serializer())).map { it.orEmpty().toHashSet() }
        return combine(db.feed().observe(key), db.feed().observeMeta(key), db.posts().observeLocal(), blockedFlow) { rows, meta, local, blocked ->
            val localItems = local.mapNotNull { e ->
                postS.decOrNull(e.json)?.takeIf { kind == null || it.kind == kind }
                    ?.let { PostItem(it, e.localState, e.prompts?.split(',')?.filter { s -> s.isNotBlank() }.orEmpty()) }
            }
            val shown = localItems.map { it.post.id }.toHashSet()
            val items = rows.mapNotNull { r ->
                when (r.type) {
                    PostKind.PLACED_TRIP -> tripS.decOrNull(r.tripJson)?.let { PlacedTripItem(it, r.position) }
                    else -> r.postJson?.let { postS.decOrNull(it) }?.takeIf { it.id !in shown && it.author.id !in blocked && it.status != "removed" && it.status != "hidden" }
                        ?.let { PostItem(it, r.localState ?: LocalState.SYNCED, r.prompts?.split(',').orEmpty().filter { s -> s.isNotBlank() }) }
                }
            }
            FeedState(
                items = localItems + items,
                caughtUp = meta?.caughtUp ?: false,
                nextDepartures = meta?.nextDeparturesJson?.let { ListSerializer(tripS).decOrNull(it) }.orEmpty(),
                fetchedAt = meta?.fetchedAt,
            )
        }
    }

    suspend fun refreshFeed(kind: String?, lat: Double? = null, lng: Double? = null): ApiResult<Unit> {
        val r = apiCall { api.feed(kind = kind, lat = lat, lng = lng) }
        if (r !is ApiResult.Ok) return r as? ApiResult.Err ?: ApiResult.Offline
        writeFeedPage(feedKey(kind), r.value, replace = true)
        return ApiResult.Ok(Unit)
    }

    suspend fun loadMore(kind: String?): ApiResult<Unit> {
        val key = feedKey(kind)
        val cursor = db.feed().meta(key)?.nextCursor ?: return ApiResult.Ok(Unit)
        val r = apiCall { api.feed(kind = kind, cursor = cursor) }
        if (r is ApiResult.Ok) writeFeedPage(key, r.value, replace = false)
        return if (r is ApiResult.Ok) ApiResult.Ok(Unit) else (r as? ApiResult.Err ?: ApiResult.Offline)
    }

    private suspend fun writeFeedPage(key: String, page: FeedResponse, replace: Boolean) {
        db.withTransaction {
            val start = if (replace) { db.feed().clear(key); 0 } else db.feed().maxPosition(key) + 1
            val entries = mutableListOf<FeedEntryEntity>()
            val posts = mutableListOf<PostEntity>()
            page.items.forEachIndexed { i, obj ->
                val kind = obj["kind"]?.jsonPrimitive?.content
                if (kind == PostKind.PLACED_TRIP) {
                    val trip = obj["trip"]?.let { runCatching { AppJson.decodeFromJsonElement(tripS, it) }.getOrNull() } ?: return@forEachIndexed
                    entries += FeedEntryEntity(key, start + i, PostKind.PLACED_TRIP, trip.slug, tripS.enc(trip))
                } else {
                    val post = runCatching { AppJson.decodeFromJsonElement(postS, obj) }.getOrNull() ?: return@forEachIndexed
                    val existing = db.posts().get(post.id)
                    posts += PostEntity(post.id, existing?.clientId, post.kind, postS.enc(post),
                        if (post.status == "held") LocalState.HELD else LocalState.SYNCED, existing?.prompts)
                    entries += FeedEntryEntity(key, start + i, "post", post.id)
                }
            }
            db.posts().upsertAll(posts)
            db.feed().insertAll(entries)
            db.feed().upsertMeta(FeedMetaEntity(key, page.nextCursor, page.caughtUp, ListSerializer(tripS).enc(page.nextDepartures), System.currentTimeMillis()))
        }
    }

    // ---------- Posts ----------

    fun observePost(id: String): Flow<PostItem?> = db.posts().observe(id).map { e ->
        e?.let { postS.decOrNull(it.json)?.let { p -> PostItem(p, it.localState, it.prompts?.split(',').orEmpty().filter { s -> s.isNotBlank() }) } }
    }

    fun observeComments(postId: String): Flow<List<CommentThread>> = db.comments().observe(postId).map { rows ->
        val pending = rows.filter { it.localState != LocalState.SYNCED }.map { it.id }.toSet()
        val all = rows.mapNotNull { Comment.serializer().decOrNull(it.json) }
        val replies = all.filter { it.parentId != null }.groupBy { it.parentId }
        all.filter { it.parentId == null }.map { c -> CommentThread(c, replies[c.id].orEmpty(), pending) }
    }

    fun observeOffers(postId: String): Flow<List<HostOffer>> =
        db.cache().observeAs("offers:$postId", ListSerializer(HostOffer.serializer())).map { it.orEmpty() }

    suspend fun refreshPost(id: String): ApiResult<PostDetailResponse> {
        val r = apiCall { api.post(id) }
        if (r is ApiResult.Ok) {
            val d = r.value
            applyPost(d.post)
            val flat = d.comments.flatMap { c -> listOf(c.copy(replies = emptyList())) + c.replies.map { it.copy(parentId = c.id) } }
            db.withTransaction {
                db.comments().clearSynced(id)
                db.comments().upsertAll(flat.map { CommentEntity(it.id, it.postId, it.parentId, null, Comment.serializer().enc(it), it.createdAt) })
            }
            db.cache().putAs("offers:$id", ListSerializer(HostOffer.serializer()), d.offers)
        }
        if (r is ApiResult.Err && r.status == 404) { db.posts().delete(id); db.feed().removeRefs(listOf(id)) }
        return r
    }

    suspend fun applyPost(post: Post) {
        val existing = db.posts().get(post.id)
        db.posts().upsert(PostEntity(post.id, existing?.clientId, post.kind, postS.enc(post),
            if (post.status == "held") LocalState.HELD else LocalState.SYNCED, existing?.prompts, existing?.sortAt ?: System.currentTimeMillis()))
    }

    suspend fun applyPosts(posts: List<Post>) = posts.forEach { applyPost(it) }

    private suspend fun updatePost(id: String, f: (Post) -> Post): Post? {
        val e = db.posts().get(id) ?: return null
        val p = postS.decOrNull(e.json) ?: return null
        val n = f(p)
        db.posts().upsert(e.copy(json = postS.enc(n)))
        return n
    }

    suspend fun markLocalPostState(clientId: String, state: String) {
        db.posts().byClientId(clientId)?.let { db.posts().upsert(it.copy(localState = state)) }
    }

    // ---------- Reactions, save ----------

    suspend fun toggleReaction(postId: String, kind: String) {
        if (!requireCanPost()) return
        var added = false
        updatePost(postId) { p ->
            added = kind !in p.myReactions
            val d = if (added) 1 else -1
            val rx = when (kind) {
                ReactionKind.WANT_TO_GO -> p.reactions.copy(wantToGo = (p.reactions.wantToGo + d).coerceAtLeast(0))
                ReactionKind.HELPFUL -> p.reactions.copy(helpful = (p.reactions.helpful + d).coerceAtLeast(0))
                else -> p.reactions.copy(love = (p.reactions.love + d).coerceAtLeast(0))
            }
            p.copy(reactions = rx, myReactions = if (added) p.myReactions + kind else p.myReactions - kind)
        } ?: return
        val target = "$postId/$kind"
        if (added) {
            if (!outbox.cancelOpposite(OutboxType.UNREACT, target)) outbox.enqueue(OutboxType.REACT, targetId = target)
            analytics.track("post.react", "post_detail", mapOf("kind" to kind))
        } else if (!outbox.cancelOpposite(OutboxType.REACT, target)) outbox.enqueue(OutboxType.UNREACT, targetId = target)
    }

    suspend fun applyReactions(postId: String, r: ReactionsResponse) {
        updatePost(postId) { it.copy(reactions = r.reactions, myReactions = r.myReactions) }
    }

    suspend fun toggleSave(postId: String) {
        if (!requireSignedIn()) return
        var saved = false
        updatePost(postId) { p -> saved = !p.viewer.saved; p.copy(viewer = p.viewer.copy(saved = saved)) } ?: return
        if (saved) { if (!outbox.cancelOpposite(OutboxType.UNSAVE, postId)) outbox.enqueue(OutboxType.SAVE, targetId = postId) }
        else if (!outbox.cancelOpposite(OutboxType.SAVE, postId)) outbox.enqueue(OutboxType.UNSAVE, targetId = postId)
    }

    // ---------- Comments ----------

    suspend fun addComment(postId: String, body: String, parentId: String? = null, pollChoice: String? = null) {
        if (!requireCanPost()) return
        val clientId = UUID.randomUUID().toString()
        val c = Comment("local:$clientId", postId, parentId, account.meLite(), body.trim(), pollChoice, Instant.now().toString())
        db.comments().upsert(CommentEntity(c.id, postId, parentId, clientId, Comment.serializer().enc(c), c.createdAt, LocalState.SENDING))
        updatePost(postId) { p ->
            val poll = p.poll?.let { poll -> if (pollChoice != null && poll.myChoice == null) poll.copy(myChoice = pollChoice, options = poll.options.map { o -> if (o.id == pollChoice) o.copy(votes = o.votes + 1) else o }) else poll }
            p.copy(commentCount = p.commentCount + 1, poll = poll)
        }
        outbox.enqueue(OutboxType.COMMENT, AppJson.encodeToJsonElement(CommentRequest.serializer(), CommentRequest(clientId, body.trim(), parentId, pollChoice)).jsonObject, targetId = postId, clientId = clientId)
        analytics.track("post.comment", "post_detail")
    }

    /** Polls are answered with a comment carrying `pollChoice` (contract: Comment.pollChoice). */
    suspend fun vote(postId: String, option: PollOption) = addComment(postId, option.label, null, option.id)

    suspend fun applyComment(clientId: String, c: Comment) {
        db.withTransaction {
            db.comments().byClientId(clientId)?.let { db.comments().delete(it.id) }
            db.comments().upsert(CommentEntity(c.id, c.postId, c.parentId, clientId, Comment.serializer().enc(c.copy(replies = emptyList())), c.createdAt))
        }
    }

    suspend fun markCommentFailed(clientId: String) {
        db.comments().byClientId(clientId)?.let { db.comments().upsert(it.copy(localState = LocalState.FAILED)) }
    }

    suspend fun deleteComment(id: String): ApiResult<Unit> {
        val r = apiUnit { api.deleteComment(id) }
        if (r is ApiResult.Ok) db.comments().delete(id)
        return r
    }

    // ---------- Join ----------

    suspend fun requestJoin(postId: String, intro: String) {
        if (!requireCanPost()) return
        val me = account.meLite()
        updatePost(postId) { p ->
            val seats = p.seats.toMutableList()
            val i = seats.indexOfFirst { it.state == SeatState.OPEN }
            if (i >= 0) seats[i] = Seat(SeatState.REQUESTED, me)
            p.copy(seats = seats, viewer = p.viewer.copy(membership = "requested", canJoin = false))
        }
        db.outbox().deletePending(OutboxType.WITHDRAW, postId)
        outbox.enqueue(OutboxType.JOIN, buildJsonObject { put("intro", intro.trim()) }, targetId = postId)
        analytics.track("plan.join_request", "post_detail")
        events.emit(AppEvent.AskNotificationPermission)
    }

    suspend fun withdraw(postId: String) {
        val meId = account.meLite().id
        updatePost(postId) { p ->
            p.copy(seats = p.seats.map { if (it.state == SeatState.REQUESTED && it.user?.id == meId) Seat(SeatState.OPEN) else it },
                viewer = p.viewer.copy(membership = "withdrawn", canJoin = true))
        }
        if (!outbox.cancelOpposite(OutboxType.JOIN, postId)) outbox.enqueue(OutboxType.WITHDRAW, targetId = postId)
    }

    suspend fun applyJoin(postId: String, r: JoinResponse) {
        updatePost(postId) { it.copy(viewer = it.viewer.copy(membership = r.membership)) }
    }

    suspend fun revertJoin(postId: String, reason: String) {
        val meId = account.meLite().id
        updatePost(postId) { p ->
            p.copy(seats = p.seats.map { if (it.state == SeatState.REQUESTED && it.user?.id == meId) Seat(SeatState.OPEN) else it },
                viewer = p.viewer.copy(membership = null, canJoin = reason != "forbidden"))
        }
    }

    // ---------- Organiser: requests and offers ----------

    fun observeRequests(postId: String): Flow<List<JoinRequestItem>> =
        db.cache().observeAs("requests:$postId", ListSerializer(JoinRequestItem.serializer())).map { it.orEmpty() }

    suspend fun refreshRequests(postId: String): ApiResult<RequestsResponse> {
        val r = apiCall { api.requests(postId) }
        if (r is ApiResult.Ok) db.cache().putAs("requests:$postId", ListSerializer(JoinRequestItem.serializer()), r.value.items)
        return r
    }

    suspend fun decide(postId: String, userId: String, approve: Boolean) {
        val key = "requests:$postId"
        val list = db.cache().getAs(key, ListSerializer(JoinRequestItem.serializer())).orEmpty()
        db.cache().putAs(key, ListSerializer(JoinRequestItem.serializer()), list.map { if (it.user.id == userId) it.copy(state = if (approve) "approved" else "declined") else it })
        outbox.enqueue(OutboxType.DECIDE, buildJsonObject { put("userId", userId); put("decision", if (approve) "approve" else "decline") }, targetId = postId)
        if (approve) analytics.track("plan.approve", "activity")
    }

    suspend fun makeOffer(postId: String, req: OfferRequest) = apiCall { api.makeOffer(postId, req) }
    suspend fun acceptOffer(offerId: String, expectedPricePaise: Long) = apiCall { api.acceptOffer(offerId, AcceptOfferRequest(expectedPricePaise)) }
    suspend fun declineOffer(offerId: String) = apiUnit { api.declineOffer(offerId) }

    // ---------- Publish (optimistic) ----------

    /**
     * Inserts the post locally as "sending" right away, compresses photos to app storage,
     * queues uploads (UploadWorker) and the POST /posts outbox item. Returns the local id.
     */
    suspend fun publish(draft: PostDraft, mediaUris: List<Uri>): String {
        val clientId = UUID.randomUUID().toString()
        val localId = "local:$clientId"
        val me = account.meLite()
        val now = Instant.now().truncatedTo(ChronoUnit.SECONDS).toString()
        val spots = draft.spotsTotal ?: 0
        val seats = if (draft.kind == PostKind.PLAN) listOf(Seat(SeatState.YOU, me)) + List((spots - 1).coerceAtLeast(0)) { Seat(SeatState.OPEN) } else emptyList()
        val preview = Post(
            id = localId, kind = draft.kind, author = me, title = draft.title, body = draft.body, place = draft.place,
            startsOn = draft.startsOn, endsOn = draft.endsOn, spotsTotal = draft.spotsTotal, memberCount = if (draft.kind == PostKind.PLAN) 1 else 0,
            audience = draft.audience ?: "anyone", estCostText = draft.estCostText, media = mediaUris.map { Media(it.toString()) }, trip = draft.trip,
            poll = draft.poll?.let { opts -> Poll(opts.mapIndexed { i, l -> PollOption("local-$i", l) }) },
            seats = seats, createdAt = now, updatedAt = now,
            viewer = Viewer(isAuthor = true, membership = if (draft.kind == PostKind.PLAN) "approved" else null), meetingPoint = draft.meetingPoint,
        )
        db.posts().upsert(PostEntity(localId, clientId, draft.kind, postS.enc(preview), LocalState.SENDING))
        val req = CreatePostRequest(
            clientId = clientId, kind = draft.kind, title = draft.title, body = draft.body, place = draft.place,
            startsOn = draft.startsOn, endsOn = draft.endsOn, spotsTotal = draft.spotsTotal, audience = draft.audience,
            estCostText = draft.estCostText, meetingPoint = draft.meetingPoint, tripPackageId = draft.trip?.id,
            showOnTripPage = draft.showOnTripPage, poll = draft.poll, tagUserIds = draft.tagUsers.map { it.id }.ifEmpty { null },
        )
        val payload = AppJson.encodeToJsonElement(CreatePostRequest.serializer(), req).jsonObject
        if (mediaUris.isEmpty()) {
            outbox.enqueue(OutboxType.CREATE_POST, payload, targetId = localId, clientId = clientId)
        } else {
            outbox.enqueue(OutboxType.CREATE_POST, payload, targetId = localId, clientId = clientId, kick = false)
            scope.launch { prepareUploads(clientId, localId, mediaUris, if (draft.kind == PostKind.STORY) "story" else "post") }
        }
        return localId
    }

    private suspend fun prepareUploads(clientId: String, localId: String, uris: List<Uri>, purpose: String) {
        val dir = File(context.filesDir, "outbox_media").apply { mkdirs() }
        val rows = uris.take(6).mapIndexedNotNull { i, uri ->
            runCatching {
                val out = File(dir, "${clientId}_$i.jpg")
                compressor.compress(uri, out)
                PendingMediaEntity("$clientId:$i", clientId, i, out.absolutePath, purpose = purpose)
            }.getOrNull()
        }
        if (rows.isEmpty()) { markLocalPostState(clientId, LocalState.FAILED); events.emit(AppEvent.Message("Couldn't read those photos.")); return }
        db.media().upsertAll(rows)
        // Point the optimistic post at the compressed copies (stable after the picker grant expires).
        updatePost(localId) { p -> p.copy(media = rows.map { Media(Uri.fromFile(File(it.localPath)).toString()) }) }
        Outbox.scheduleUpload(context, clientId)
    }

    /** Called by the outbox executor after POST /posts succeeds. */
    suspend fun applyCreated(clientId: String, localId: String, r: CreatePostResponse) {
        val held = r.moderation.state == "held" || r.post.status == "held"
        db.withTransaction {
            db.posts().delete(localId)
            db.posts().upsert(PostEntity(r.post.id, clientId, r.post.kind, postS.enc(r.post), if (held) LocalState.HELD else LocalState.SYNCED,
                r.moderation.prompts.joinToString(",").ifEmpty { null }))
            if (!held) {
                // Newest first: a negative, decreasing position sorts above the server page.
                val pos = -(System.currentTimeMillis() / 1000).toInt()
                listOf(feedKey(null), feedKey(r.post.kind)).forEach { key ->
                    db.feed().insertAll(listOf(FeedEntryEntity(key, pos, "post", r.post.id)))
                }
            }
        }
        db.media().deleteOwner(clientId)
        File(context.filesDir, "outbox_media").listFiles { f -> f.name.startsWith(clientId) }?.forEach { it.delete() }
        analytics.track("post.create", "compose", mapOf("kind" to r.post.kind, "held" to held))
        if (held || r.moderation.prompts.isNotEmpty()) events.emit(AppEvent.PostHeld(r.post.id, r.moderation.prompts))
        events.emit(AppEvent.AskNotificationPermission)
    }

    suspend fun cancelPlan(postId: String) = apiCall { api.patchPost(postId, PatchPostRequest(status = "cancelled")) }.also {
        if (it is ApiResult.Ok) applyPost(it.value.body()?.post ?: return@also)
    }

    suspend fun editHeldPost(postId: String, title: String?, body: String?, estCostText: String?): ApiResult<Unit> {
        val r = apiCall { api.patchPost(postId, PatchPostRequest(title = title, body = body, estCostText = estCostText)) }
        if (r is ApiResult.Ok) {
            val resp = r.value.body() ?: return ApiResult.Ok(Unit)
            val held = resp.moderation.state == "held"
            val e = db.posts().get(postId)
            db.posts().upsert(PostEntity(resp.post.id, e?.clientId, resp.post.kind, postS.enc(resp.post), if (held) LocalState.HELD else LocalState.SYNCED,
                resp.moderation.prompts.joinToString(",").ifEmpty { null }))
            if (!held) db.feed().insertAll(listOf(FeedEntryEntity(feedKey(null), -(System.currentTimeMillis() / 1000).toInt(), "post", resp.post.id)))
            return ApiResult.Ok(Unit)
        }
        return r as? ApiResult.Err ?: ApiResult.Offline
    }

    suspend fun deleteLocalOrRemote(postId: String) {
        if (postId.startsWith("local:")) {
            val clientId = postId.removePrefix("local:")
            db.outbox().byClientId(clientId)?.let { db.outbox().delete(it.id) }
            db.media().deleteOwner(clientId)
            db.posts().delete(postId)
        } else {
            if (apiUnit { api.deletePost(postId) } is ApiResult.Ok) { db.posts().delete(postId); db.feed().removeRefs(listOf(postId)) }
        }
    }

    fun observeUploads(clientId: String): Flow<List<PendingMediaEntity>> = db.media().observeOwner(clientId)

    // ---------- Safety ----------

    suspend fun report(targetType: String, targetId: String, reason: String, details: String?) =
        apiCall { api.report(ReportRequest(targetType, targetId, reason, details)) }

    suspend fun block(userId: String): ApiResult<Unit> {
        val r = apiUnit { api.block(BlockRequest(userId)) }
        if (r is ApiResult.Ok) {
            // Hide the blocked person's posts from cached feeds right away; the server excludes them next refresh.
            val blocked = db.cache().getAs(KEY_BLOCKED, ListSerializer(String.serializer())).orEmpty()
            db.cache().putAs(KEY_BLOCKED, ListSerializer(String.serializer()), (blocked + userId).distinct())
            scope.launch { refreshFeed(null) }
        }
        return r
    }

    // ---------- Profiles ----------

    fun observeProfile(username: String): Flow<ProfileResponse?> = db.cache().observeAs("user:$username", ProfileResponse.serializer())

    suspend fun refreshProfile(username: String): ApiResult<ProfileResponse> {
        val r = apiCall { api.user(username) }
        if (r is ApiResult.Ok) {
            db.cache().putAs("user:$username", ProfileResponse.serializer(), r.value)
            applyPosts(r.value.posts)
        }
        return r
    }

    suspend fun openDirectChat(userId: String) = apiCall { api.directChat(DirectChatRequest(userId)) }

    private fun requireSignedIn(): Boolean {
        if (!account.isSignedIn.value) { events.emit(AppEvent.NeedsSignIn); return false }
        return true
    }

    private fun requireCanPost(): Boolean {
        if (!requireSignedIn()) return false
        if (!account.canPost) { events.emit(AppEvent.NeedsPhone); return false }
        return true
    }

    fun canPostOrPrompt(): Boolean = requireCanPost()
}
