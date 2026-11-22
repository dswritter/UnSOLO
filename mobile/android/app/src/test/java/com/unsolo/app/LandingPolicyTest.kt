package com.unsolo.app

import com.unsolo.app.core.prefs.LandingPolicy
import com.unsolo.app.core.prefs.Tab
import org.junit.Assert.*
import org.junit.Test

class LandingPolicyTest {
    private val today = 20_000L
    private fun visits(vararg days: Pair<Long, Map<String, Int>>) = mapOf(*days)

    @Test fun suggestsMostOpenedTabWithThreeOrMoreOpens() {
        val v = visits(today to mapOf(Tab.TRIBE to 2, Tab.EXPLORE to 1), today - 3 to mapOf(Tab.TRIBE to 1))
        assertEquals(Tab.TRIBE, LandingPolicy.localSuggestion(v, today, Tab.EXPLORE))
    }

    @Test fun needsAtLeastThreeOpens() {
        assertNull(LandingPolicy.localSuggestion(visits(today to mapOf(Tab.TRIBE to 2)), today, Tab.EXPLORE))
    }

    @Test fun ignoresVisitsOlderThan14Days() {
        val v = visits(today - 14 to mapOf(Tab.TRIBE to 10), today to mapOf(Tab.TRIBE to 1))
        assertNull(LandingPolicy.localSuggestion(v, today, Tab.EXPLORE))
    }

    @Test fun neverSuggestsCurrentLandingOrExplore() {
        assertNull(LandingPolicy.localSuggestion(visits(today to mapOf(Tab.TRIBE to 5)), today, Tab.TRIBE))
        assertNull(LandingPolicy.localSuggestion(visits(today to mapOf(Tab.EXPLORE to 9)), today, Tab.TRIBE))
    }

    @Test fun tiesDoNotPrompt() {
        assertNull(LandingPolicy.localSuggestion(visits(today to mapOf(Tab.TRIBE to 4, Tab.TRIPS to 4)), today, Tab.EXPLORE))
    }

    @Test fun addVisitCountsAndPrunes() {
        var v: Map<Long, Map<String, Int>> = visits(today - 20 to mapOf(Tab.TRIPS to 3))
        v = LandingPolicy.addVisit(v, Tab.TRIBE, today)
        v = LandingPolicy.addVisit(v, Tab.TRIBE, today)
        v = LandingPolicy.addVisit(v, "you", today) // not a landing choice
        assertEquals(mapOf(Tab.TRIBE to 2), LandingPolicy.totals(v, today))
    }

    @Test fun serverAnswerWinsWhenAvailable() {
        val busy = visits(today to mapOf(Tab.TRIPS to 9))
        assertNull(LandingPolicy.decide(true, null, busy, today, Tab.EXPLORE, false, 0, 0))
        assertEquals(Tab.TRIBE, LandingPolicy.decide(true, Tab.TRIBE, busy, today, Tab.EXPLORE, false, 0, 0))
        assertEquals(Tab.TRIPS, LandingPolicy.decide(false, null, busy, today, Tab.EXPLORE, false, 0, 0))
    }

    @Test fun dismissedOrRecentlyShownDoesNotPrompt() {
        val now = 10L * LandingPolicy.COOLDOWN_MS
        assertNull(LandingPolicy.decide(true, Tab.TRIBE, emptyMap(), today, Tab.EXPLORE, dismissed = true, lastShownAt = 0, now = now))
        assertNull(LandingPolicy.decide(true, Tab.TRIBE, emptyMap(), today, Tab.EXPLORE, false, lastShownAt = now - 1000, now = now))
        assertEquals(Tab.TRIBE, LandingPolicy.decide(true, Tab.TRIBE, emptyMap(), today, Tab.EXPLORE, false, lastShownAt = now - LandingPolicy.COOLDOWN_MS - 1, now = now))
    }

    @Test fun ignoresInvalidServerTab() {
        assertNull(LandingPolicy.decide(true, "you", emptyMap(), today, Tab.EXPLORE, false, 0, 0))
        assertNull(LandingPolicy.decide(true, Tab.TRIBE, emptyMap(), today, Tab.TRIBE, false, 0, 0))
    }

    @Test fun streakOfThreeLaunchesToTribeOffersTribe() {
        val now = 10_000_000_000L
        assertEquals("tribe", LandingPolicy.streakSuggestion(listOf("explore", "tribe", "tribe", "tribe"), "explore", false, 0, now))
        assertNull(LandingPolicy.streakSuggestion(listOf("tribe", "explore", "tribe"), "explore", false, 0, now))
        assertNull(LandingPolicy.streakSuggestion(listOf("tribe", "tribe"), "explore", false, 0, now))
        assertNull(LandingPolicy.streakSuggestion(listOf("tribe", "tribe", "tribe"), "tribe", false, 0, now))
        // Shown yesterday: wait (2 days). Dismissed 5 days ago: still waiting (a week); 8 days: ask again.
        assertNull(LandingPolicy.streakSuggestion(listOf("tribe", "tribe", "tribe"), "explore", false, now - 86_400_000, now))
        assertNull(LandingPolicy.streakSuggestion(listOf("tribe", "tribe", "tribe"), "explore", true, now - 5 * 86_400_000L, now))
        assertEquals("tribe", LandingPolicy.streakSuggestion(listOf("tribe", "tribe", "tribe"), "explore", true, now - 8 * 86_400_000L, now))
    }
}
