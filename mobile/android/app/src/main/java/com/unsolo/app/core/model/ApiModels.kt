package com.unsolo.app.core.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/*
 * DTOs for docs/revamp/api-v1.md. Field names are the contract's camelCase keys.
 * Shapes written as "UserLite & { ... }" in the contract are modelled as one class with the
 * extra fields optional, so one type can be cached and rendered everywhere.
 */

@Immutable
@Serializable
data class UserLite(
    val id: String,
    val username: String = "",
    val name: String = "",
    val avatarUrl: String? = null,
    val isPhoneVerified: Boolean = false,
    val isIdVerified: Boolean = false,
    val isHost: Boolean = false,
    // GET /posts/{id}/requests
    val tripsCount: Int? = null,
    val reviewsAvg: Double? = null,
    val mutuals: Int? = null,
    // GET /users/{username}
    val bio: String? = null,
    val homeCity: String? = null,
    val followers: Int? = null,
    val following: Int? = null,
    // GET /me
    val email: String? = null,
    val phone: String? = null,
    val gender: String? = null,
    val dateOfBirth: String? = null,
) {
    val initials: String
        get() = name.split(' ', '-', '.').filter { it.isNotBlank() }.take(2)
            .joinToString("") { it.first().uppercase() }.ifEmpty { username.take(2).uppercase() }
    val firstName: String get() = name.substringBefore(' ').ifBlank { username }
}

@Immutable
@Serializable
data class Media(
    val url: String,
    val thumbUrl: String? = null,
    val lqip: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val bytes: Long? = null,
)

@Immutable
@Serializable
data class Place(
    val name: String,
    val slug: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
)

object SeatState {
    const val ORGANISER = "organiser"
    const val HOST = "host"
    const val MEMBER = "member"
    const val YOU = "you"
    const val REQUESTED = "requested"
    const val HELD = "held"
    const val OPEN = "open"
}

@Immutable
@Serializable
data class Seat(val state: String, val user: UserLite? = null)

@Immutable
@Serializable
data class TripLite(
    val id: String,
    val slug: String,
    val title: String,
    val place: Place? = null,
    val image: Media? = null,
    val priceFromPaise: Long = 0,
    val durationDays: Int = 0,
    val nextDeparture: String? = null,
    val seatsLeft: Int? = null,
    val seatsTotal: Int? = null,
    val host: UserLite? = null,
    val goingFaces: List<UserLite> = emptyList(),
    /** "trip" (default), or "stay" / "activity" / "rental": those open on the web at [webPath]. */
    val kind: String = "trip",
    /** Price unit for listings: "night", "person", "day". */
    val unit: String? = null,
    val webPath: String? = null,
) {
    val isListing: Boolean get() = webPath != null && kind != "trip"
}

@Immutable
@Serializable
data class Departure(val date: String, val seatsLeft: Int = 0, val seatsTotal: Int = 0)

@Immutable
@Serializable
data class Rating(val avg: Double = 0.0, val count: Int = 0)

/** GET /trips/{slug}: TripLite & { description, includes, images, departures, seats, rating, stories, planningCount }. */
@Immutable
@Serializable
data class TripDetail(
    val id: String,
    val slug: String,
    val title: String,
    val place: Place? = null,
    val image: Media? = null,
    val priceFromPaise: Long = 0,
    val durationDays: Int = 0,
    val nextDeparture: String? = null,
    val seatsLeft: Int? = null,
    val seatsTotal: Int? = null,
    val host: UserLite? = null,
    val goingFaces: List<UserLite> = emptyList(),
    val description: String = "",
    val includes: List<String> = emptyList(),
    val images: List<Media> = emptyList(),
    val departures: List<Departure> = emptyList(),
    val seats: List<Seat> = emptyList(),
    val rating: Rating? = null,
    val stories: List<Post> = emptyList(),
    val planningCount: Int? = null,
) {
    fun lite() = TripLite(id, slug, title, place, image, priceFromPaise, durationDays, nextDeparture, seatsLeft, seatsTotal, host, goingFaces)
}

object PostKind {
    const val PLAN = "plan"
    const val STORY = "story"
    const val ASK = "ask"
    const val PLACED_TRIP = "placed_trip"
}

@Immutable
@Serializable
data class PollOption(val id: String, val label: String, val votes: Int = 0)

@Immutable
@Serializable
data class Poll(val options: List<PollOption> = emptyList(), val myChoice: String? = null){
    /** Your vote moved to [choice] (null = taken back), counts adjusted locally until the server answers. */
    fun movedTo(choice: String?): Poll = copy(myChoice = choice, options = options.map { o ->
        o.copy(votes = (o.votes - (if (o.id == myChoice) 1 else 0) + (if (o.id == choice) 1 else 0)).coerceAtLeast(0))
    })
}

/** GET /places?q= : a suggestion for the place field ([detail] is the state or district). */
@Immutable
@Serializable
data class PlaceHit(val name: String, val slug: String? = null, val lat: Double? = null, val lng: Double? = null, val detail: String? = null) {
    fun toPlace() = Place(name, slug, lat, lng)
}

@Serializable
data class PlacesResponse(val items: List<PlaceHit> = emptyList())

/** PUT /posts/{id}/vote */
@Serializable
data class VoteRequest(val choice: String?)

@Serializable
data class VoteResponse(val poll: Poll)

@Immutable
@Serializable
data class Reactions(val wantToGo: Int = 0, val helpful: Int = 0, val love: Int = 0)

object ReactionKind {
    const val WANT_TO_GO = "want_to_go"
    const val HELPFUL = "helpful"
    const val LOVE = "love"
    val all = listOf(WANT_TO_GO, HELPFUL, LOVE)
}

@Immutable
@Serializable
data class Viewer(
    val isAuthor: Boolean = false,
    val membership: String? = null,
    val saved: Boolean = false,
    val canJoin: Boolean = false,
    val joinBlockedReason: String? = null,
)

@Immutable
@Serializable
data class Post(
    val id: String,
    val kind: String,
    val author: UserLite,
    val title: String? = null,
    val body: String = "",
    val place: Place? = null,
    val startsOn: String? = null,
    val endsOn: String? = null,
    val spotsTotal: Int? = null,
    val memberCount: Int = 0,
    val audience: String = "anyone",
    val estCostText: String? = null,
    val media: List<Media> = emptyList(),
    val trip: TripLite? = null,
    val poll: Poll? = null,
    val reactions: Reactions = Reactions(),
    val myReactions: List<String> = emptyList(),
    val commentCount: Int = 0,
    val status: String = "live",
    val seats: List<Seat> = emptyList(),
    val createdAt: String = "",
    val updatedAt: String = "",
    val viewer: Viewer = Viewer(),
    val meetingPoint: String? = null,
)

@Immutable
@Serializable
data class Comment(
    val id: String,
    val postId: String,
    val parentId: String? = null,
    val author: UserLite,
    val body: String,
    val pollChoice: String? = null,
    val createdAt: String = "",
    val replies: List<Comment> = emptyList(),
)

@Immutable
@Serializable
data class HostOffer(
    val id: String,
    val postId: String,
    val host: UserLite,
    val pricePaise: Long,
    val includes: List<String> = emptyList(),
    val notes: String? = null,
    val extraSeats: Int = 0,
    val state: String = "pending",
    val expiresAt: String? = null,
    val packageSlug: String? = null,
    val payBy: String? = null,
)

@Immutable
@Serializable
data class Booking(
    val id: String,
    val status: String = "",
    val travelDate: String = "",
    val guests: Int = 1,
    val totalPaise: Long = 0,
    val paidPaise: Long = 0,
    val balancePaise: Long = 0,
    val confirmationCode: String? = null,
    val trip: TripLite,
    val chatRoomId: String? = null,
    val storyPrompt: Boolean = false,
)

@Immutable
@Serializable
data class AppNotification(
    val id: String,
    val type: String = "",
    val category: String = "system",
    val title: String,
    val body: String? = null,
    val link: String? = null,
    val isRead: Boolean = false,
    val createdAt: String = "",
    /** Tribe events: target post and the acting user, for inline actions (e.g. tribe_join_request). */
    val postId: String? = null,
    val actorId: String? = null,
)

@Immutable
@Serializable
data class NotifyChannels(
    val plans: Boolean = true,
    val replies: Boolean = true,
    val messages: Boolean = true,
    val trips: Boolean = true,
    val tags: Boolean = true,
    val marketing: Boolean = false,
)

@Immutable
@Serializable
data class QuietHours(val from: String = "22:00", val to: String = "07:00")

@Immutable
@Serializable
data class Notify(
    val push: NotifyChannels = NotifyChannels(),
    val email: NotifyChannels = NotifyChannels(),
    val quietHours: QuietHours? = QuietHours(),
)

@Immutable
@Serializable
data class Preferences(
    val landingTab: String = "explore",
    val notify: Notify = Notify(),
    val interests: List<String> = emptyList(),
    val suggestByLocation: Boolean = false,
    val suggestByGender: Boolean = false,
    val shareLocation: Boolean = false,
    val dataSaver: Boolean = false,
)

@Serializable
data class Counts(val unreadNotifications: Int = 0, val unreadMessages: Int = 0)

@Serializable
data class MeResponse(
    val user: UserLite,
    val role: String? = null,
    val isStaff: Boolean = false,
    /** Server: a confirmed email or a verified phone (null from older servers → fall back to the phone). */
    val canParticipate: Boolean? = null,
    val preferences: Preferences = Preferences(),
    val counts: Counts = Counts(),
)

@Serializable
data class PatchMeRequest(
    val name: String? = null,
    val bio: String? = null,
    val gender: String? = null,
    val homeCity: String? = null,
    val homeLat: Double? = null,
    val homeLng: Double? = null,
    val dateOfBirth: String? = null,
)

@Serializable
data class Flags(
    val tribeEnabled: Boolean = true,
    val tribePostingEnabled: Boolean = true,
    val hostOffersEnabled: Boolean = true,
    val pushEnabled: Boolean = true,
)

/** The server sends versions as numbers (1) or text ("1.2.0"); both decode to text. */
object VersionTextSerializer : kotlinx.serialization.KSerializer<String?> {
    override val descriptor = kotlinx.serialization.descriptors.PrimitiveSerialDescriptor("VersionText", kotlinx.serialization.descriptors.PrimitiveKind.STRING)
    override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): String? {
        val e = (decoder as? kotlinx.serialization.json.JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeString()
        val p = e as? kotlinx.serialization.json.JsonPrimitive ?: return null
        return if (p is kotlinx.serialization.json.JsonNull) null else p.content
    }
    override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: String?) {
        if (value == null) encoder.encodeNull() else encoder.encodeString(value)
    }
}

@Serializable
data class MinAppVersion(
    @Serializable(with = VersionTextSerializer::class) val android: String? = null,
    @Serializable(with = VersionTextSerializer::class) val ios: String? = null,
)

@Serializable
data class SupabaseConfig(val url: String = "", val anonKey: String = "")

@Serializable
data class UploadConfig(val maxBytes: Long = 2_097_152, val maxEdge: Int = 2048)

@Serializable
data class SupportConfig(val whatsapp: String? = null, val email: String? = null)

@Serializable
data class AppConfig(
    val flags: Flags = Flags(),
    val minAppVersion: MinAppVersion = MinAppVersion(),
    val supabase: SupabaseConfig = SupabaseConfig(),
    val upload: UploadConfig = UploadConfig(),
    val support: SupportConfig = SupportConfig(),
)

@Serializable
data class Visits(val explore: Int = 0, val tribe: Int = 0, val trips: Int = 0)

@Serializable
data class LandingSuggestion(val suggest: String? = null, val visits: Visits = Visits())

/** DELETE /me: the literal "DELETE" guards against stray requests. */
@Serializable
data class DeleteAccountRequest(val confirm: String = "DELETE")

@Serializable
data class DeleteAccountResponse(val deleted: Boolean = false, val mode: String? = null)

@Serializable
data class PhoneStartRequest(val phone: String)

/** POST /auth/phone/start (sign-in with a phone code; 2factor.in on the server). */
@Serializable
data class PhoneAuthStartRequest(val phone: String)

@Serializable
data class PhoneAuthStartResponse(val challenge: String, val expiresIn: Long = 600, val devCode: String? = null)

/** POST /auth/phone/verify → a Supabase session (+ is_new). */
@Serializable
data class PhoneAuthVerifyRequest(val challenge: String, val code: String)

@Serializable
data class PhoneStartResponse(val sent: Boolean = false, val devCode: String? = null)

@Serializable
data class PhoneVerifyRequest(val phone: String, val code: String)

@Serializable
data class PhoneVerifyResponse(val verified: Boolean = false)

@Serializable
data class DeviceRequest(val platform: String, val token: String, val appVersion: String? = null, val locale: String? = null)

@Serializable
data class DeviceDeleteRequest(val token: String)

@Serializable
data class Page<T>(val items: List<T> = emptyList(), val nextCursor: String? = null)

/** GET /feed. Items are Post or { kind: "placed_trip", trip }, so they are decoded in two steps. */
@Serializable
data class FeedResponse(
    val items: List<JsonObject> = emptyList(),
    val nextCursor: String? = null,
    val caughtUp: Boolean = false,
    val nextDepartures: List<TripLite> = emptyList(),
)

@Serializable
data class MyTripsResponse(
    val upcoming: List<Booking> = emptyList(),
    val plans: List<Post> = emptyList(),
    val requested: List<Post> = emptyList(),
    val past: List<Booking> = emptyList(),
)

@Serializable
data class CreatePostRequest(
    val clientId: String,
    val kind: String,
    val title: String? = null,
    val body: String,
    val place: Place? = null,
    val startsOn: String? = null,
    val endsOn: String? = null,
    val spotsTotal: Int? = null,
    val audience: String? = null,
    val estCostText: String? = null,
    val meetingPoint: String? = null,
    val tripPackageId: String? = null,
    val showOnTripPage: Boolean? = null,
    val poll: List<String>? = null,
    val media: List<Media>? = null,
    val tagUserIds: List<String>? = null,
)

@Serializable
data class Moderation(val state: String = "live", val prompts: List<String> = emptyList())

@Serializable
data class CreatePostResponse(val post: Post, val moderation: Moderation = Moderation())

@Serializable
data class PatchPostRequest(
    val title: String? = null,
    val body: String? = null,
    val estCostText: String? = null,
    val meetingPoint: String? = null,
    val status: String? = null,
)

@Serializable
data class PostDetailResponse(
    val post: Post,
    val comments: List<Comment> = emptyList(),
    val offers: List<HostOffer> = emptyList(),
)

@Serializable
data class ReactionsResponse(val reactions: Reactions = Reactions(), val myReactions: List<String> = emptyList())

@Serializable
data class CommentRequest(val clientId: String, val body: String, val parentId: String? = null, val pollChoice: String? = null)

@Serializable
data class JoinRequestBody(val intro: String)

@Serializable
data class JoinResponse(val membership: String = "requested", val expiresAt: String? = null)

@Immutable
@Serializable
data class JoinRequestItem(
    val user: UserLite,
    val intro: String = "",
    val state: String = "requested",
    val createdAt: String = "",
    val expiresAt: String? = null,
)

@Serializable
data class RequestsResponse(val items: List<JoinRequestItem> = emptyList())

@Serializable
data class DecisionRequest(val decision: String)

@Serializable
data class DecisionResponse(val state: String = "")

@Serializable
data class OfferRequest(val pricePaise: Long, val includes: List<String>, val notes: String? = null, val extraSeats: Int? = null)

/** POST /offers/{id}/accept: the price the organiser saw; 409 if the host changed it since. */
@Serializable
data class AcceptOfferRequest(val expectedPricePaise: Long)

@Serializable
data class AcceptOfferResponse(val packageSlug: String? = null, val payBy: String? = null)

@Serializable
data class ProfileResponse(
    val user: UserLite,
    val posts: List<Post> = emptyList(),
    val openPlan: Post? = null,
    val isFollowing: Boolean = false,
)

@Immutable
@Serializable
data class Suggestion(val type: String, val reason: String = "", val post: Post? = null, val trip: TripLite? = null)

@Serializable
data class SuggestionsResponse(val items: List<Suggestion> = emptyList())

@Immutable
@Serializable
data class LastMessage(val body: String = "", val at: String = "", val authorName: String? = null)

@Immutable
@Serializable
data class ChatSummary(
    val id: String,
    val type: String = "direct",
    val name: String = "",
    val image: Media? = null,
    val lastMessage: LastMessage? = null,
    val unread: Int = 0,
    val isRequest: Boolean = false,
)

@Immutable
@Serializable
data class ChatMessage(
    val id: String,
    val clientId: String? = null,
    val author: UserLite,
    val body: String,
    val type: String = "text",
    val createdAt: String,
    val editedAt: String? = null,
)

@Serializable
data class MessagesResponse(val items: List<ChatMessage> = emptyList(), val hasMore: Boolean = false)

@Serializable
data class SendMessageRequest(val clientId: String, val body: String)

@Serializable
data class DirectChatRequest(val userId: String)

@Serializable
data class DirectChatResponse(val roomId: String)

@Serializable
data class ReportRequest(val targetType: String, val targetId: String, val reason: String, val details: String? = null)

@Serializable
data class ReportResponse(val id: String = "")

@Serializable
data class BlockRequest(val userId: String)

@Serializable
data class NotificationsResponse(
    val items: List<AppNotification> = emptyList(),
    val nextCursor: String? = null,
    val unread: Int = 0,
)

@Serializable
data class ReadNotificationsRequest(val ids: List<String>? = null, val all: Boolean? = null)

@Serializable
data class MembershipState(val postId: String, val state: String)

@Serializable
data class SyncResponse(
    val serverTime: String,
    val posts: List<String> = emptyList(),
    val removedPosts: List<String> = emptyList(),
    // The contract does not say whether this is a list or a count; kept raw (see Contract gaps).
    val notifications: JsonElement? = null,
    val unreadNotifications: Int = 0,
    val memberships: List<MembershipState> = emptyList(),
)

@Serializable
data class EventDto(
    val name: String,
    val screen: String? = null,
    val props: JsonObject? = null,
    val ts: String? = null,
    val anonId: String? = null,
    val sessionId: String? = null,
)

@Serializable
data class EventsRequest(val events: List<EventDto>)

@Serializable
data class ApiErrorDetail(val code: String = "server_error", val message: String? = null, val field: String? = null)

@Serializable
data class ApiErrorBody(val error: ApiErrorDetail = ApiErrorDetail())

// ---- Supabase Auth (snake_case, called directly) ----

@Serializable
data class SupaUser(val id: String, val email: String? = null, val phone: String? = null)

@Serializable
data class SupaSession(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    /** Only from POST /auth/phone/verify: the account was just created. */
    @SerialName("is_new") val isNew: Boolean = false,
    @SerialName("expires_in") val expiresIn: Long = 3600,
    @SerialName("expires_at") val expiresAt: Long? = null,
    @SerialName("token_type") val tokenType: String = "bearer",
    val user: SupaUser? = null,
)
