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
    val location: String? = null,
    val statusText: String? = null,
    val statusVisibility: String? = null,
    val instagramUrl: String? = null,
    val websiteUrl: String? = null,
    val travelStyle: List<String> = emptyList(),
    val isVerified: Boolean = false,
    val joinedAt: String? = null,
    // GET /me
    val email: String? = null,
    val phone: String? = null,
    val gender: String? = null,
    val dateOfBirth: String? = null,
    val instagram: String? = null,
    val website: String? = null,
    val usernameChangeAfter: String? = null,
    val tripsPrivate: Boolean = false,
    val statesPrivate: Boolean = false,
    val phonePublic: Boolean = false,
    val emergencyName: String? = null,
    val emergencyPhone: String? = null,
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
data class Rating(val avg: Double = 0.0, val count: Int = 0, val destination: Double? = null, val experience: Double? = null)

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
    val reviews: List<TripReview> = emptyList(),
    val kind: String = "trip",
    val unit: String? = null,
    val webPath: String? = null,
) {
    fun lite() = TripLite(id, slug, title, place, image, priceFromPaise, durationDays, nextDeparture, seatsLeft, seatsTotal, host, goingFaces, kind, unit, webPath)
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

/** A 24-hour status (GET /statuses). */
@Immutable
@Serializable
data class StatusItem(
    val id: String,
    val type: String = "image",
    val media: Media? = null,
    val caption: String? = null,
    val linkUrl: String? = null,
    val bgColor: String? = null,
    val createdAt: String,
    val expiresAt: String,
    val seen: Boolean = false,
    val reactions: Map<String, Int> = emptyMap(),
    val myReaction: String? = null,
    val commentCount: Int = 0,
)

@Serializable
data class StatusReactionRequest(val kind: String?)

@Serializable
data class StatusReactionResponse(val reactions: Map<String, Int> = emptyMap(), val myReaction: String? = null)

@Serializable
data class StatusComment(val id: String, val body: String, val createdAt: String = "", val author: UserLite)

@Serializable
data class StatusCommentsResponse(val items: List<StatusComment> = emptyList())

@Serializable
data class StatusCommentRequest(val body: String)

@Immutable
@Serializable
data class StatusAuthor(val user: UserLite, val items: List<StatusItem> = emptyList(), val unseen: Boolean = false, val latestAt: String = "")

@Serializable
data class StatusesResponse(val authors: List<StatusAuthor> = emptyList())

@Serializable
data class StatusMediaRef(val url: String)

@Serializable
data class CreateStatusRequest(val media: List<StatusMediaRef> = emptyList(), val caption: String? = null, val audience: String = "all")

@Serializable
data class SeenStatusesRequest(val ids: List<String>)

/** GET /places?q= : a suggestion for the place field ([detail] is the state or district). */
@Immutable
@Serializable
data class PlaceHit(val name: String, val slug: String? = null, val lat: Double? = null, val lng: Double? = null, val detail: String? = null) {
    fun toPlace() = Place(name, slug, lat, lng)
}

@Serializable
data class PlacesResponse(val items: List<PlaceHit> = emptyList())

/** GET /people?q= (for @mentions) */
@Serializable
data class PeopleResponse(val items: List<UserLite> = emptyList())

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
    val endDate: String? = null,
    /** On the trip today: SOS, live location, trip pack. */
    val onTrip: Boolean = false,
    val canReview: Boolean = false,
    val reviewed: Boolean = false,
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
    val statusText: String? = null,
    val statusVisibility: String? = null,
    val username: String? = null,
    val location: String? = null,
    val instagram: String? = null,
    val website: String? = null,
    val avatarUrl: String? = null,
    val tripsPrivate: Boolean? = null,
    val statesPrivate: Boolean? = null,
    val phonePublic: Boolean? = null,
    val emergencyName: String? = null,
    val emergencyPhone: String? = null,
)

// ---- Trip safety, alerts, maps (migration 124) ----

@Serializable data class TripReview(val id: String, val rating: Int = 0, val title: String? = null, val body: String? = null, val photos: List<Media> = emptyList(), val createdAt: String = "", val author: UserLite)
@Serializable data class Contact(val name: String? = null, val phone: String? = null)
@Serializable data class SosTrip(val bookingId: String = "", val title: String = "", val slug: String = "", val start: String = "", val end: String = "")
@Serializable data class SosStatus(val onTrip: Boolean = false, val trips: List<SosTrip> = emptyList(), val emergencyContact: Contact? = null, val supportWhatsapp: String? = null)
@Serializable data class SosRequest(val lat: Double? = null, val lng: Double? = null, val accuracy: Double? = null, val note: String? = null, val bookingId: String? = null)
@Serializable data class SosTripRef(val title: String = "", val slug: String = "")
@Serializable data class SosResponse(val id: String, val notified: Map<String, String> = emptyMap(), val trip: SosTripRef? = null, val host: Contact? = null,
                                     val emergencyContact: Contact? = null, val supportWhatsapp: String? = null, val message: String = "")
@Serializable data class SosUpdate(val lat: Double? = null, val lng: Double? = null, val accuracy: Double? = null, val status: String? = null)
@Serializable data class LiveLocationItem(val user: UserLite, val lat: Double, val lng: Double, val accuracy: Double? = null, val startedAt: String = "", val updatedAt: String = "", val expiresAt: String = "", val mine: Boolean = false)
@Serializable data class LiveLocationsResponse(val items: List<LiveLocationItem> = emptyList())
@Serializable data class LiveLocationUpdate(val lat: Double, val lng: Double, val accuracy: Double? = null, val minutes: Int? = null)
@Serializable data class LiveLocationAck(val expiresAt: String = "")
@Serializable data class BuddyTripRef(val slug: String = "", val title: String = "")
@Serializable data class Buddy(val user: UserLite, val score: Int = 0, val reasons: List<String> = emptyList(), val trip: BuddyTripRef? = null, val planId: String? = null)
@Serializable data class BuddiesResponse(val items: List<Buddy> = emptyList())
@Serializable data class MapPin(val kind: String, val id: String, val slug: String? = null, val postId: String? = null, val title: String = "", val place: String? = null,
                                val lat: Double, val lng: Double, val priceFromPaise: Long? = null, val unit: String? = null, val date: String? = null,
                                val seatsLeft: Int? = null, val spotsLeft: Int? = null, val image: Media? = null, val past: Boolean = false,
                                val seatsTotal: Int? = null, val spotsTotal: Int? = null)
@Serializable data class MapPinsResponse(val pins: List<MapPin> = emptyList())
@Serializable data class ReviewCreate(val bookingId: String, val ratingDestination: Int, val ratingExperience: Int, val title: String? = null, val body: String? = null, val photos: List<String> = emptyList())
@Serializable data class IdResponse(val id: String = "")
@Serializable data class SavedSlugs(val slugs: List<String> = emptyList())
@Serializable data class Helpline(val label: String = "", val phone: String = "")
@Serializable data class PackHost(val user: UserLite, val phone: String? = null)
@Serializable data class PackSupport(val whatsapp: String? = null, val email: String? = null)
@Serializable data class TripPack(
    val bookingId: String, val status: String = "", val confirmationCode: String? = null, val guests: Int = 1,
    val startDate: String = "", val endDate: String = "", val departureTime: String? = null, val returnTime: String? = null,
    val totalPaise: Long = 0, val paidPaise: Long = 0, val balancePaise: Long = 0, val specialRequests: String? = null,
    val trip: TripLite, val description: String = "", val includes: List<String> = emptyList(), val cancellationPolicy: String? = null,
    val host: PackHost? = null, val travellers: List<UserLite> = emptyList(), val chatRoomId: String? = null,
    val support: PackSupport = PackSupport(), val helplines: List<Helpline> = emptyList(), val generatedAt: String = "",
)

// ---- Host (docs/revamp/api-v1-host.md) ----

@Serializable data class HostPlace(val name: String = "", val state: String? = null)
@Serializable data class HostDeparture(val date: String, val returnDate: String? = null, val closed: Boolean = false, val cutoff: String? = null, val booked: Int = 0)
@Serializable data class HostTripSummary(
    val id: String, val slug: String = "", val title: String = "", val image: Media? = null, val place: HostPlace? = null,
    val priceFromPaise: Long = 0, val durationDays: Int = 0, val tripDays: Int? = null, val tripNights: Int? = null, val maxGroupSize: Int = 0,
    val moderationStatus: String = "pending", val isActive: Boolean = false, val bookingsPaused: Boolean = false,
    val nextDeparture: String? = null, val departures: List<HostDeparture> = emptyList(),
    val pendingRequests: Int = 0, val approvedRequests: Int = 0, val bookingCount: Int = 0,
)
@Serializable data class HostServiceSummary(val id: String, val slug: String = "", val title: String = "", val type: String = "", val status: String = "pending",
                                            val isActive: Boolean = false, val image: Media? = null, val itemCount: Int = 0, val bookingCount: Int = 0, val webEditPath: String? = null)
@Serializable data class HostStats(val totalTrips: Int = 0, val activeTrips: Int = 0, val pendingRequests: Int = 0, val totalEarnedPaise: Long = 0, val pendingPayoutPaise: Long = 0)
@Serializable data class HostAttention(val kind: String = "", val title: String = "", val body: String? = null, val tripId: String? = null, val listingId: String? = null)
@Serializable data class HostUpcoming(val tripId: String, val title: String = "", val date: String = "", val booked: Int = 0, val maxGroupSize: Int = 0)
@Serializable data class HostDashboard(
    val isHost: Boolean = false, val payoutConfigured: Boolean = false, val stats: HostStats = HostStats(), val attention: List<HostAttention> = emptyList(),
    val trips: List<HostTripSummary> = emptyList(), val services: List<HostServiceSummary> = emptyList(), val upcoming: List<HostUpcoming> = emptyList(),
)
@Serializable data class JoinRequestUser(
    val id: String, val username: String = "", val name: String = "", val avatarUrl: String? = null, val isPhoneVerified: Boolean = false, val isIdVerified: Boolean = false,
    val bio: String? = null, val location: String? = null, val age: Int? = null, val tripsCompleted: Int = 0, val score: Int = 0,
) { fun lite() = UserLite(id = id, username = username, name = name, avatarUrl = avatarUrl, isPhoneVerified = isPhoneVerified, isIdVerified = isIdVerified) }
@Serializable data class JoinRequest(val id: String, val status: String = "pending", val message: String? = null, val hostResponse: String? = null,
                                     val paymentDeadline: String? = null, val createdAt: String = "", val user: JoinRequestUser)
@Serializable data class HostRequests(val pending: List<JoinRequest> = emptyList(), val processed: List<JoinRequest> = emptyList())
@Serializable data class RosterTraveller(val name: String = "", val age: Int? = null, val gender: String? = null)
@Serializable data class RosterLead(val id: String = "", val username: String = "", val name: String = "", val avatarUrl: String? = null, val phone: String? = null) {
    fun lite() = UserLite(id = id, username = username, name = name, avatarUrl = avatarUrl)
}
@Serializable data class RosterBooking(val id: String, val status: String = "", val travelDate: String = "", val confirmationCode: String? = null, val guests: Int = 1,
                                       val lead: RosterLead = RosterLead(), val travellers: List<RosterTraveller> = emptyList(), val coupon: String? = null,
                                       val discountPaise: Long = 0, val refundPaise: Long? = null, val refundStatus: String? = null)
@Serializable data class HostTripDetail(val trip: HostTripSummary, val requests: HostRequests = HostRequests(), val roster: List<RosterBooking> = emptyList(),
                                        val interested: List<UserLite> = emptyList(), val pendingClaims: Int = 0, val webManagePath: String? = null)
@Serializable data class HostTripPatch(val isActive: Boolean? = null, val bookingsPaused: Boolean? = null, val closeDate: HostCloseDate? = null, val cutoff: HostCutoff? = null)
@Serializable data class HostCloseDate(val date: String, val closed: Boolean)
@Serializable data class HostCutoff(val date: String, val cutoff: String?)
@Serializable data class HostDecision(val decision: String, val reason: String? = null)
@Serializable data class HostServicePatch(val isActive: Boolean)
@Serializable data class HostDestination(val id: String, val name: String = "", val state: String? = null)
@Serializable data class HostNewDestination(val name: String, val state: String)
@Serializable data class HostFormOptions(val destinations: List<HostDestination> = emptyList(), val includes: List<String> = emptyList(), val interestTags: List<String> = emptyList(),
                                         val maxGroupSize: Int = 50, val platformFeePercent: Double = 15.0)
@Serializable data class MeetingPoint(val lat: Double, val lon: Double, val label: String = "")
@Serializable data class PriceVariant(val description: String = "", val pricePaise: Long = 0, val compareAtPaise: Long? = null)
@Serializable data class DeparturePair(val date: String, val returnDate: String)
@Serializable data class JoinPrefs(
    val paymentTiming: String = "pay_on_booking", val tokenDepositEnabled: Boolean = false, val tokenAmountPaise: Long? = null,
    val minTripsCompleted: Int? = null, val genderPreference: String? = null, val interestTags: List<String> = emptyList(), val minAge: Int? = null, val maxAge: Int? = null,
)
@Serializable data class TripForm(
    val title: String = "", val destinationId: String = "", val shortDescription: String? = null, val description: String = "", val searchKeywords: String? = null,
    val meetingAddress: String? = null, val meetingPoint: MeetingPoint? = null,
    val pricePaise: Long = 0, val compareAtPaise: Long? = null, val priceVariants: List<PriceVariant> = emptyList(),
    val tripDays: Int = 3, val tripNights: Int = 2, val excludeFirstDayTravel: Boolean = true,
    val departureTime: String = "morning", val returnTime: String = "morning", val maxGroupSize: Int = 12, val difficulty: String = "moderate",
    val departures: List<DeparturePair> = emptyList(), val includes: List<String> = emptyList(), val images: List<String> = emptyList(),
    val joinPreferences: JoinPrefs = JoinPrefs(),
)
@Serializable data class TripSaved(val id: String = "", val slug: String = "", val moderationStatus: String = "pending", val needsReapproval: Boolean = false)
@Serializable data class DeletedTrip(val archived: Boolean = false)
@Serializable data class HostPayout(val method: String? = null, val upiId: String? = null, val bankAccountName: String? = null, val bankAccountNumberMasked: String? = null,
                                    val bankIfsc: String? = null, val configured: Boolean = false)
@Serializable data class HostPayoutUpdate(val method: String, val upiId: String? = null, val bankAccountName: String? = null, val bankAccountNumber: String? = null, val bankIfsc: String? = null)
@Serializable data class EarningTotals(val earnedPaise: Long = 0, val pendingPaise: Long = 0, val paidPaise: Long = 0)
@Serializable data class EarningItem(val bookingId: String = "", val tripTitle: String = "", val travelDate: String? = null, val totalPaise: Long = 0, val platformFeePaise: Long = 0,
                                     val hostPaise: Long = 0, val payoutStatus: String = "pending", val payoutDate: String? = null, val payoutReference: String? = null)
@Serializable data class HostEarnings(val totals: EarningTotals = EarningTotals(), val items: List<EarningItem> = emptyList())

/** GET /me/referrals */
@Serializable
data class ReferralPerson(val username: String = "", val name: String = "", val avatarUrl: String? = null, val status: String = "pending")
@Serializable
data class ReferralsResponse(
    val code: String? = null, val link: String? = null, val creditsPaise: Long = 0,
    val total: Int = 0, val pending: Int = 0, val credited: Int = 0, val people: List<ReferralPerson> = emptyList(),
)

/** GET /offers */
@Serializable
data class OfferItem(val id: String, val name: String = "", val label: String = "", val type: String? = null, val promoCode: String? = null, val validUntil: String? = null)
@Serializable
data class OfferLink(val label: String = "", val path: String = "")
@Serializable
data class OfferCombo(val id: String, val title: String = "", val subtitle: String? = null, val primary: OfferLink = OfferLink(), val secondary: OfferLink = OfferLink())
@Serializable
data class OfferSection(val id: String, val title: String = "", val subtitle: String? = null, val badge: String? = null,
                        val offers: List<OfferItem> = emptyList(), val combos: List<OfferCombo> = emptyList())
@Serializable
data class OffersResponse(val sections: List<OfferSection> = emptyList())

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
    val followsYou: Boolean = false,
    val stats: ProfileStats? = null,
    val phone: ProfilePhone? = null,
    val travel: ProfileTravel? = null,
    val badges: ProfileBadges? = null,
    val listings: List<TripLite> = emptyList(),
    val reviewsWritten: List<ProfileReview> = emptyList(),
    val host: ProfileHost? = null,
    val connections: ProfileConnections? = null,
)

@Serializable
data class ProfileTier(val name: String = "Newcomer", val next: String? = null, val pointsToNext: Int = 0, val percent: Int = 0)

@Serializable
data class ProfileStats(val trips: Int? = null, val states: Int? = null, val reviews: Int = 0, val listings: Int = 0, val points: Int = 0, val rank: Int? = null, val tier: ProfileTier = ProfileTier())

/** [number] only when they made it public or approved your request; otherwise [masked]. */
@Serializable
data class ProfilePhone(val number: String? = null, val masked: String? = null, val request: String? = null, val canRequest: Boolean = false)

@Serializable
data class ProfileTripRef(val title: String, val slug: String? = null, val date: String? = null)

@Serializable
data class ProfileTravel(val states: List<String>? = null, val trips: List<ProfileTripRef> = emptyList(), val mutualPlaces: List<String> = emptyList())

@Serializable
data class Badge(val key: String, val name: String, val description: String = "", val icon: String = "")

@Serializable
data class ProfileBadges(val earned: List<Badge> = emptyList(), val next: List<Badge> = emptyList(), val total: Int = 0)

@Serializable
data class ProfileReview(val id: String, val rating: Int = 0, val body: String? = null, val createdAt: String = "", val subject: String? = null, val slug: String? = null, val reviewer: UserLite? = null)

@Serializable
data class ProfileHost(val travellerCount: Int = 0, val travellers: List<UserLite> = emptyList(), val reviews: List<ProfileReview> = emptyList(), val reviewTotal: Int = 0, val reviewAverage: Double? = null, val reachedOut: List<UserLite> = emptyList())

@Serializable
data class SharedRef(val title: String, val path: String, val kind: String = "trip", val hostedByThem: Boolean = false)

@Serializable
data class RoomRef(val id: String, val name: String)

@Serializable
data class ProfileConnections(val mutual: List<UserLite> = emptyList(), val mutualCount: Int = 0, val rooms: List<RoomRef> = emptyList(), val shared: List<SharedRef> = emptyList())

@Serializable
data class FollowResponse(val isFollowing: Boolean, val followers: Int = 0, val following: Int = 0)

@Serializable
data class PhoneRequestItem(val id: String, val createdAt: String = "", val user: UserLite)

@Serializable
data class PhoneRequestsResponse(val items: List<PhoneRequestItem> = emptyList())

@Serializable
data class PhoneRequestDecision(val approve: Boolean)

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


@Serializable
data class LeaderEntry(val rank: Int? = null, val user: UserLite, val location: String? = null, val points: Int = 0, val trips: Int = 0, val reviews: Int = 0, val states: Int = 0, val monthlyTrips: Int? = null)

@Serializable
data class LeaderMe(val rank: Int? = null, val entry: LeaderEntry? = null)

@Serializable
data class LeaderboardResponse(val entries: List<LeaderEntry> = emptyList(), val monthly: List<LeaderEntry> = emptyList(), val me: LeaderMe? = null)

@Serializable
data class UserListResponse(val items: List<UserLite> = emptyList())
