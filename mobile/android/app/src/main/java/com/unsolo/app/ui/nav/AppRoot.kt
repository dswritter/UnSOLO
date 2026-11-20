package com.unsolo.app.ui.nav

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.unsolo.app.AppGraph
import com.unsolo.app.core.demo.DemoMode
import com.unsolo.app.core.model.UserLite
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.prefs.LandingPolicy
import com.unsolo.app.core.prefs.Tab
import com.unsolo.app.data.AppEvent
import com.unsolo.app.ui.activity.ActivityScreen
import com.unsolo.app.ui.activity.ChatScreen
import com.unsolo.app.ui.activity.InboxScreen
import com.unsolo.app.ui.auth.AuthScreen
import com.unsolo.app.ui.auth.PhoneVerifyScreen
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.compose.ComposeScreen
import com.unsolo.app.ui.compose.PostTypeSheet
import com.unsolo.app.ui.explore.ExploreScreen
import com.unsolo.app.ui.explore.SearchScreen
import com.unsolo.app.ui.explore.TripDetailScreen
import com.unsolo.app.ui.host.HostScreen
import com.unsolo.app.ui.host.OfferFormScreen
import com.unsolo.app.ui.host.OffersReviewScreen
import com.unsolo.app.ui.profile.ProfileScreen
import com.unsolo.app.ui.profile.SettingsScreen
import com.unsolo.app.ui.profile.YouScreen
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.tribe.HeldPromptSheet
import com.unsolo.app.ui.tribe.PostDetailScreen
import com.unsolo.app.ui.tribe.StoryViewerScreen
import com.unsolo.app.ui.tribe.TribeScreen
import com.unsolo.app.ui.trips.MyTripsScreen
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate

/** Navigation helper handed to screens. */
@Stable
class AppNav(
    val controller: NavHostController,
    val graph: AppGraph,
    private val context: Context,
    val openPostSheet: () -> Unit,
) {
    fun to(route: String) = controller.navigate(route) { launchSingleTop = true }
    fun back() { if (!controller.popBackStack()) tab(Routes.EXPLORE) }
    fun tab(route: String) = controller.navigate(route) {
        popUpTo(controller.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
    /** Return to a tab already on the back stack (e.g. after publishing) without restoring stale saved state. */
    fun popToTab(route: String) { if (!controller.popBackStack(route, inclusive = false)) tab(route) }
    /** Notification/push links: same-site paths only; anything else (or unknown) opens Activity. */
    fun link(path: String?) {
        val r = DeepLinks.routeForPath(path) ?: Routes.ACTIVITY
        if (r in Routes.tabs) tab(r) else to(r)
    }

    /** Payments stay on the web: open /packages/{slug}?book=1 in a Custom Tab. */
    fun openWeb(pathOrUrl: String, dark: Boolean = false) {
        val url = if (pathOrUrl.startsWith("https://")) pathOrUrl else DeepLinks.WEB + pathOrUrl
        val uri = Uri.parse(url)
        if (uri.host != "unsolo.in" && uri.host != "www.unsolo.in") return
        val colors = CustomTabColorSchemeParams.Builder().setToolbarColor((if (dark) 0xFF0F0F0F else 0xFFFAFAF7).toInt()).build()
        runCatching {
            CustomTabsIntent.Builder().setShowTitle(true).setDefaultColorSchemeParams(colors).build().launchUrl(context, uri)
        }.onFailure { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
    }

    /** Supabase OAuth authorize page (Google fallback). Only the configured Supabase host, over https. */
    fun openAuthUrl(url: String) {
        val uri = Uri.parse(url)
        val supa = Uri.parse(graph.config.supabase().url)
        if (uri.scheme != "https" || uri.host == null || uri.host != supa.host) return
        runCatching { CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, uri) }
            .onFailure { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
    }

    fun share(text: String) {
        val i = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        context.startActivity(Intent.createChooser(i, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** @return true when signed in; otherwise routes to sign-in. */
    fun requireSignIn(): Boolean { if (graph.account.isSignedIn.value) return true; to(Routes.AUTH); return false }
    fun requirePhone(): Boolean {
        if (!requireSignIn()) return false
        if (graph.account.canPost) return true
        to(Routes.PHONE); return false
    }
}

class MainViewModel(private val g: AppGraph) : ViewModel() {
    val counts: StateFlow<HeaderCounts> = combine(g.activity.observeUnread(), g.chat.observeUnread()) { a, m -> HeaderCounts(m, a) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), HeaderCounts())
    val me: StateFlow<UserLite?> = g.account.me.map { it?.user }.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val online = g.connectivity.online
    val dataSaver = g.settings.data.map { it.dataSaver }.stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val landingPrompt = MutableStateFlow<String?>(null)
    private var landingChecked = false

    init {
        viewModelScope.launch {
            if (g.account.isSignedIn.value) { g.activity.refresh(); g.chat.refreshChats() }
        }
    }

    /** On launch: GET /me/landing-suggestion (or the local rule for guests/offline) → maybe prompt. */
    fun checkLanding() {
        if (landingChecked) return
        landingChecked = true
        viewModelScope.launch {
            kotlinx.coroutines.delay(1500) // let the first screen settle
            val prefs = g.settings.current()
            val r = g.account.landingSuggestion()
            val tab = LandingPolicy.decide(
                serverAvailable = r is ApiResult.Ok, serverSuggest = (r as? ApiResult.Ok)?.value?.suggest,
                localVisits = prefs.visits, today = LocalDate.now().toEpochDay(), currentLanding = prefs.landingTab,
                dismissed = prefs.landingPromptDismissed, lastShownAt = prefs.landingPromptLastShown, now = System.currentTimeMillis(),
            )
            if (tab != null) {
                landingPrompt.value = tab
                g.settings.setLandingShown(System.currentTimeMillis())
                g.analytics.track("landing.prompt_shown")
            }
        }
    }

    fun acceptLanding(tab: String) = viewModelScope.launch {
        landingPrompt.value = null
        g.account.setLandingTab(tab)
        g.analytics.track("landing.prompt_accepted", props = mapOf("tab" to tab))
    }

    fun dismissLanding() = viewModelScope.launch { landingPrompt.value = null; g.account.dismissLanding() }

    fun recordTab(route: String?) = viewModelScope.launch {
        val tab = when (route) { Routes.EXPLORE -> Tab.EXPLORE; Routes.TRIBE -> Tab.TRIBE; Routes.TRIPS -> Tab.TRIPS; else -> null }
        if (tab != null) g.settings.recordVisit(tab)
        screenName(route)?.let { g.analytics.screen(it) }
    }

    private fun screenName(route: String?) = when (route) {
        Routes.EXPLORE -> "explore"; Routes.TRIBE -> "tribe"; Routes.TRIPS -> "trips"; Routes.YOU -> "you"
        Routes.TRIP -> "trip_detail"; Routes.POST -> "post_detail"; Routes.COMPOSE -> "compose"
        Routes.ACTIVITY -> "activity"; Routes.INBOX, Routes.CHAT -> "inbox"; else -> null
    }
}

private val tabRoutes = setOf(Routes.EXPLORE, Routes.TRIBE, Routes.TRIPS, Routes.YOU)

@Composable
fun AppRoot(graph: AppGraph, startRoute: String, newIntents: Flow<Intent>) {
    val context = LocalContext.current
    val controller = rememberNavController()
    val vm: MainViewModel = viewModel { MainViewModel(graph) }
    var postSheet by remember { mutableStateOf(false) }
    var held by remember { mutableStateOf<AppEvent.PostHeld?>(null) }
    val nav = remember(controller) { AppNav(controller, graph, context, openPostSheet = { postSheet = true }) }
    val entry by controller.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val counts by vm.counts.collectAsStateWithLifecycle()
    val me by vm.me.collectAsStateWithLifecycle()
    val online by vm.online.collectAsStateWithLifecycle()
    val dataSaver by vm.dataSaver.collectAsStateWithLifecycle()
    val landing by vm.landingPrompt.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val demoFallback by DemoMode.fallback.collectAsStateWithLifecycle()

    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    LaunchedEffect(Unit) { newIntents.collect { controller.handleDeepLink(it) } }
    LaunchedEffect(route) { vm.recordTab(route) }
    LaunchedEffect(Unit) { vm.checkLanding() }
    LaunchedEffect(Unit) {
        graph.events.flow.collect { e ->
            when (e) {
                is AppEvent.Message -> snackbar.showSnackbar(e.text)
                is AppEvent.PostHeld -> held = e
                AppEvent.NeedsSignIn -> nav.to(Routes.AUTH)
                AppEvent.NeedsPhone -> nav.to(Routes.PHONE)
                AppEvent.AskNotificationPermission -> {
                    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        && !graph.settings.current().notifPermissionAsked) {
                        graph.settings.setNotifAsked()
                        notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
            }
        }
    }

    val tabs = listOf(
        TabSpec(Routes.EXPLORE, "Explore", PcIcons.Compass, iconSelected = PcIcons.CompassFilled),
        TabSpec(Routes.TRIBE, "Tribe", PcIcons.UsersThree),
        TabSpec(Routes.TRIPS, "My trips", PcIcons.Ticket),
        TabSpec(Routes.YOU, "You", PcIcons.UserCircle),
    )

    val headerNav = remember(nav) { HeaderNav(onMessages = { if (nav.requireSignIn()) nav.to(Routes.INBOX) }, onActivity = { if (nav.requireSignIn()) nav.to(Routes.ACTIVITY) }) }
    val photoHeader = route == Routes.TRIP || route == Routes.STORY
    val cfg by graph.config.config.collectAsStateWithLifecycle()
    if (com.unsolo.app.data.ConfigStore.isOlder(com.unsolo.app.BuildConfig.VERSION_NAME, cfg.minAppVersion.android)) {
        UpgradeRequired { nav.openWebOrStore(context) }
        return
    }
    CompositionLocalProvider(LocalDataSaver provides dataSaver, LocalHeaderCounts provides counts, LocalHeaderCountsUi provides counts, LocalHeaderNav provides headerNav) {
        Box(Modifier.fillMaxSize().background(Pc.colors.paper)) {
            Column(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f)) {
                    NavHost(controller, startDestination = startRoute) { graphRoutes(nav) }
                }
                if (route in tabRoutes) {
                    OfflineBanner(visible = !online, demo = demoFallback)
                    PcBottomBar(route, tabs, me, onSelect = { nav.tab(it) }, onPost = { postSheet = true })
                }
            }
            if (!photoHeader) Box(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(Pc.colors.paper))
            SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(bottom = 96.dp, start = 16.dp, end = 16.dp)) { d ->
                Snackbar(containerColor = Pc.colors.ink, contentColor = Pc.colors.paper, shape = RoundedCornerShape(18.dp)) { Text(d.visuals.message, style = Pc.type.smallStrong) }
            }
        }
        if (postSheet) PostTypeSheet(onDismiss = { postSheet = false }, onPick = { kind ->
            postSheet = false
            if (nav.requirePhone()) nav.to(Routes.compose(kind))
        }, onHosting = { postSheet = false; nav.to(Routes.HOST) })
        held?.let { h -> HeldPromptSheet(h.prompts, onDismiss = { held = null }, onOpen = { held = null; nav.to(Routes.post(h.postId)) }, onHost = { held = null; nav.openWeb("/host") }) }
        landing?.let { tab -> LandingPromptSheet(tab, onAccept = { vm.acceptLanding(tab) }, onDismiss = { vm.dismissLanding() }) }
    }
}

val LocalHeaderCounts = staticCompositionLocalOf { HeaderCounts() }

private fun androidx.navigation.NavGraphBuilder.graphRoutes(nav: AppNav) {
    fun links(vararg paths: String) = paths.flatMap { p -> listOf(DeepLinks.WEB + p, DeepLinks.WEB_WWW + p, DeepLinks.SCHEME + p.trimStart('/')) }.map { navDeepLink { uriPattern = it } }

    composable(Routes.EXPLORE) { ExploreScreen(nav) }
    composable(Routes.TRIBE, deepLinks = links("/tribe")) { TribeScreen(nav) }
    composable(Routes.TRIPS, deepLinks = links("/bookings")) { MyTripsScreen(nav) }
    composable(Routes.YOU) { YouScreen(nav) }
    composable(Routes.SEARCH) { SearchScreen(nav) }
    composable(Routes.TRIP, arguments = listOf(navArgument("slug") { type = NavType.StringType }), deepLinks = links("/packages/{slug}")) {
        val slug = it.arguments?.getString("slug")
        if (DeepLinks.validSlug(slug)) TripDetailScreen(slug!!, nav) else InvalidLink(nav)
    }
    composable(Routes.POST, arguments = listOf(navArgument("id") { type = NavType.StringType }), deepLinks = links("/tribe/p/{id}")) {
        val id = it.arguments?.getString("id")
        if (DeepLinks.validId(id)) PostDetailScreen(id!!, nav) else InvalidLink(nav)
    }
    composable(Routes.PROFILE, arguments = listOf(navArgument("username") { type = NavType.StringType }), deepLinks = links("/profile/{username}")) {
        val u = it.arguments?.getString("username")
        if (DeepLinks.validUsername(u)) ProfileScreen(u!!, nav) else InvalidLink(nav)
    }
    composable(Routes.CHAT, arguments = listOf(navArgument("roomId") { type = NavType.StringType }), deepLinks = links("/chat/{roomId}")) {
        val id = it.arguments?.getString("roomId")
        if (DeepLinks.validId(id)) ChatScreen(id!!, nav) else InvalidLink(nav)
    }
    composable(Routes.INBOX) { InboxScreen(nav) }
    composable(Routes.ACTIVITY) { ActivityScreen(nav) }
    composable(Routes.SETTINGS) { SettingsScreen(nav) }
    composable(Routes.AUTH) { AuthScreen(nav) }
    composable(Routes.PHONE) { PhoneVerifyScreen(nav) }
    composable(Routes.STORY, arguments = listOf(navArgument("id") { type = NavType.StringType })) {
        val id = it.arguments?.getString("id")
        if (DeepLinks.validId(id)) StoryViewerScreen(id!!, nav) else InvalidLink(nav)
    }
    composable(Routes.COMPOSE, arguments = listOf(navArgument("kind") { type = NavType.StringType })) {
        val kind = it.arguments?.getString("kind")?.takeIf { k -> k in listOf("plan", "story", "ask", "poll") } ?: "plan"
        ComposeScreen(kind, nav)
    }
    composable(Routes.HOST) { HostScreen(nav) }
    composable(Routes.OFFER_FORM, arguments = listOf(navArgument("postId") { type = NavType.StringType })) {
        val id = it.arguments?.getString("postId")
        if (DeepLinks.validId(id)) OfferFormScreen(id!!, nav) else InvalidLink(nav)
    }
    composable(Routes.OFFERS, arguments = listOf(navArgument("postId") { type = NavType.StringType })) {
        val id = it.arguments?.getString("postId")
        if (DeepLinks.validId(id)) OffersReviewScreen(id!!, nav) else InvalidLink(nav)
    }
}

@Composable
private fun InvalidLink(nav: AppNav) {
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        DetailTopBar(null, onBack = { nav.back() })
        EmptyState("This link doesn't work", "It may be mistyped or out of date.", action = "Go to Explore", onAction = { nav.tab(Routes.EXPLORE) })
    }
}

/** Shown when GET /config says this build is below minAppVersion.android (kill switch). */
@Composable
private fun UpgradeRequired(onUpdate: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Pc.colors.paper).statusBarsPadding().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Wordmark()
        Spacer(Modifier.height(16.dp))
        Text("Update UnSOLO to keep going", style = Pc.type.title1, color = Pc.colors.ink)
        Text("This version is no longer supported. Your trips and chats are safe.", style = Pc.type.body, color = Pc.colors.ink2)
        Spacer(Modifier.height(20.dp))
        PcButton("Update from Play Store", onUpdate, Modifier.fillMaxWidth())
    }
}

private fun AppNav.openWebOrStore(context: Context) {
    val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.unsolo.app")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(market) }.onFailure { openWeb("/") }
}

@Composable
private fun LandingPromptSheet(tab: String, onAccept: () -> Unit, onDismiss: () -> Unit) {
    PcSheet(onDismiss = onDismiss) {
        Column(Modifier.padding(horizontal = Gutter)) {
            Text("You open ${Tab.label(tab)} most.", style = Pc.type.title1, color = Pc.colors.ink)
            Spacer(Modifier.height(4.dp))
            Text("Start the app on ${Tab.label(tab)}? You can change this any time in Settings.", style = Pc.type.body, color = Pc.colors.ink2)
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PcButton("Not now", onDismiss, Modifier.weight(1f), kind = BtnKind.Outline)
                PcButton("Start on ${Tab.label(tab)}", onAccept, Modifier.weight(1.4f))
            }
        }
    }
}
