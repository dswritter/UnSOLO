package com.unsolo.app.core.auth

/**
 * Phone sign-in through our own /api/v1/auth/phone endpoints (2factor.in on the server).
 * Pure state for the sign-in screen, unit-tested in PhoneSignInTest:
 *  - start → keep the opaque challenge and start the resend countdown (Retry-After, default 30 s);
 *  - verify sends challenge + code;
 *  - "change number" and "resend" replace (or drop) the challenge.
 */
class PhoneSignInFlow(private val defaultCooldownSec: Long = 30) {
    var phone: String = ""; private set
    var challenge: String? = null; private set
    var expiresAtMs: Long = 0; private set
    var resendAtMs: Long = 0; private set
    var devCode: String? = null; private set

    val codeSent: Boolean get() = challenge != null

    /** Digits the server accepts: the last 10 of whatever was typed (+91 / 91 prefixes dropped). */
    fun normalized(input: String): String = input.filter { it.isDigit() }.let { if (it.length > 10 && (it.startsWith("91") || it.startsWith("0"))) it.takeLast(10) else it }

    fun valid(input: String): Boolean = normalized(input).let { it.length == 10 && it.first() in "6789" }

    /** A successful POST /auth/phone/start. A resend replaces the previous challenge. */
    fun onStarted(phoneInput: String, challenge: String, expiresInSec: Long, devCode: String?, nowMs: Long, retryAfterSec: Long? = null) {
        phone = normalized(phoneInput)
        this.challenge = challenge
        this.devCode = devCode
        expiresAtMs = nowMs + expiresInSec * 1000
        resendAtMs = nowMs + (retryAfterSec ?: defaultCooldownSec) * 1000
    }

    /** A 429 from start: keep the current challenge, wait out Retry-After. */
    fun onRateLimited(retryAfterSec: Long?, nowMs: Long) { resendAtMs = nowMs + (retryAfterSec ?: defaultCooldownSec) * 1000 }

    fun resendInSec(nowMs: Long): Long = ((resendAtMs - nowMs + 999) / 1000).coerceAtLeast(0)
    fun canResend(nowMs: Long): Boolean = codeSent && nowMs >= resendAtMs

    /** Body for POST /auth/phone/verify, or null when there is no challenge yet. */
    fun verifyBody(code: String): Pair<String, String>? {
        val c = challenge ?: return null
        val digits = code.filter { it.isDigit() }
        return if (digits.length == 6) c to digits else null
    }

    /** "Change number": the old challenge is useless for a new number. */
    fun reset() { challenge = null; devCode = null; expiresAtMs = 0; resendAtMs = 0 }
}

/** Phone-only accounts carry a placeholder email; never show it. */
object AccountContact {
    const val PLACEHOLDER_DOMAIN = "@phone.unsolo.in"
    fun isPlaceholderEmail(email: String?): Boolean = email != null && email.trim().lowercase().endsWith(PLACEHOLDER_DOMAIN)
    /** What to show as "signed in as": the real email, else the phone, else null. */
    fun label(email: String?, phone: String?): String? =
        email?.takeIf { it.isNotBlank() && !isPlaceholderEmail(it) } ?: phone?.takeIf { it.isNotBlank() }
}
