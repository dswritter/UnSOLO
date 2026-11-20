package com.unsolo.app.core.analytics

import com.unsolo.app.core.db.AppDatabase
import com.unsolo.app.core.db.EventEntity
import com.unsolo.app.core.model.EventDto
import com.unsolo.app.core.model.EventsRequest
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.ApiService
import com.unsolo.app.core.net.AppJson
import com.unsolo.app.core.net.apiUnit
import com.unsolo.app.core.prefs.LocalSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.util.UUID

/**
 * Batched analytics: events go to Room first and are flushed to POST /events (≤50 per call)
 * every 30 s while the app is in the foreground and once when it goes to the background.
 */
class Analytics(
    private val db: AppDatabase,
    private val api: ApiService,
    private val settings: LocalSettings,
    private val scope: CoroutineScope,
) {
    private val nameRegex = Regex("^[a-z][a-z0-9_.]{1,63}$")
    @Volatile var sessionId: String = UUID.randomUUID().toString(); private set
    private var lastBackgroundAt = 0L
    private var ticker: Job? = null
    private val flushLock = Mutex()

    fun track(name: String, screen: String? = null, props: Map<String, Any?> = emptyMap()) {
        if (!nameRegex.matches(name)) return
        scope.launch {
            val obj = JsonObject(props.mapNotNull { (k, v) ->
                when (v) {
                    null -> null
                    is Boolean -> k to JsonPrimitive(v)
                    is Number -> k to JsonPrimitive(v)
                    else -> k to JsonPrimitive(v.toString())
                }
            }.toMap())
            val propsOrNull = obj.takeIf { it.isNotEmpty() && it.toString().length <= 4096 }
            val dto = EventDto(name, screen, propsOrNull, Instant.now().toString(), settings.anonId(), sessionId)
            db.events().insert(EventEntity(json = AppJson.encodeToString(EventDto.serializer(), dto)))
            db.events().trim(2000)
        }
    }

    fun screen(screen: String) = track("screen.view", screen)

    fun onForeground() {
        if (lastBackgroundAt > 0 && System.currentTimeMillis() - lastBackgroundAt > 30 * 60 * 1000) {
            sessionId = UUID.randomUUID().toString()
        }
        ticker?.cancel()
        ticker = scope.launch {
            while (isActive) { delay(30_000); flush() }
        }
    }

    fun onBackground() {
        lastBackgroundAt = System.currentTimeMillis()
        ticker?.cancel(); ticker = null
    }

    /** @return false when the network call failed and the caller should retry later. */
    suspend fun flush(): Boolean = flushLock.withLock {
        while (true) {
            val batch = db.events().batch(50)
            if (batch.isEmpty()) return true
            val events = batch.mapNotNull { runCatching { AppJson.decodeFromString(EventDto.serializer(), it.json) }.getOrNull() }
            when (val r = apiUnit { api.events(EventsRequest(events)) }) {
                is ApiResult.Ok -> db.events().delete(batch.map { it.id })
                is ApiResult.Err -> if (r.status in 400..499 && r.status != 429) db.events().delete(batch.map { it.id }) else return false
                ApiResult.Offline -> return false
            }
        }
        @Suppress("UNREACHABLE_CODE") true
    }
}
