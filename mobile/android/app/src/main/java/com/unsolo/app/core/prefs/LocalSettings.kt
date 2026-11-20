package com.unsolo.app.core.prefs

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.unsolo.app.core.net.AppJson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import java.time.LocalDate
import java.util.UUID

private val Context.dataStore by preferencesDataStore(name = "unsolo_local")

/** Device-local settings. Nothing secret lives here (tokens are in TokenStore). */
data class LocalPrefs(
    val landingTab: String = Tab.EXPLORE,
    val dataSaver: Boolean = false,
    val anonId: String = "",
    val notifPermissionAsked: Boolean = false,
    val landingPromptDismissed: Boolean = false,
    val landingPromptLastShown: Long = 0,
    val lastSyncAt: String? = null,
    val welcomeSeen: Boolean = false,
    val nearMe: Boolean = false,
    /** epochDay → (tab → opens) for the last 14 days. */
    val visits: Map<Long, Map<String, Int>> = emptyMap(),
)

object Tab {
    const val EXPLORE = "explore"
    const val TRIBE = "tribe"
    const val TRIPS = "trips"
    const val YOU = "you"
    val landingChoices = listOf(EXPLORE, TRIBE, TRIPS)
    fun label(tab: String) = when (tab) { TRIBE -> "Tribe"; TRIPS -> "My trips"; YOU -> "You"; else -> "Explore" }
}

class LocalSettings(private val context: Context) {
    private object K {
        val landing = stringPreferencesKey("landing_tab")
        val dataSaver = booleanPreferencesKey("data_saver")
        val anonId = stringPreferencesKey("anon_id")
        val notifAsked = booleanPreferencesKey("notif_asked")
        val landingDismissed = booleanPreferencesKey("landing_dismissed")
        val landingShown = longPreferencesKey("landing_shown")
        val lastSync = stringPreferencesKey("last_sync")
        val welcomeSeen = booleanPreferencesKey("welcome_seen")
        val nearMe = booleanPreferencesKey("near_me")
        val visits = stringPreferencesKey("tab_visits")
    }

    private val visitsSerializer = MapSerializer(Long.serializer(), MapSerializer(String.serializer(), Int.serializer()))

    val data: Flow<LocalPrefs> = context.dataStore.data.map { it.toLocal() }

    suspend fun current(): LocalPrefs = data.first()

    private fun Preferences.toLocal() = LocalPrefs(
        landingTab = this[K.landing]?.takeIf { it in Tab.landingChoices } ?: Tab.EXPLORE,
        dataSaver = this[K.dataSaver] ?: false,
        anonId = this[K.anonId] ?: "",
        notifPermissionAsked = this[K.notifAsked] ?: false,
        landingPromptDismissed = this[K.landingDismissed] ?: false,
        landingPromptLastShown = this[K.landingShown] ?: 0,
        lastSyncAt = this[K.lastSync],
        welcomeSeen = this[K.welcomeSeen] ?: false,
        nearMe = this[K.nearMe] ?: false,
        visits = this[K.visits]?.let { runCatching { AppJson.decodeFromString(visitsSerializer, it) }.getOrNull() } ?: emptyMap(),
    )

    suspend fun anonId(): String {
        val existing = current().anonId
        if (existing.isNotEmpty()) return existing
        val id = UUID.randomUUID().toString()
        context.dataStore.edit { it[K.anonId] = id }
        return id
    }

    suspend fun setLandingTab(tab: String) { if (tab in Tab.landingChoices) context.dataStore.edit { it[K.landing] = tab } }
    suspend fun setDataSaver(on: Boolean) { context.dataStore.edit { it[K.dataSaver] = on } }
    suspend fun setNotifAsked() { context.dataStore.edit { it[K.notifAsked] = true } }
    suspend fun setLandingDismissed(v: Boolean) { context.dataStore.edit { it[K.landingDismissed] = v } }
    suspend fun setLandingShown(at: Long) { context.dataStore.edit { it[K.landingShown] = at } }
    suspend fun setLastSync(at: String?) { context.dataStore.edit { if (at == null) it.remove(K.lastSync) else it[K.lastSync] = at } }
    suspend fun setWelcomeSeen() { context.dataStore.edit { it[K.welcomeSeen] = true } }
    suspend fun setNearMe(on: Boolean) { context.dataStore.edit { it[K.nearMe] = on } }

    /** Counts a tab open for the landing-tab suggestion; keeps a rolling 14-day window. */
    suspend fun recordVisit(tab: String, today: Long = LocalDate.now().toEpochDay()) {
        context.dataStore.edit { p ->
            val current = p[K.visits]?.let { runCatching { AppJson.decodeFromString(visitsSerializer, it) }.getOrNull() } ?: emptyMap()
            val updated = LandingPolicy.addVisit(current, tab, today)
            p[K.visits] = AppJson.encodeToString(visitsSerializer, updated)
        }
    }

    suspend fun clearAccountScoped() {
        context.dataStore.edit {
            it.remove(K.lastSync); it.remove(K.landingDismissed); it.remove(K.landingShown)
        }
    }
}

/** Pure logic for the "Start the app on Tribe?" prompt. Unit-tested in LandingPolicyTest. */
object LandingPolicy {
    const val WINDOW_DAYS = 14
    const val MIN_OPENS = 3
    /** Do not show the prompt again within this many ms after it was shown. */
    const val COOLDOWN_MS = 7L * 24 * 60 * 60 * 1000
    private val suggestable = setOf(Tab.TRIBE, Tab.TRIPS)

    fun addVisit(visits: Map<Long, Map<String, Int>>, tab: String, today: Long): Map<Long, Map<String, Int>> {
        if (tab !in Tab.landingChoices) return prune(visits, today)
        val day = visits[today].orEmpty()
        return prune(visits + (today to (day + (tab to (day[tab] ?: 0) + 1))), today)
    }

    fun prune(visits: Map<Long, Map<String, Int>>, today: Long) = visits.filterKeys { it > today - WINDOW_DAYS && it <= today }

    fun totals(visits: Map<Long, Map<String, Int>>, today: Long): Map<String, Int> {
        val out = mutableMapOf<String, Int>()
        prune(visits, today).values.forEach { day -> day.forEach { (tab, n) -> out[tab] = (out[tab] ?: 0) + n } }
        return out
    }

    /** Mirrors the server rule so guests and offline launches behave the same way. */
    fun localSuggestion(visits: Map<Long, Map<String, Int>>, today: Long, currentLanding: String): String? {
        val t = totals(visits, today)
        val (tab, opens) = t.maxByOrNull { it.value } ?: return null
        if (opens < MIN_OPENS || tab !in suggestable || tab == currentLanding) return null
        // A strict winner only: ties do not prompt.
        if (t.count { it.value == opens } > 1) return null
        return tab
    }

    /**
     * @param serverSuggest the server's answer when we have one (signed in and online); `null` result
     * from the server is authoritative. Pass [serverAvailable] = false for guests or when offline.
     */
    fun decide(
        serverAvailable: Boolean,
        serverSuggest: String?,
        localVisits: Map<Long, Map<String, Int>>,
        today: Long,
        currentLanding: String,
        dismissed: Boolean,
        lastShownAt: Long,
        now: Long,
    ): String? {
        if (dismissed) return null
        if (lastShownAt > 0 && now - lastShownAt < COOLDOWN_MS) return null
        val pick = if (serverAvailable) serverSuggest else localSuggestion(localVisits, today, currentLanding)
        return pick?.takeIf { it in suggestable && it != currentLanding }
    }
}
