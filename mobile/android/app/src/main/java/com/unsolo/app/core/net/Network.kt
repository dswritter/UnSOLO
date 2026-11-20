package com.unsolo.app.core.net

import android.content.Context
import com.unsolo.app.BuildConfig
import com.unsolo.app.core.auth.SessionManager
import com.unsolo.app.core.auth.SupabaseAuth
import com.unsolo.app.core.demo.DemoApiInterceptor
import com.unsolo.app.core.model.ApiErrorBody
import com.unsolo.app.core.model.ApiErrorDetail
import kotlinx.coroutines.CancellationException
import okhttp3.Authenticator
import okhttp3.Cache
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.File
import java.io.IOException
import java.util.Locale
import java.util.concurrent.TimeUnit

val CLIENT_HEADER_VALUE: String = "android/${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

class ClientHeaderInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response = chain.proceed(
        chain.request().newBuilder()
            .header("X-UnSOLO-Client", CLIENT_HEADER_VALUE)
            .header("Accept-Language", Locale.getDefault().toLanguageTag())
            .build()
    )
}

/** Adds the Supabase access token to /api/v1 calls only (never to third-party hosts). */
class AuthInterceptor(private val session: SessionManager, private val apiHost: String) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        if (req.url.host != apiHost || req.header("Authorization") != null) return chain.proceed(req)
        val token = session.session?.accessToken ?: return chain.proceed(req)
        return chain.proceed(req.newBuilder().header("Authorization", "Bearer $token").build())
    }
}

/** Refreshes the Supabase session once on 401 and retries; signs out when refresh fails. */
class TokenAuthenticator(
    private val session: SessionManager,
    private val auth: () -> SupabaseAuth,
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        val sent = response.request.header("Authorization")?.removePrefix("Bearer ") ?: return null
        if (responseCount(response) >= 2) return null
        synchronized(this) {
            val current = session.session ?: return null
            if (current.accessToken != sent) {
                // Another request already refreshed.
                return response.request.newBuilder().header("Authorization", "Bearer ${current.accessToken}").build()
            }
            val refreshed = runCatching { auth().refreshBlocking(current.refreshToken) }.getOrNull()
            if (refreshed == null) { session.clear(); return null }
            session.update(refreshed)
            return response.request.newBuilder().header("Authorization", "Bearer ${refreshed.accessToken}").build()
        }
    }

    private fun responseCount(r: Response): Int { var n = 1; var p = r.priorResponse; while (p != null) { n++; p = p.priorResponse }; return n }
}

class Network(context: Context, session: SessionManager, demo: DemoApiInterceptor, authProvider: () -> SupabaseAuth) {
    private val apiBase = BuildConfig.API_BASE_URL
    private val apiHost = apiBase.toHttpUrl().host

    /** ~50 MB HTTP cache: public GETs are revalidated with If-None-Match → 304. */
    private val httpCache = Cache(File(context.cacheDir, "http"), 50L * 1024 * 1024)

    /** Used for Supabase Auth and as the base of the API client. */
    val baseClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(ClientHeaderInterceptor())
        .addInterceptor(demo)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    val apiClient: OkHttpClient = OkHttpClient.Builder()
        .cache(httpCache)
        .addInterceptor(ClientHeaderInterceptor())
        .addInterceptor(AuthInterceptor(session, apiHost))
        .addInterceptor(demo) // after auth so the demo backend sees who is signed in
        .authenticator(TokenAuthenticator(session, authProvider))
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    /** Images: no auth header, no demo interception; Coil keeps its own memory and disk cache. */
    val imageClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(ClientHeaderInterceptor())
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    val api: ApiService = Retrofit.Builder()
        .baseUrl(apiBase)
        .client(apiClient)
        .addConverterFactory(AppJson.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(ApiService::class.java)
}


/** Error normalised from the contract's `{ error: { code, message, field } }`. */
class ApiException(val status: Int, val detail: ApiErrorDetail, val retryAfterSec: Long? = null) :
    IOException("${detail.code}: ${detail.message ?: ""}") {
    val code: String get() = detail.code
}

sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class Err(val status: Int, val code: String, val message: String?, val field: String? = null, val retryAfterSec: Long? = null) : ApiResult<Nothing>
    data object Offline : ApiResult<Nothing>
}

fun HttpException.toErr(): ApiResult.Err {
    val body = response()?.errorBody()?.string()
    val detail = body?.let { runCatching { AppJson.decodeFromString(ApiErrorBody.serializer(), it).error }.getOrNull() }
        ?: ApiErrorDetail(code = codeForStatus(code()))
    val retry = response()?.headers()?.get("Retry-After")?.toLongOrNull()
    return ApiResult.Err(code(), detail.code, detail.message, detail.field, retry)
}

fun codeForStatus(status: Int) = when (status) {
    400 -> "bad_request"; 401 -> "unauthorized"; 403 -> "forbidden"; 404 -> "not_found"; 409 -> "conflict"
    426 -> "upgrade_required"; 429 -> "rate_limited"; else -> "server_error"
}

suspend fun <T> apiCall(block: suspend () -> T): ApiResult<T> = try {
    ApiResult.Ok(block())
} catch (e: CancellationException) {
    throw e
} catch (e: HttpException) {
    e.toErr()
} catch (e: ApiException) {
    ApiResult.Err(e.status, e.code, e.detail.message, e.detail.field, e.retryAfterSec)
} catch (e: IOException) {
    ApiResult.Offline
} catch (e: kotlinx.serialization.SerializationException) {
    ApiResult.Err(0, "bad_response", e.message)
}

/** For Response<Unit> endpoints (204s). */
suspend fun apiUnit(block: suspend () -> retrofit2.Response<Unit>): ApiResult<Unit> = when (val r = apiCall(block)) {
    is ApiResult.Ok -> if (r.value.isSuccessful) ApiResult.Ok(Unit) else HttpException(r.value).toErr()
    is ApiResult.Err -> r
    ApiResult.Offline -> ApiResult.Offline
}

fun ApiResult.Err.userMessage(): String = when (code) {
    "phone_required" -> "Verify your phone number to do this."
    "unauthorized" -> "Sign in to continue."
    "rate_limited" -> "You're doing that a lot. Try again in a bit."
    "upgrade_required" -> "Update UnSOLO from the Play Store to keep going."
    "forbidden" -> message ?: "You can't do that."
    "not_found" -> "This isn't available any more."
    else -> message ?: "Something went wrong. Try again."
}
