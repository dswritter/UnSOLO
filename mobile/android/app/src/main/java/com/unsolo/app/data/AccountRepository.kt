package com.unsolo.app.data

import com.unsolo.app.BuildConfig
import com.unsolo.app.core.auth.SessionManager
import com.unsolo.app.core.auth.SupabaseAuth
import com.unsolo.app.core.auth.toStored
import com.unsolo.app.core.db.AppDatabase
import com.unsolo.app.core.db.OutboxType
import com.unsolo.app.core.demo.DemoMode
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiException
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.ApiService
import com.unsolo.app.core.net.AppJson
import com.unsolo.app.core.net.apiCall
import com.unsolo.app.core.net.apiUnit
import com.unsolo.app.core.prefs.LocalSettings
import com.unsolo.app.core.sync.Outbox
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** GET /config, cached; read at launch and every 15 minutes (kill switches, min version, Supabase). */
class ConfigStore(private val db: AppDatabase, private val api: ApiService, scope: CoroutineScope) {
    private val _config = MutableStateFlow(AppConfig())
    val config: StateFlow<AppConfig> = _config.asStateFlow()
    @Volatile var loadedFromCache = false; private set

    init {
        scope.launch {
            db.cache().getAs(KEY, AppConfig.serializer())?.let { _config.value = it; loadedFromCache = true }
        }
    }

    suspend fun hasCache() = db.cache().get(KEY) != null

    suspend fun probe(): ApiResult<AppConfig> {
        val r = apiCall { api.configProbe() }
        if (r is ApiResult.Ok) { _config.value = r.value; db.cache().putAs(KEY, AppConfig.serializer(), r.value) }
        return r
    }

    suspend fun refresh(): ApiResult<AppConfig> {
        val r = apiCall { api.config() }
        if (r is ApiResult.Ok) { _config.value = r.value; db.cache().putAs(KEY, AppConfig.serializer(), r.value) }
        return r
    }

    fun supabase(): SupabaseConfig {
        val c = _config.value.supabase
        return if (c.url.isNotBlank() && c.anonKey.isNotBlank()) c
        else if (DemoMode.enabled) SupabaseConfig("https://demo.supabase.local", "demo-anon-key")
        else SupabaseConfig(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY)
    }

    /** True when the server's minimum Android version is newer than this build. */
    fun needsUpgrade(): Boolean = isOlder(BuildConfig.VERSION_NAME, _config.value.minAppVersion.android)

    companion object {
        const val KEY = "config"
        fun isOlder(current: String, minimum: String?): Boolean {
            if (minimum.isNullOrBlank()) return false
            val a = current.split('.').map { it.toIntOrNull() ?: 0 }
            val b = minimum.split('.').map { it.toIntOrNull() ?: 0 }
            for (i in 0 until maxOf(a.size, b.size)) {
                val x = a.getOrElse(i) { 0 }; val y = b.getOrElse(i) { 0 }
                if (x != y) return x < y
            }
            return false
        }
    }
}

class AccountRepository(
    private val db: AppDatabase,
    private val api: ApiService,
    private val auth: SupabaseAuth,
    private val session: SessionManager,
    private val settings: LocalSettings,
    private val outbox: Outbox,
    private val scope: CoroutineScope,
    private val onSignedIn: suspend () -> Unit,
    private val onSignedOut: suspend () -> Unit,
) {
    val me: StateFlow<MeResponse?> = db.cache().observeAs(KEY_ME, MeResponse.serializer())
        .stateIn(scope, SharingStarted.Eagerly, null)

    val isSignedIn: StateFlow<Boolean> = session.flow.combine(me) { s, _ -> s != null }
        .stateIn(scope, SharingStarted.Eagerly, false)

    fun meLite(): UserLite = me.value?.user?.let {
        UserLite(it.id, it.username, it.name, it.avatarUrl, it.isPhoneVerified, it.isIdVerified, it.isHost)
    } ?: UserLite(session.session?.userId ?: "me", "you", "You")

    val canPost: Boolean get() = session.isSignedIn && me.value.let { it != null && (it.canParticipate ?: it.user.isPhoneVerified) }

    suspend fun refreshMe(): ApiResult<MeResponse> {
        if (!session.isSignedIn) return ApiResult.Err(401, "unauthorized", null)
        val r = apiCall { api.me() }
        if (r is ApiResult.Ok) {
            db.cache().putAs(KEY_ME, MeResponse.serializer(), r.value)
            settings.setLandingTab(r.value.preferences.landingTab)
            settings.setDataSaver(r.value.preferences.dataSaver)
        }
        if (r is ApiResult.Err && r.status == 401) { session.clear(); db.cache().delete(KEY_ME) }
        return r
    }

    private suspend fun completeSignIn(s: SupaSession) {
        session.update(s.toStored())
        refreshMe()
        // Push registration and the feed/chat/trip refreshes run after the screen moves on: waiting for
        // them (an FCM token can take a while) left sign-in stuck on "Signing you in…".
        scope.launch { runCatching { onSignedIn() } }
    }

    suspend fun signInWithPassword(email: String, password: String) = runAuth { completeSignIn(auth.signInWithPassword(email.trim(), password)) }
    suspend fun signUp(email: String, password: String) = runAuth {
        val s = auth.signUp(email.trim(), password) ?: throw ApiException(200, ApiErrorDetail("confirm_email", "Check your inbox to confirm your email, then sign in."))
        completeSignIn(s)
    }
    suspend fun sendEmailCode(email: String) = runAuth { auth.sendEmailCode(email.trim()) }
    suspend fun verifyEmailCode(email: String, code: String) = runAuth { completeSignIn(auth.verifyEmailCode(email.trim(), code.trim())) }
    /** POST /auth/phone/start: returns the opaque challenge (and a devCode on non-production servers without SMS). */
    suspend fun startPhoneSignIn(phone10: String): ApiResult<PhoneAuthStartResponse> = apiCall { api.authPhoneStart(PhoneAuthStartRequest(phone10)) }
    /** POST /auth/phone/verify: stores the session like the email-code flow. Ok(true) means a new account. */
    suspend fun verifyPhoneSignIn(challenge: String, code: String): ApiResult<Boolean> = apiCall {
        val s = api.authPhoneVerify(PhoneAuthVerifyRequest(challenge, code.trim()))
        completeSignIn(s)
        s.isNew
    }
    suspend fun recover(email: String) = runAuth { auth.recover(email.trim()) }

    // ---- Google ----

    suspend fun signInWithGoogleIdToken(idToken: String, rawNonce: String) = runAuth { completeSignIn(auth.signInWithIdToken("google", idToken, rawNonce)) }

    /** Starts the Supabase OAuth fallback: returns the authorize URL to open in a Custom Tab. */
    fun startGoogleOAuth(pkce: com.unsolo.app.core.auth.PkceStore): String {
        val verifier = com.unsolo.app.core.auth.AuthCrypto.randomUrlSafe(48)
        pkce.save(verifier)
        return auth.authorizeUrl("google", OAUTH_REDIRECT, com.unsolo.app.core.auth.AuthCrypto.pkceChallenge(verifier))
    }

    suspend fun completeOAuth(code: String, pkce: com.unsolo.app.core.auth.PkceStore): ApiResult<Unit> {
        if (!com.unsolo.app.core.auth.AuthCrypto.validAuthCode(code)) return ApiResult.Err(400, "bad_request", "That sign-in link isn't valid.")
        val verifier = pkce.take() ?: return ApiResult.Err(400, "bad_request", "Sign-in took too long. Try again.")
        return runAuth { completeSignIn(auth.exchangePkce(code, verifier)) }
    }

    /** Demo builds only: signs in as the phone-verified demo traveller. */
    suspend fun signInDemo() = runAuth {
        val start = api.authPhoneStart(PhoneAuthStartRequest(DEMO_PHONE.takeLast(10)))
        completeSignIn(api.authPhoneVerify(PhoneAuthVerifyRequest(start.challenge, com.unsolo.app.core.demo.DEMO_SMS_CODE)))
    }

    private suspend fun runAuth(block: suspend () -> Unit): ApiResult<Unit> = apiCall { block() }

    // Phone verification for an existing account (required to post or join).
    suspend fun startPhoneVerification(phone: String) = apiCall { api.phoneStart(PhoneStartRequest(phone)) }
    suspend fun verifyPhone(phone: String, code: String): ApiResult<PhoneVerifyResponse> {
        val r = apiCall { api.phoneVerify(PhoneVerifyRequest(phone, code.trim())) }
        if (r is ApiResult.Ok && r.value.verified) refreshMe()
        return r
    }

    /** Deletes the account on the server, then clears everything local (the session is gone server-side). */
    suspend fun deleteAccount(): ApiResult<Unit> = when (val r = apiCall { api.deleteMe(DeleteAccountRequest()) }) {
        is ApiResult.Ok -> { signOut(null); ApiResult.Ok(Unit) }
        is ApiResult.Err -> r
        ApiResult.Offline -> ApiResult.Offline
    }

    suspend fun signOut(fcmToken: String?) {
        val token = session.session?.accessToken
        if (fcmToken != null) apiUnit { api.deleteDevice(DeviceDeleteRequest(fcmToken)) }
        if (token != null) auth.logout(token)
        session.clear()
        db.outbox().clear()
        db.cache().delete(KEY_ME)
        db.cache().delete("my_trips")
        db.cache().deletePrefix("requests:")
        db.cache().deletePrefix("offers:")
        db.notifications().clear()
        db.chats().clear()
        settings.clearAccountScoped()
        onSignedOut()
    }

    // Preferences: applied locally first, then PUT (partial) through the outbox.
    suspend fun updatePreferences(patch: JsonObject) {
        val current = me.value ?: return
        val merged = JsonObject(AppJson.encodeToJsonElement(Preferences.serializer(), current.preferences).jsonObject + patch)
        val prefs = AppJson.decodeFromJsonElement(Preferences.serializer(), merged)
        db.cache().putAs(KEY_ME, MeResponse.serializer(), current.copy(preferences = prefs))
        outbox.enqueueMerged(OutboxType.PREFERENCES, patch)
    }

    suspend fun setLandingTab(tab: String) {
        settings.setLandingTab(tab)
        if (session.isSignedIn) updatePreferences(buildJsonObject { put("landingTab", tab) })
    }

    suspend fun setDataSaver(on: Boolean) {
        settings.setDataSaver(on)
        if (session.isSignedIn) updatePreferences(buildJsonObject { put("dataSaver", on) })
    }

    suspend fun patchMe(patch: PatchMeRequest) {
        val current = me.value ?: return
        db.cache().putAs(KEY_ME, MeResponse.serializer(), current.copy(user = current.user.copy(
            gender = patch.gender ?: current.user.gender, homeCity = patch.homeCity ?: current.user.homeCity,
            name = patch.name ?: current.user.name, bio = patch.bio ?: current.user.bio,
        )))
        outbox.enqueueMerged(OutboxType.PATCH_ME, AppJson.encodeToJsonElement(PatchMeRequest.serializer(), patch).jsonObject)
    }

    /** Saves profile changes now (not via the outbox) so a taken username or bad link can be shown. */
    suspend fun saveProfile(patch: PatchMeRequest): ApiResult<MeResponse> {
        val r = apiCall { api.patchMe(patch) }
        if (r is ApiResult.Ok) applyMe(r.value)
        return r
    }

    suspend fun referrals() = apiCall { api.referrals() }
    suspend fun offers() = apiCall { api.offers() }

    suspend fun applyPreferences(p: Preferences) {
        me.value?.let { db.cache().putAs(KEY_ME, MeResponse.serializer(), it.copy(preferences = p)) }
    }

    suspend fun applyMe(m: MeResponse) { db.cache().putAs(KEY_ME, MeResponse.serializer(), m) }

    // Landing prompt
    suspend fun landingSuggestion(): ApiResult<LandingSuggestion> =
        if (session.isSignedIn) apiCall { api.landingSuggestion() } else ApiResult.Err(401, "unauthorized", null)

    suspend fun dismissLanding() { settings.setLandingDismissed(true); if (session.isSignedIn) apiUnit { api.dismissLandingSuggestion() } }

    fun observeMe(): Flow<MeResponse?> = me

    companion object {
        const val KEY_ME = "me"
        const val DEMO_PHONE = "+919800000000"
        const val OAUTH_REDIRECT = "unsolo://auth-callback"
    }
}
