package com.unsolo.app.core.auth

import com.unsolo.app.core.model.ApiErrorDetail
import com.unsolo.app.core.model.SupaSession
import com.unsolo.app.core.model.SupabaseConfig
import com.unsolo.app.core.net.ApiException
import com.unsolo.app.core.net.AppJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Supabase Auth called directly (`{supabase.url}/auth/v1/...` with `apikey: anonKey`), per the contract.
 * The URL and anon key come from GET /config, with BuildConfig values from secrets.properties as fallback.
 */
class SupabaseAuth(private val client: OkHttpClient, private val config: () -> SupabaseConfig) {

    suspend fun signUp(email: String, password: String): SupaSession? = withContext(Dispatchers.IO) {
        val body = post("signup", buildJsonObject { put("email", email); put("password", password) })
        // With email confirmation on, Supabase returns a user without a session.
        runCatching { AppJson.decodeFromString(SupaSession.serializer(), body) }.getOrNull()
    }

    suspend fun signInWithPassword(email: String, password: String): SupaSession = withContext(Dispatchers.IO) {
        decode(post("token?grant_type=password", buildJsonObject { put("email", email); put("password", password) }))
    }

    suspend fun sendEmailCode(email: String) = withContext(Dispatchers.IO) {
        post("otp", buildJsonObject { put("email", email); put("create_user", true) }); Unit
    }

    suspend fun verifyEmailCode(email: String, code: String): SupaSession = withContext(Dispatchers.IO) {
        decode(post("verify", buildJsonObject { put("type", "email"); put("email", email); put("token", code) }))
    }

    suspend fun sendPhoneCode(phone: String) = withContext(Dispatchers.IO) {
        post("otp", buildJsonObject { put("phone", phone) }); Unit
    }

    suspend fun verifyPhoneCode(phone: String, code: String): SupaSession = withContext(Dispatchers.IO) {
        decode(post("verify", buildJsonObject { put("type", "sms"); put("phone", phone); put("token", code) }))
    }

    /** Google ID token from Credential Manager → Supabase session. [nonce] is the raw (unhashed) nonce. */
    suspend fun signInWithIdToken(provider: String, idToken: String, nonce: String): SupaSession = withContext(Dispatchers.IO) {
        decode(post("token?grant_type=id_token", buildJsonObject { put("provider", provider); put("id_token", idToken); put("nonce", nonce) }))
    }

    /** OAuth fallback (Custom Tab): authorize URL with an S256 PKCE challenge. */
    fun authorizeUrl(provider: String, redirectTo: String, codeChallenge: String): String {
        val cfg = config()
        return cfg.url.trimEnd('/') + "/auth/v1/authorize?provider=" + provider +
            "&redirect_to=" + java.net.URLEncoder.encode(redirectTo, "UTF-8") +
            "&code_challenge=" + codeChallenge + "&code_challenge_method=s256"
    }

    /** unsolo://auth-callback?code= → Supabase session. */
    suspend fun exchangePkce(authCode: String, codeVerifier: String): SupaSession = withContext(Dispatchers.IO) {
        decode(post("token?grant_type=pkce", buildJsonObject { put("auth_code", authCode); put("code_verifier", codeVerifier) }))
    }

    suspend fun recover(email: String) = withContext(Dispatchers.IO) {
        post("recover", buildJsonObject { put("email", email) }); Unit
    }

    suspend fun logout(accessToken: String) = withContext(Dispatchers.IO) {
        runCatching { post("logout", JsonObject(emptyMap()), bearer = accessToken) }; Unit
    }

    /** Called from OkHttp's Authenticator thread. */
    fun refreshBlocking(refreshToken: String): StoredSession =
        decode(post("token?grant_type=refresh_token", buildJsonObject { put("refresh_token", refreshToken) })).toStored()

    private fun decode(body: String): SupaSession = AppJson.decodeFromString(SupaSession.serializer(), body)

    private fun post(path: String, json: JsonObject, bearer: String? = null): String {
        val cfg = config()
        if (cfg.url.isBlank() || cfg.anonKey.isBlank()) {
            throw ApiException(0, ApiErrorDetail("auth_not_configured", "Sign-in isn't set up on this build yet."))
        }
        val req = Request.Builder()
            .url(cfg.url.trimEnd('/') + "/auth/v1/" + path)
            .header("apikey", cfg.anonKey)
            .header("Authorization", "Bearer ${bearer ?: cfg.anonKey}")
            .post(json.toString().toRequestBody("application/json".toMediaType()))
            .build()
        client.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                val msg = runCatching {
                    val o = AppJson.parseToJsonElement(text) as JsonObject
                    (o["error_description"] ?: o["msg"] ?: o["message"])?.jsonPrimitive?.content
                }.getOrNull()
                throw ApiException(resp.code, ApiErrorDetail(code = if (resp.code == 429) "rate_limited" else "auth_failed", message = msg ?: "Couldn't sign in. Check the details and try again."))
            }
            return text
        }
    }
}

@Suppress("unused")
private fun JsonPrimitive.safe() = content
