package com.unsolo.app

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.map.Mapper
import coil3.memory.MemoryCache
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.Options
import coil3.request.crossfade
import com.unsolo.app.core.analytics.Analytics
import com.unsolo.app.core.auth.SessionManager
import com.unsolo.app.core.auth.SupabaseAuth
import com.unsolo.app.core.auth.TokenStore
import com.unsolo.app.core.db.AppDatabase
import com.unsolo.app.core.demo.DemoApiInterceptor
import com.unsolo.app.core.demo.DemoBackend
import com.unsolo.app.core.demo.DemoImages
import com.unsolo.app.core.demo.DemoMode
import com.unsolo.app.core.device.CoarseLocation
import com.unsolo.app.core.device.ConnectivityObserver
import com.unsolo.app.core.image.ImageCompressor
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.Network
import com.unsolo.app.core.net.apiCall
import com.unsolo.app.core.prefs.LocalSettings
import com.unsolo.app.core.push.NotificationChannels
import com.unsolo.app.core.push.PushRegistrar
import com.unsolo.app.core.sync.EventsFlushWorker
import com.unsolo.app.core.sync.Outbox
import com.unsolo.app.core.sync.OutboxExecutorImpl
import com.unsolo.app.core.sync.SyncWorker
import com.unsolo.app.data.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import okio.Path.Companion.toOkioPath

/** Manual DI: one graph per process. Everything here is cheap to construct; I/O happens lazily. */
class AppGraph(val app: UnsoloApp) {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val settings = LocalSettings(app)
    val session = SessionManager(TokenStore(app))
    val db: AppDatabase by lazy { AppDatabase.build(app) }
    val events = AppEvents()
    private val demoBackend = lazy { DemoBackend(app) }
    val network: Network by lazy { Network(app, session, DemoApiInterceptor(demoBackend)) { supabase } }
    val api: com.unsolo.app.core.net.ApiService get() = network.api
    val config: ConfigStore by lazy { ConfigStore(db, api, appScope) }
    val supabase: SupabaseAuth by lazy { SupabaseAuth(network.baseClient) { config.supabase() } }
    val analytics by lazy { Analytics(db, api, settings, appScope) }
    val connectivity by lazy { ConnectivityObserver(app) }
    val location by lazy { CoarseLocation(app) }
    val compressor by lazy { ImageCompressor(app) }
    val push by lazy { PushRegistrar(app) }
    val google by lazy { com.unsolo.app.core.auth.GoogleSignIn(com.unsolo.app.BuildConfig.GOOGLE_WEB_CLIENT_ID) }
    val pkce by lazy { com.unsolo.app.core.auth.PkceStore(app) }
    /** Result of the last OAuth callback, for the auth screen to show. */
    val oauthResult = kotlinx.coroutines.flow.MutableStateFlow<com.unsolo.app.core.net.ApiResult<Unit>?>(null)

    val outbox: Outbox by lazy {
        Outbox(app, db, appScope) { OutboxExecutorImpl(app, db, api, tribe, chat, account, events) }
    }
    val account: AccountRepository by lazy {
        AccountRepository(db, api, supabase, session, settings, outbox, appScope,
            onSignedIn = { push.register(); statuses.refresh(); activity.refresh(); chat.refreshChats(); explore.refreshMyTrips(); syncNow() },
            onSignedOut = { statuses.clear() })
    }
    val statuses by lazy { StatusRepository(app, api, compressor, appScope, events, db) { account.me.value?.user?.username } }
    val tribe: TribeRepository by lazy { TribeRepository(app, db, api, outbox, account, analytics, events, appScope, compressor) }
    val explore by lazy { ExploreRepository(db, api, tribe) { com.unsolo.app.core.widget.TripCountdownWidget.updateAll(app) } }
    val host by lazy { HostRepository(db, api) }
    val trips by lazy { TripsRepository(db, api, settings, appScope) { session.isSignedIn } }
    val precise by lazy { com.unsolo.app.core.device.PreciseLocation(app) }
    val chat by lazy { ChatRepository(db, api, outbox, account) }
    val activity by lazy { ActivityRepository(db, api, outbox) }

    /**
     * Launch sequence (off the main thread). When demo is off and nothing is cached, probe /config:
     * if the server is unreachable on first launch, switch to bundled demo data so the app is usable.
     */
    fun bootstrap() = appScope.launch {
        session.ensureLoaded()
        if (!DemoMode.enabled) {
            // A cache filled from demo data must never mix with real data: drop it and probe again.
            val demoCache = db.cache().get(KEY_DEMO_CACHE) != null
            if (demoCache) db.clearAllTables()
            if (!demoCache && config.hasCache()) DemoMode.decide(false)
            else {
                val r = withTimeoutOrNull(6_000) { config.probe() } ?: ApiResult.Offline
                // Unreachable, or /api/v1 not deployed yet (404 / HTML): fall back to bundled demo data.
                val useDemo = r !is ApiResult.Ok
                if (useDemo) db.cache().put(com.unsolo.app.core.db.CacheEntity(KEY_DEMO_CACHE, "true"))
                DemoMode.decide(useDemo)
            }
        }
        config.refresh()
        if (session.isSignedIn) { account.refreshMe(); push.register() }
        outbox.kick()
        SyncWorker.schedulePeriodic(app)
    }

    /** GET /sync?since= → refetch changed posts, drop removed ones, update memberships/unread. */
    suspend fun syncNow(): Boolean {
        config.refresh()
        outbox.drain()
        if (!session.isSignedIn) return true
        val since = settings.current().lastSyncAt
        val r = apiCall { api.sync(since) }
        if (r !is ApiResult.Ok) return r !is ApiResult.Offline
        val s = r.value
        if (s.removedPosts.isNotEmpty()) { db.posts().deleteMany(s.removedPosts); db.feed().removeRefs(s.removedPosts) }
        s.posts.take(30).forEach { id -> tribe.refreshPost(id) }
        if (s.memberships.isNotEmpty()) explore.refreshMyTrips()
        if (s.unreadNotifications > 0) activity.refresh()
        settings.setLastSync(s.serverTime)
        account.refreshMe()
        return true
    }
}

private const val KEY_DEMO_CACHE = "demo_cache"

class UnsoloApp : Application(), SingletonImageLoader.Factory {
    lateinit var graph: AppGraph; private set
    @Volatile var coldStart = true

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        NotificationChannels.create(this)
        graph.bootstrap()
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                graph.analytics.onForeground()
                SyncWorker.runOnce(this@UnsoloApp)
            }
            override fun onStop(owner: LifecycleOwner) {
                graph.analytics.onBackground()
                EventsFlushWorker.schedule(this@UnsoloApp)
            }
        })
    }

    /** Coil: memory + 250 MB disk cache, OkHttp fetcher, demo:// placeholders mapped to drawables. */
    override fun newImageLoader(context: PlatformContext): ImageLoader = ImageLoader.Builder(context)
        .memoryCache { MemoryCache.Builder().maxSizePercent(context, 0.20).build() }
        .diskCache { DiskCache.Builder().directory(cacheDir.resolve("images").toOkioPath()).maxSizeBytes(250L * 1024 * 1024).build() }
        .components {
            add(OkHttpNetworkFetcherFactory(callFactory = { graph.network.imageClient }))
            add(Mapper<String, Int> { data: String, _: Options -> DemoImages.resolve(data) })
        }
        .crossfade(true)
        .build()
}
