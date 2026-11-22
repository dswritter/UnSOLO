package com.unsolo.app.core.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.security.MessageDigest
import java.security.SecureRandom
import android.util.Base64

/** Nonce and PKCE helpers (pure; unit-tested in GoogleAuthCryptoTest). */
object AuthCrypto {
    private val rng = SecureRandom()

    /** URL-safe random string from [bytes] of entropy (no padding). */
    fun randomUrlSafe(bytes: Int = 32): String {
        val b = ByteArray(bytes).also { rng.nextBytes(it) }
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(b)
    }

    fun sha256(input: String): ByteArray = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.US_ASCII))

    /** Google receives sha256(nonce) as lowercase hex; Supabase receives the raw nonce and checks the hash. */
    fun hashedNonce(raw: String): String = sha256(raw).joinToString("") { "%02x".format(it) }

    /** RFC 7636 S256: base64url(sha256(verifier)) without padding. */
    fun pkceChallenge(verifier: String): String = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(sha256(verifier))

    private val codeRe = Regex("^[A-Za-z0-9._~-]{8,512}$")
    fun validAuthCode(code: String?) = code != null && codeRe.matches(code)
}

sealed interface GoogleResult {
    data class Token(val idToken: String, val rawNonce: String) : GoogleResult
    data object Cancelled : GoogleResult
    /** No Google account / no Play services / not configured: use the OAuth (PKCE) fallback. */
    data class Unavailable(val reason: String) : GoogleResult
}

/** Sign in with Google through Credential Manager (needs an Activity context for the bottom sheet). */
class GoogleSignIn(private val webClientId: String) {
    val configured: Boolean get() = webClientId.isNotBlank()

    suspend fun getIdToken(activityContext: Context): GoogleResult {
        if (!configured) return GoogleResult.Unavailable("not_configured")
        val raw = AuthCrypto.randomUrlSafe()
        val option = GetSignInWithGoogleOption.Builder(webClientId).setNonce(AuthCrypto.hashedNonce(raw)).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        return try {
            val cred = CredentialManager.create(activityContext).getCredential(activityContext, request).credential
            if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                GoogleResult.Token(GoogleIdTokenCredential.createFrom(cred.data).idToken, raw)
            } else GoogleResult.Unavailable("unexpected_credential")
        } catch (e: GetCredentialCancellationException) {
            GoogleResult.Cancelled
        } catch (e: GetCredentialException) {
            android.util.Log.w("UnsoloGoogle", "Credential Manager: ${e.type}: ${e.message}")
            GoogleResult.Unavailable(e.type)
        } catch (e: Exception) {
            GoogleResult.Unavailable(e.javaClass.simpleName)
        }
    }
}

/**
 * Pending PKCE verifier for the Custom Tab fallback. Kept in a private prefs file (excluded from
 * backup) so it survives the process being killed while the browser is open; cleared on use and
 * ignored after 10 minutes.
 */
class PkceStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("unsolo_pkce", Context.MODE_PRIVATE)

    fun save(verifier: String) { prefs.edit().putString(K, verifier).putLong(T, System.currentTimeMillis()).apply() }

    fun take(): String? {
        val v = prefs.getString(K, null)
        val age = System.currentTimeMillis() - prefs.getLong(T, 0)
        prefs.edit().remove(K).remove(T).apply()
        return v?.takeIf { age in 0..10 * 60 * 1000L }
    }

    private companion object { const val K = "verifier"; const val T = "at" }
}

@Suppress("unused") private val keepBase64 = Base64.NO_WRAP
