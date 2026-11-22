package com.unsolo.app.ui.nav

import android.net.Uri
import java.net.URLEncoder

/** Routes for Navigation Compose. String routes keep deep links declarative. */
object Routes {
    const val EXPLORE = "explore"
    const val TRIBE = "tribe"
    const val TRIPS = "trips"
    const val YOU = "you"
    const val TRIP = "trip/{slug}"
    const val POST = "post/{id}"
    const val PROFILE = "profile/{username}"
    const val CHAT = "chat/{roomId}"
    const val INBOX = "inbox"
    const val ACTIVITY = "activity"
    const val SETTINGS = "settings"
    const val AUTH = "auth"
    const val PHONE = "phone"
    const val COMPOSE = "compose/{kind}"
    const val HOST = "host"
    const val OFFER_FORM = "offer/{postId}"
    const val OFFERS = "offers/{postId}"
    const val SEARCH = "search"
    const val STORY = "story/{id}"
    const val STATUS = "status/{authorId}"
    const val STATUS_NEW = "status-new?archive={archive}"
    const val STATUS_ARCHIVE = "status-archive"
    const val LEADERBOARD = "leaderboard"
    const val LEGAL = "legal/{page}"
    const val PEOPLE = "people/{username}/{kind}"
    const val EDIT_PROFILE = "edit-profile"
    const val REFERRALS = "referrals"
    const val OFFERS_ALL = "offers-all"
    const val SOS = "sos?booking={booking}"
    const val PACK = "pack/{bookingId}"
    const val REVIEW = "review/{bookingId}"
    const val BUDDIES = "buddies"
    const val EXPLORE_MAP = "explore-map?category={category}"
    const val GROUP_MAP = "group-map/{roomId}"
    const val HOST_PLANS = "host-plans"
    const val HOST_TRIP = "host-trip/{id}"
    const val HOST_EDIT = "host-edit?id={id}"
    const val HOST_PAYOUT = "host-payout"
    const val HOST_EARNINGS = "host-earnings"
    fun hostTrip(id: String) = "host-trip/${enc(id)}"
    fun hostEdit(id: String? = null) = if (id == null) "host-edit" else "host-edit?id=${enc(id)}"
    fun sos(bookingId: String? = null) = if (bookingId == null) "sos" else "sos?booking=${enc(bookingId)}"
    fun pack(bookingId: String) = "pack/${enc(bookingId)}"
    fun review(bookingId: String) = "review/${enc(bookingId)}"
    fun exploreMap(category: String = "all") = "explore-map?category=${enc(category)}"
    fun groupMap(roomId: String) = "group-map/${enc(roomId)}"

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    fun trip(slug: String) = "trip/${enc(slug)}"
    fun post(id: String) = "post/${enc(id)}"
    fun profile(username: String) = "profile/${enc(username)}"
    fun chat(roomId: String) = "chat/${enc(roomId)}"
    fun compose(kind: String) = "compose/$kind"
    fun story(postId: String) = "story/${enc(postId)}"
    fun legal(page: String) = "legal/$page"
    fun people(username: String, kind: String) = "people/${enc(username)}/$kind"
    fun status(authorId: String) = "status/${enc(authorId)}"
    fun statusNew(archiveId: String? = null) = if (archiveId == null) "status-new" else "status-new?archive=${enc(archiveId)}"
    fun offerForm(postId: String) = "offer/${enc(postId)}"
    fun offers(postId: String) = "offers/${enc(postId)}"

    val tabs = listOf(EXPLORE, TRIBE, TRIPS, YOU)
}

/**
 * Validation for every externally supplied id/slug (deep links, push links, web links).
 * Navigation Compose matches the patterns; screens refuse anything that fails these checks.
 */
object DeepLinks {
    const val WEB = "https://unsolo.in"
    const val WEB_WWW = "https://www.unsolo.in"
    const val SCHEME = "unsolo://"

    private val idRe = Regex("^[A-Za-z0-9:_-]{1,64}$")
    private val slugRe = Regex("^[a-z0-9][a-z0-9-]{0,119}$")
    private val usernameRe = Regex("^[A-Za-z0-9_.]{2,40}$")

    fun validId(s: String?) = s != null && idRe.matches(s)
    fun validSlug(s: String?) = s != null && slugRe.matches(s)
    fun validUsername(s: String?) = s != null && usernameRe.matches(s)

    /** Internal path from a push or notification (e.g. /tribe/p/<id>) → route, or null if unknown/invalid. */
    fun routeForPath(path: String?): String? {
        val p = sanitizePath(path) ?: return null
        val seg = p.trim('/').split('/')
        return when {
            seg == listOf("tribe") -> Routes.TRIBE
            seg.size == 3 && seg[0] == "tribe" && seg[1] == "p" && validId(seg[2]) -> Routes.post(seg[2])
            seg.size == 2 && seg[0] == "packages" && validSlug(seg[1]) -> Routes.trip(seg[1])
            seg.size == 3 && seg[0] == "listings" && validSlug(seg[2]) -> Routes.trip(seg[2])
            seg == listOf("profile", "edit") -> Routes.EDIT_PROFILE
            seg == listOf("referrals") -> Routes.REFERRALS
            seg == listOf("offers") -> Routes.OFFERS_ALL
            seg == listOf("leaderboard") -> Routes.LEADERBOARD
            seg.size == 2 && seg[0] == "review" && validId(seg[1]) -> Routes.review(seg[1])
            seg == listOf("buddies") -> Routes.BUDDIES
            seg == listOf("host") -> Routes.HOST
            seg == listOf("host", "create") -> Routes.hostEdit()
            seg == listOf("host", "payout") -> Routes.HOST_PAYOUT
            seg.size == 2 && seg[0] == "host" && validId(seg[1]) -> Routes.hostTrip(seg[1])
            seg.size == 3 && seg[0] == "host" && seg[2] == "edit" && validId(seg[1]) -> Routes.hostEdit(seg[1])
            seg == listOf("sos") -> Routes.sos()
            seg.size == 3 && seg[0] == "bookings" && seg[2] == "pack" && validId(seg[1]) -> Routes.pack(seg[1])
            seg == listOf("bookings") -> Routes.TRIPS
            seg.size == 2 && seg[0] == "profile" && validUsername(seg[1]) -> Routes.profile(seg[1])
            seg.size == 2 && seg[0] == "chat" && validId(seg[1]) -> Routes.chat(seg[1])
            seg == listOf("activity") || seg == listOf("notifications") -> Routes.ACTIVITY
            seg == listOf("explore") || p == "/" -> Routes.EXPLORE
            else -> null
        }
    }

    /** Same-site paths only: starts with "/" but not "//" or "/\", no whitespace, no '..'. */
    fun sanitizePath(path: String?): String? {
        if (path.isNullOrEmpty() || path.length > 200 || path.any { it.isWhitespace() }) return null
        if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null
        val clean = path.substringBefore('?').substringBefore('#')
        if (clean.contains("..") || clean.contains('\\')) return null
        if (!Regex("^[A-Za-z0-9/_:.-]+$").matches(clean)) return null
        return clean
    }

    fun routeForUri(uri: Uri?): String? {
        uri ?: return null
        return when (uri.scheme) {
            "https", "http" -> if (uri.host == "unsolo.in" || uri.host == "www.unsolo.in") routeForPath(uri.path ?: "/") else null
            "unsolo" -> routeForPath("/" + listOfNotNull(uri.host, uri.path?.trim('/')).filter { it.isNotEmpty() }.joinToString("/"))
            else -> null
        }
    }
}
