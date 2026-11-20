package com.unsolo.app.data

import androidx.room.withTransaction
import com.unsolo.app.core.db.*
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.ApiService
import com.unsolo.app.core.net.apiCall
import com.unsolo.app.core.sync.Outbox
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.add
import java.time.Instant
import java.util.UUID

class ExploreRepository(private val db: AppDatabase, private val api: ApiService, private val tribe: TribeRepository) {
    private val liteS = TripLite.serializer()
    private val detailS = TripDetail.serializer()

    private fun listKey(category: String, q: String) = "explore:$category:${q.trim().lowercase()}"

    fun observeExplore(category: String, q: String = ""): Flow<List<TripLite>> =
        db.trips().observeList(listKey(category, q)).map { rows -> rows.mapNotNull { liteS.decOrNull(it.liteJson) } }

    suspend fun refreshExplore(category: String, q: String = ""): ApiResult<Unit> {
        val r = apiCall { api.explore(q = q.ifBlank { null }, category = category) }
        if (r !is ApiResult.Ok) return r as? ApiResult.Err ?: ApiResult.Offline
        val key = listKey(category, q)
        db.withTransaction {
            r.value.items.forEach { t ->
                val existing = db.trips().get(t.slug)
                db.trips().upsert(TripEntity(t.slug, liteS.enc(t), existing?.detailJson))
            }
            db.trips().clearList(key)
            db.trips().insertEntries(r.value.items.mapIndexed { i, t -> ExploreEntryEntity(key, i, t.slug) })
        }
        return ApiResult.Ok(Unit)
    }

    /** Detail when cached, else the list row (so the screen opens instantly from Explore). */
    fun observeTrip(slug: String): Flow<Pair<TripLite?, TripDetail?>> = db.trips().observe(slug).map { e ->
        liteS.decOrNull(e?.liteJson) to detailS.decOrNull(e?.detailJson)
    }

    suspend fun refreshTrip(slug: String): ApiResult<TripDetail> {
        val r = apiCall { api.trip(slug) }
        if (r is ApiResult.Ok) {
            db.trips().upsert(TripEntity(slug, liteS.enc(r.value.lite()), detailS.enc(r.value)))
            tribe.applyPosts(r.value.stories)
        }
        return r
    }

    fun observeSuggestions(): Flow<List<Suggestion>> =
        db.cache().observeAs("suggestions", SuggestionsResponse.serializer()).map { it?.items.orEmpty() }

    suspend fun refreshSuggestions(lat: Double?, lng: Double?): ApiResult<SuggestionsResponse> {
        val r = apiCall { api.suggestions(lat, lng) }
        if (r is ApiResult.Ok) {
            db.cache().putAs("suggestions", SuggestionsResponse.serializer(), r.value)
            tribe.applyPosts(r.value.items.mapNotNull { it.post })
        }
        return r
    }

    fun observeMyTrips(): Flow<MyTripsResponse?> = db.cache().observeAs("my_trips", MyTripsResponse.serializer())

    suspend fun refreshMyTrips(): ApiResult<MyTripsResponse> {
        val r = apiCall { api.myTrips() }
        if (r is ApiResult.Ok) {
            db.cache().putAs("my_trips", MyTripsResponse.serializer(), r.value)
            tribe.applyPosts(r.value.plans + r.value.requested)
        }
        return r
    }
}

class ChatRepository(
    private val db: AppDatabase,
    private val api: ApiService,
    private val outbox: Outbox,
    private val account: AccountRepository,
) {
    private val chatS = ChatSummary.serializer()
    private val msgS = ChatMessage.serializer()

    fun observeChats(): Flow<List<ChatSummary>> = db.chats().observe().map { rows -> rows.mapNotNull { chatS.decOrNull(it.json)?.copy(unread = it.unread) } }
    fun observeChat(id: String): Flow<ChatSummary?> = db.chats().observeOne(id).map { e -> e?.let { chatS.decOrNull(it.json)?.copy(unread = it.unread) } }
    fun observeUnread(): Flow<Int> = db.chats().observeUnread()

    suspend fun refreshChats(): ApiResult<Unit> {
        val r = apiCall { api.chats() }
        if (r !is ApiResult.Ok) return r as? ApiResult.Err ?: ApiResult.Offline
        db.withTransaction {
            db.chats().clear()
            db.chats().upsertAll(r.value.items.map { ChatEntity(it.id, chatS.enc(it), it.lastMessage?.at ?: "", it.isRequest, it.unread) })
        }
        return ApiResult.Ok(Unit)
    }

    data class UiMessage(val message: ChatMessage, val state: String, val mine: Boolean)

    fun observeMessages(roomId: String): Flow<List<UiMessage>> {
        return db.messages().observe(roomId).map { rows ->
            val meId = account.meLite().id
            rows.mapNotNull { r -> msgS.decOrNull(r.json)?.let { UiMessage(it, r.localState, it.author.id == meId) } }
        }
    }

    private fun ChatMessage.toEntity(roomId: String) = MessageEntity("s:$id", roomId, id, clientId, msgS.enc(this), createdAt)

    /** Initial load (latest page) or the 4s/15s poll (`after` = newest server message). */
    suspend fun fetch(roomId: String, poll: Boolean): ApiResult<Int> {
        val after = if (poll) db.messages().latestServerTime(roomId) else null
        val r = apiCall { api.messages(roomId, after = after) }
        if (r !is ApiResult.Ok) return r as? ApiResult.Err ?: ApiResult.Offline
        db.messages().upsertServer(r.value.items.map { it.toEntity(roomId) })
        return ApiResult.Ok(r.value.items.size)
    }

    suspend fun send(roomId: String, body: String) {
        val text = body.trim().take(4000)
        if (text.isEmpty()) return
        val clientId = UUID.randomUUID().toString()
        val m = ChatMessage("local", clientId, account.meLite(), text, "text", Instant.now().toString())
        db.messages().insert(MessageEntity("c:$clientId", roomId, null, clientId, msgS.enc(m), m.createdAt, LocalState.SENDING))
        outbox.enqueue(OutboxType.MESSAGE, buildJsonObject { put("body", text) }, targetId = roomId, clientId = clientId)
    }

    suspend fun retry(clientId: String) {
        db.messages().setState(clientId, LocalState.SENDING)
        db.outbox().byClientId(clientId)?.let { db.outbox().update(it.copy(state = "pending", attempts = 0, nextAttemptAt = 0)) }
        outbox.kick()
    }

    suspend fun applySent(roomId: String, m: ChatMessage) = db.messages().upsertServer(listOf(m.toEntity(roomId)))
    suspend fun markFailed(clientId: String) = db.messages().setState(clientId, LocalState.FAILED)

    suspend fun markRead(roomId: String) {
        db.chats().markRead(roomId)
        outbox.replacePending(OutboxType.READ_CHAT, roomId)
    }
}

class ActivityRepository(private val db: AppDatabase, private val api: ApiService, private val outbox: Outbox) {
    private val nS = AppNotification.serializer()

    fun observe(): Flow<List<AppNotification>> = db.notifications().observe().map { rows -> rows.mapNotNull { r -> nS.decOrNull(r.json)?.copy(isRead = r.isRead) } }
    fun observeUnread(): Flow<Int> = db.notifications().observeUnread()

    suspend fun refresh(): ApiResult<Unit> {
        val r = apiCall { api.notifications() }
        if (r !is ApiResult.Ok) return r as? ApiResult.Err ?: ApiResult.Offline
        db.withTransaction {
            db.notifications().clear()
            db.notifications().upsertAll(r.value.items.map { NotificationEntity(it.id, nS.enc(it), it.isRead, it.createdAt) })
        }
        return ApiResult.Ok(Unit)
    }

    suspend fun markRead(ids: List<String>) {
        if (ids.isEmpty()) return
        db.notifications().markRead(ids)
        outbox.enqueue(OutboxType.READ_NOTIFICATIONS, buildJsonObject { putJsonArray("ids") { ids.forEach { add(it) } } })
    }

    suspend fun markAllRead() {
        db.notifications().markAllRead()
        outbox.enqueue(OutboxType.READ_NOTIFICATIONS, buildJsonObject { put("all", true) })
    }
}

