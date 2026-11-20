package com.unsolo.app

import com.unsolo.app.core.auth.AuthCrypto
import org.junit.Assert.*
import org.junit.Test

class AuthCryptoTest {
    @Test fun pkceChallengeMatchesRfc7636Vector() {
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", AuthCrypto.pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    }

    @Test fun hashedNonceIsLowercaseSha256Hex() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", AuthCrypto.hashedNonce("abc"))
    }

    @Test fun randomValuesAreUrlSafeAndUnique() {
        val a = AuthCrypto.randomUrlSafe(48); val b = AuthCrypto.randomUrlSafe(48)
        assertNotEquals(a, b)
        assertTrue(a.matches(Regex("^[A-Za-z0-9_-]{64}$")))
    }

    @Test fun authCodeValidation() {
        assertTrue(AuthCrypto.validAuthCode("3f8c1d2e-aaaa-bbbb-cccc-0123456789ab"))
        assertFalse(AuthCrypto.validAuthCode("short"))
        assertFalse(AuthCrypto.validAuthCode("bad code with spaces"))
        assertFalse(AuthCrypto.validAuthCode(null))
    }
}
