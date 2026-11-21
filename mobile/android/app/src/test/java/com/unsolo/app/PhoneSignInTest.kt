package com.unsolo.app

import com.unsolo.app.core.auth.AccountContact
import com.unsolo.app.core.auth.PhoneSignInFlow
import com.unsolo.app.core.model.SupaSession
import com.unsolo.app.core.net.AppJson
import org.junit.Assert.*
import org.junit.Test

class PhoneSignInTest {
    @Test fun challengeFlow() {
        val f = PhoneSignInFlow()
        assertFalse(f.codeSent)
        assertNull("no verify before start", f.verifyBody("123456"))
        assertEquals("9876543210", f.normalized("+91 98765 43210"))
        assertEquals("9876543210", f.normalized("919876543210"))
        assertTrue(f.valid("9876543210")); assertFalse(f.valid("1234567890")); assertFalse(f.valid("98765"))

        f.onStarted("+919876543210", "c1", expiresInSec = 600, devCode = "123456", nowMs = 0)
        assertTrue(f.codeSent)
        assertEquals("9876543210", f.phone)
        assertEquals("c1" to "123456", f.verifyBody("123456"))
        assertNull("needs 6 digits", f.verifyBody("12345"))
        assertEquals(30, f.resendInSec(0))
        assertFalse(f.canResend(29_000)); assertTrue(f.canResend(30_000))

        // Resend replaces the challenge; a 429 keeps it and waits out Retry-After.
        f.onStarted("9876543210", "c2", 600, null, nowMs = 31_000)
        assertEquals("c2" to "654321", f.verifyBody("654321"))
        f.onRateLimited(45, nowMs = 40_000)
        assertEquals(45, f.resendInSec(40_000))
        assertEquals("c2", f.challenge)

        // Change number drops it.
        f.reset()
        assertFalse(f.codeSent); assertNull(f.verifyBody("654321"))
    }

    @Test fun verifyResponseDecodesAsSupabaseSession() {
        val s = AppJson.decodeFromString(SupaSession.serializer(),
            """{"access_token":"a","refresh_token":"r","expires_in":3600,"expires_at":1,"token_type":"bearer","user":{"id":"u","email":"9876543210@phone.unsolo.in","phone":"919876543210"},"is_new":true}""")
        assertEquals("a", s.accessToken); assertTrue(s.isNew)
    }

    @Test fun placeholderEmailIsHidden() {
        assertTrue(AccountContact.isPlaceholderEmail("9876543210@phone.unsolo.in"))
        assertTrue(AccountContact.isPlaceholderEmail(" 9876543210@PHONE.unsolo.in "))
        assertFalse(AccountContact.isPlaceholderEmail("dev@unsolo.in"))
        assertFalse(AccountContact.isPlaceholderEmail(null))
        assertEquals("+919876543210", AccountContact.label("9876543210@phone.unsolo.in", "+919876543210"))
        assertEquals("dev@example.com", AccountContact.label("dev@example.com", "+919876543210"))
        assertEquals("+919876543210", AccountContact.label(null, "+919876543210"))
        assertNull(AccountContact.label("9876543210@phone.unsolo.in", null))
    }
}
