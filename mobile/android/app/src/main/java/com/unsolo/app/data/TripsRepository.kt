package com.unsolo.app.data

import com.unsolo.app.core.db.AppDatabase
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.ApiService
import com.unsolo.app.core.net.apiCall
import com.unsolo.app.core.prefs.LocalSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Trip-time features: SOS, live location in trip groups, saved trips synced to the server
 * (price-drop and nearly-full alerts), travel buddies, the Explore map, reviews with photos and the
 * offline trip pack (kept on the phone).
 */
class TripsRepository(
    private val db: AppDatabase,
    private val api: ApiService,
    private val settings: LocalSettings,
    private val scope: CoroutineScope,
    private val signedIn: () -> Boolean,
) {
    // ---- Saved trips ----

    /** Saves on the phone at once, then on the server so the alerts work. */
    fun toggleSaved(slug: String) = scope.launch {
        val now = slug !in settings.data.first().savedTrips
        settings.setSavedTrip(slug, now)
        if (signedIn()) apiCall { if (now) api.saveTrip(slug) else api.unsaveTrip(slug) }
    }

    /** After sign-in / on start: send trips saved on this phone, then take the server's list. */
    suspend fun syncSaved() {
        if (!signedIn()) return
        val local = settings.data.first().savedTrips
        if (local.isNotEmpty()) apiCall { api.addSavedTrips(SavedSlugs(local.toList())) }
        (apiCall { api.savedTrips() } as? ApiResult.Ok)?.value?.slugs?.let { settings.addSavedTrips(it) }
    }

    // ---- SOS ----
    suspend fun sosStatus() = apiCall { api.sosStatus() }
    suspend fun sos(r: SosRequest) = apiCall { api.sos(r) }
    suspend fun sosUpdate(id: String, u: SosUpdate) = apiCall { api.sosUpdate(id, u) }

    // ---- Live location ----
    suspend fun liveLocations(roomId: String) = apiCall { api.liveLocations(roomId) }
    suspend fun shareLocation(roomId: String, u: LiveLocationUpdate) = apiCall { api.shareLocation(roomId, u) }
    suspend fun stopLocation(roomId: String) = apiCall { api.stopLocation(roomId) }

    // ---- Buddies, map ----
    suspend fun buddies() = apiCall { api.buddies() }.also { r -> if (r is ApiResult.Ok) db.cache().putAs(KEY_BUDDIES, BuddiesResponse.serializer(), r.value) }
    suspend fun cachedBuddies() = runCatching { db.cache().getAs(KEY_BUDDIES, BuddiesResponse.serializer()) }.getOrNull()
    suspend fun mapPins(category: String) = apiCall { api.mapPins(category) }.also { r -> if (r is ApiResult.Ok) db.cache().putAs("map:$category", MapPinsResponse.serializer(), r.value) }
    suspend fun cachedPins(category: String) = runCatching { db.cache().getAs("map:$category", MapPinsResponse.serializer()) }.getOrNull()

    // ---- Reviews ----
    suspend fun review(r: ReviewCreate) = apiCall { api.review(r) }

    // ---- Offline trip pack ----

    /** The pack kept on this phone (works with no signal). */
    suspend fun savedPack(bookingId: String) = runCatching { db.cache().getAs("pack:$bookingId", TripPack.serializer()) }.getOrNull()

    /** Downloads a fresh pack and keeps it. */
    suspend fun downloadPack(bookingId: String): ApiResult<TripPack> {
        val r = apiCall { api.tripPack(bookingId) }
        if (r is ApiResult.Ok) db.cache().putAs("pack:$bookingId", TripPack.serializer(), r.value)
        return r
    }

    /** Keeps packs for upcoming trips up to date in the background (called when Bookings loads). */
    fun prefetchPacks(bookings: List<Booking>) = scope.launch {
        bookings.filter { it.trip.kind == "trip" && (Fmt14.within(it.travelDate, 14) || it.onTrip) }.take(3).forEach { downloadPack(it.id) }
    }

    companion object { const val KEY_BUDDIES = "buddies" }
}

/** Small date helper without UI dependencies. */
internal object Fmt14 {
    fun within(date: String, days: Long): Boolean = runCatching {
        val d = java.time.LocalDate.parse(date.take(10))
        val today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"))
        !d.isBefore(today.minusDays(1)) && !d.isAfter(today.plusDays(days))
    }.getOrDefault(false)
}
