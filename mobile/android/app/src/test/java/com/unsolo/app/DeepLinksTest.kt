package com.unsolo.app

import com.unsolo.app.data.ConfigStore
import com.unsolo.app.ui.nav.DeepLinks
import org.junit.Assert.*
import org.junit.Test

class DeepLinksTest {
    @Test fun mapsContractPaths() {
        assertEquals("tribe", DeepLinks.routeForPath("/tribe"))
        assertEquals("post/p-spiti-jan", DeepLinks.routeForPath("/tribe/p/p-spiti-jan"))
        assertEquals("trip/chalo-himachal", DeepLinks.routeForPath("/packages/chalo-himachal"))
        assertEquals("trips", DeepLinks.routeForPath("/bookings"))
        assertEquals("profile/ananyasingh", DeepLinks.routeForPath("/profile/ananyasingh"))
        assertEquals("chat/room-chalo", DeepLinks.routeForPath("/chat/room-chalo"))
    }

    @Test fun rejectsHostileInput() {
        assertNull(DeepLinks.routeForPath("https://evil.example/tribe"))
        assertNull(DeepLinks.routeForPath("//evil.example/tribe"))
        assertNull(DeepLinks.routeForPath("/tribe/p/../../etc"))
        assertNull(DeepLinks.routeForPath("/packages/Bad Slug"))
        assertNull(DeepLinks.routeForPath("/profile/<script>"))
        assertNull(DeepLinks.routeForPath("/chat/" + "a".repeat(80)))
        assertNull(DeepLinks.routeForPath(null))
    }

    @Test fun minAppVersionComparison() {
        assertTrue(ConfigStore.isOlder("1.0.0", "1.0.1"))
        assertTrue(ConfigStore.isOlder("1.9", "1.10.0"))
        assertFalse(ConfigStore.isOlder("1.0.0", "1.0.0"))
        assertFalse(ConfigStore.isOlder("2.0.0", "1.9.9"))
        assertFalse(ConfigStore.isOlder("1.0.0", null))
    }
}

class SameSiteLinkTest {
    @Test fun onlySameSitePathsAreFollowed() {
        assertNull(DeepLinks.sanitizePath("/\\evil.example"))
        assertNull(DeepLinks.sanitizePath(" /tribe"))
        assertNull(DeepLinks.sanitizePath("/tribe /p/x"))
        assertNull(DeepLinks.sanitizePath("/tribe\n"))
        assertNull(DeepLinks.sanitizePath("tribe"))
        assertEquals("/tribe/p/abc", DeepLinks.sanitizePath("/tribe/p/abc?ref=push"))
    }
}
