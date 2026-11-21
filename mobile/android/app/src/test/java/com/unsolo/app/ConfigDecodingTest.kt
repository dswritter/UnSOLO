package com.unsolo.app

import com.unsolo.app.core.model.AppConfig
import com.unsolo.app.core.net.AppJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The live /api/v1/config response must decode, or the app falls back to demo data on first launch. */
class ConfigDecodingTest {
    private val live = """{"flags":{"tribeEnabled":true,"tribeRolloutPercent":100,"tribePostingEnabled":true,"hostOffersEnabled":true,"pushEnabled":true},"minAppVersion":{"android":1,"ios":1},"supabase":{"url":"https://example.supabase.co","anonKey":"x"},"upload":{"maxBytes":2097152,"maxEdge":2048},"webPushPublicKey":null,"support":{"whatsapp":"919211451355","email":"hello@unsolo.in"}}"""

    @Test fun decodesTheLiveConfig() {
        val c = AppJson.decodeFromString(AppConfig.serializer(), live)
        assertEquals("1", c.minAppVersion.android)
        assertEquals("hello@unsolo.in", c.support.email)
        assertTrue(c.flags.tribeEnabled)
    }

    @Test fun versionsMayBeTextOrNumbers() {
        val c = AppJson.decodeFromString(AppConfig.serializer(), """{"minAppVersion":{"android":"1.2.0","ios":2}}""")
        assertEquals("1.2.0", c.minAppVersion.android)
        assertEquals("2", c.minAppVersion.ios)
    }
}
