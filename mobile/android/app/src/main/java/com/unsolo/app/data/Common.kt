package com.unsolo.app.data

import androidx.compose.runtime.Immutable
import com.unsolo.app.core.db.CacheDao
import com.unsolo.app.core.db.CacheEntity
import com.unsolo.app.core.db.LocalState
import com.unsolo.app.core.model.Comment
import com.unsolo.app.core.model.Post
import com.unsolo.app.core.model.TripLite
import com.unsolo.app.core.net.AppJson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.KSerializer

fun <T> KSerializer<T>.enc(v: T): String = AppJson.encodeToString(this, v)
fun <T> KSerializer<T>.dec(s: String): T = AppJson.decodeFromString(this, s)
fun <T> KSerializer<T>.decOrNull(s: String?): T? = s?.let { runCatching { AppJson.decodeFromString(this, it) }.getOrNull() }

fun <T> CacheDao.observeAs(key: String, s: KSerializer<T>): Flow<T?> = observe(key).map { s.decOrNull(it?.json) }
suspend fun <T> CacheDao.getAs(key: String, s: KSerializer<T>): T? = s.decOrNull(get(key)?.json)
suspend fun <T> CacheDao.putAs(key: String, s: KSerializer<T>, v: T) = put(CacheEntity(key, s.enc(v)))

@Immutable
sealed interface FeedItem { val key: String }

@Immutable
data class PostItem(
    val post: Post,
    val localState: String = LocalState.SYNCED,
    val prompts: List<String> = emptyList(),
) : FeedItem {
    override val key: String get() = "p:" + post.id
    val isPending get() = localState == LocalState.SENDING
}

@Immutable
data class PlacedTripItem(val trip: TripLite, val position: Int) : FeedItem {
    override val key: String get() = "t:$position:${trip.slug}"
}

@Immutable
data class FeedState(
    val items: List<FeedItem> = emptyList(),
    val caughtUp: Boolean = false,
    val nextDepartures: List<TripLite> = emptyList(),
    val fetchedAt: Long? = null,
)

@Immutable
data class CommentThread(val comment: Comment, val replies: List<Comment>, val pending: Set<String>)

/** One-shot app-wide events (snackbars, permission moments, held-post prompt). */
sealed interface AppEvent {
    data class Message(val text: String) : AppEvent
    data class PostHeld(val postId: String, val prompts: List<String>) : AppEvent
    data object AskNotificationPermission : AppEvent
    data object NeedsSignIn : AppEvent
    data object NeedsPhone : AppEvent
}

class AppEvents {
    private val _flow = MutableSharedFlow<AppEvent>(extraBufferCapacity = 16)
    val flow: SharedFlow<AppEvent> = _flow
    fun emit(e: AppEvent) { _flow.tryEmit(e) }
}

object MoneyFormat {
    private val inr = java.text.NumberFormat.getIntegerInstance(java.util.Locale("en", "IN"))
    fun rupees(paise: Long): String = "₹" + inr.format(paise / 100)
}
