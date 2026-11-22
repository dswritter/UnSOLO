package com.unsolo.app.ui.profile

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.unsolo.app.AppGraph
import com.unsolo.app.BuildConfig
import com.unsolo.app.core.demo.DemoMode
import com.unsolo.app.core.model.*
import com.unsolo.app.core.prefs.Tab
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.LocalHeaderCounts
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens
import com.unsolo.app.ui.tribe.ReportSheet
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import com.unsolo.app.core.net.AppJson
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.userMessage
import kotlinx.serialization.json.add

class ProfileViewModel(private val g: AppGraph, val username: String?) : ViewModel() {
    val profile = (username?.let { g.tribe.observeProfile(it) } ?: flowOf(null)).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    val myTrips = g.explore.observeMyTrips().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    init { viewModelScope.launch { username?.let { g.tribe.refreshProfile(it) }; if (username == g.account.me.value?.user?.username) g.explore.refreshMyTrips() } }
    fun message(userId: String, onRoom: (String) -> Unit) = viewModelScope.launch { (g.tribe.openDirectChat(userId) as? com.unsolo.app.core.net.ApiResult.Ok)?.let { onRoom(it.value.roomId) } }
    fun report(userId: String, reason: String, details: String?) = viewModelScope.launch { g.tribe.report("user", userId, reason, details) }
    fun block(userId: String) = viewModelScope.launch { g.tribe.block(userId) }
}

@Composable
fun YouScreen(nav: AppNav) {
    val me by nav.graph.account.me.collectAsStateWithLifecycle()
    val signedIn by nav.graph.account.isSignedIn.collectAsStateWithLifecycle()
    val c = Pc.colors
    val user = me?.user
    if (!signedIn || user == null) {
        Column(Modifier.fillMaxSize().background(c.paper).verticalScroll(rememberScrollState())) {
            PageHeader("You", LocalHeaderCounts.current, { nav.to(Routes.AUTH) }, { nav.to(Routes.AUTH) })
            EmptyState("Browse freely. Sign in to join.", "Posting, joining plans and chats need an account with a verified email or phone.", action = "Sign in or create account", onAction = { nav.to(Routes.AUTH) })
            FormCard { NavRow("Settings", "Landing tab, data saver", PcIcons.Sliders, { nav.to(Routes.SETTINGS) }) }
        }
        return
    }
    ProfileBody(nav, user.username, own = true)
}

@Composable
fun ProfileScreen(username: String, nav: AppNav) {
    val own = nav.graph.account.me.collectAsStateWithLifecycle().value?.user?.username == username
    ProfileBody(nav, username, own)
}

@Composable
private fun ProfileBody(nav: AppNav, username: String, own: Boolean) {
    val vm: ProfileViewModel = viewModel(key = "profile-$username") { ProfileViewModel(nav.graph, username) }
    val profile by vm.profile.collectAsStateWithLifecycle()
    val trips by vm.myTrips.collectAsStateWithLifecycle()
    val me by nav.graph.account.me.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf("posts") }
    var report by remember { mutableStateOf(false) }
    val c = Pc.colors
    val user = profile?.user ?: if (own) me?.user else null
    val posts = profile?.posts.orEmpty()
    val plans = posts.filter { it.kind == PostKind.PLAN }
    val tiles = posts.filter { it.kind != PostKind.PLAN }

    LazyVerticalGrid(GridCells.Fixed(3), Modifier.fillMaxSize().background(c.paper), contentPadding = PaddingValues(horizontal = 0.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        item(span = { GridItemSpan(3) }, key = "head") {
            Column {
                Column(Modifier.statusBarsPadding()) {
                    Row(Modifier.fillMaxWidth().height(PcTokens.topBar).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (!own) IconTap(PcIcons.Back, "Back", { nav.back() })
                        Spacer(Modifier.weight(1f))
                        IconTap(PcIcons.Share, "Share profile", { nav.share("https://unsolo.in/profile/$username") })
                        if (own) IconTap(PcIcons.Sliders, "Settings", { nav.to(Routes.SETTINGS) })
                        else IconTap(PcIcons.More, "More", { report = true })
                        HeaderActions(LocalHeaderCounts.current, { if (nav.requireSignIn()) nav.to(Routes.INBOX) }, { if (nav.requireSignIn()) nav.to(Routes.ACTIVITY) })
                    }
                }
                Row(Modifier.padding(horizontal = Gutter), verticalAlignment = Alignment.CenterVertically) {
                    // A ring when they have live stories: tap to play them.
                    if (user != null) com.unsolo.app.ui.status.StatusAvatar(nav, user, 64.dp) else Avatar(user, 60.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(user?.name ?: username, style = Pc.type.title1, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (user?.isIdVerified == true) { Spacer(Modifier.width(6.dp)); VerifiedMark() }
                            if (user?.isHost == true) { Spacer(Modifier.width(6.dp)); Tag("Host", TagKind.Host) }
                        }
                        Text(listOfNotNull("@$username", user?.homeCity, user?.mutuals?.takeIf { it > 0 }?.let { "$it mutual" }).joinToString(" · "), style = Pc.type.small, color = c.ink2)
                    }
                }
                user?.bio?.let { Text(it, style = Pc.type.body, color = c.ink, modifier = Modifier.padding(horizontal = Gutter, vertical = 8.dp)) }
                Spacer(Modifier.height(10.dp))
                Row(Modifier.padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (own) {
                        PcButton("Settings", { nav.to(Routes.SETTINGS) }, Modifier.weight(1f), kind = BtnKind.Outline)
                        if (user?.isHost == true || nav.graph.config.config.value.flags.hostOffersEnabled) PcButton("Hosting", { nav.to(Routes.HOST) }, Modifier.weight(1f), kind = BtnKind.Outline)
                    } else {
                        PcButton("Message", { if (nav.requireSignIn()) user?.let { u -> vm.message(u.id) { nav.to(Routes.chat(it)) } } }, Modifier.weight(1f))
                    }
                }
                Spacer(Modifier.height(16.dp))
                Row(Modifier.padding(horizontal = Gutter).fillMaxWidth().tonalFill()) {
                    Stat("${user?.tripsCount ?: trips?.past?.size ?: 0}", "trips", Modifier.weight(1f))
                    Stat("${posts.size}", "posts", Modifier.weight(1f))
                    Stat("${user?.followers ?: 0}", "followers", Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
                TextTabs(listOf("posts" to "Posts", "plans" to "Plans · ${plans.size}", "trips" to "Trips"), tab, { tab = it })
                profile?.openPlan?.takeIf { tab == "posts" }?.let { p ->
                    Row(Modifier.padding(horizontal = Gutter, vertical = 10.dp).fillMaxWidth().pencilledCard().clickable { nav.to(Routes.post(p.id)) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        MiniArc(p.spotsTotal ?: p.seats.size, p.memberCount, women = p.audience == "women")
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(p.title ?: "Open plan", style = Pc.type.bodyStrong.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink)
                            Text("Plan · ${p.memberCount} of ${p.spotsTotal ?: p.seats.size} · ${((p.spotsTotal ?: 0) - p.memberCount).coerceAtLeast(0)} spots open", style = Pc.type.small, color = c.ink2)
                        }
                        Text(Fmt.range(p.startsOn, p.endsOn), style = Pc.type.num, color = c.ink)
                    }
                }
            }
        }
        when (tab) {
            "posts" -> {
                if (tiles.isEmpty()) item(span = { GridItemSpan(3) }) { EmptyState("No posts yet", if (own) "Share a story from a trip or ask the Tribe something." else "Nothing shared yet.") }
                items(tiles, key = { it.id }) { p ->
                    Box(Modifier.aspectRatio(1f).clip(RoundedCornerShape(PcTokens.radiusImage)).clickable { nav.to(Routes.post(p.id)) }) {
                        if (p.media.isNotEmpty()) ProgressiveImage(p.media.first(), Modifier.fillMaxSize())
                        else Box(Modifier.fillMaxSize().background(c.raised).padding(8.dp)) { Text(p.title ?: p.body, style = Pc.type.smallStrong, color = c.ink, maxLines = 5) }
                        Text(p.kind.uppercase(), style = Pc.type.code, color = c.ink, modifier = Modifier.align(Alignment.BottomStart).padding(6.dp).clip(CircleShape).background(c.raised.copy(alpha = 0.9f)).padding(horizontal = 7.dp, vertical = 2.dp))
                    }
                }
            }
            "plans" -> {
                if (plans.isEmpty()) item(span = { GridItemSpan(3) }) { EmptyState("No plans", "Plans are informal trips and meetups people can ask to join.") }
                items(plans, key = { "pl-" + it.id }, span = { GridItemSpan(3) }) { p ->
                    Row(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().pencilledCard().clickable { nav.to(Routes.post(p.id)) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        MiniArc(p.spotsTotal ?: p.seats.size, p.memberCount, women = p.audience == "women")
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(p.title ?: "Plan", style = Pc.type.bodyStrong.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink)
                            Text("${p.memberCount} of ${p.spotsTotal ?: p.seats.size} · ${p.status}", style = Pc.type.small, color = c.ink2)
                        }
                        Text(Fmt.range(p.startsOn, p.endsOn), style = Pc.type.num, color = c.ink)
                    }
                }
            }
            else -> {
                val past = if (own) trips?.past.orEmpty() else emptyList()
                if (past.isEmpty()) item(span = { GridItemSpan(3) }) { EmptyState("Trip log", if (own) "Your past UnSOLO trips show here." else "Trips are shown to the traveller only.") }
                items(past, key = { "t-" + it.id }, span = { GridItemSpan(3) }) { b ->
                    Row(Modifier.padding(horizontal = Gutter, vertical = 5.dp).fillMaxWidth().raisedCard().clickable { nav.to(Routes.trip(b.trip.slug)) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(Fmt.dayMonth(b.travelDate), style = Pc.type.num, color = c.ink, modifier = Modifier.width(72.dp))
                        Text(b.trip.title, style = Pc.type.bodyStrong, color = c.ink, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
        item(span = { GridItemSpan(3) }) { Spacer(Modifier.height(24.dp)) }
    }
    if (report && user != null) ReportSheet(user, onDismiss = { report = false }, onSubmit = { r, d -> report = false; if (nav.requireSignIn()) vm.report(user.id, r, d) },
        onBlock = { report = false; if (nav.requireSignIn()) { vm.block(user.id); nav.back() } })
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier) {
    Column(modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(value, style = Pc.type.numLarge, color = Pc.colors.ink)
        Text(label, style = Pc.type.small, color = Pc.colors.ink2)
    }
}

// ---------------- Settings ----------------

private val InterestOptions = listOf("Treks", "Mountains", "Beaches", "Budget", "Food", "Photography", "Spiritual", "Wildlife", "Road trips", "Weekends", "Festivals", "Slow travel")
private val Genders = listOf("woman" to "Woman", "man" to "Man", "nonbinary" to "Non-binary", "prefer_not" to "Prefer not to say")
private val QuietPresets = listOf("21:00", "22:00", "23:00", "00:00")
private val WakePresets = listOf("06:00", "07:00", "08:00", "09:00")

@Composable
fun SettingsScreen(nav: AppNav) {
    val g = nav.graph
    val me by g.account.me.collectAsStateWithLifecycle()
    val local by g.settings.data.collectAsStateWithLifecycle(initialValue = null)
    val signedIn by g.account.isSignedIn.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var deleting by remember { mutableStateOf(false) }
    val c = Pc.colors
    val prefs = me?.preferences ?: Preferences()
    val locLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        scope.launch {
            g.settings.setNearMe(granted)
            if (signedIn) g.account.updatePreferences(buildJsonObject { put("suggestByLocation", granted) })
            if (granted) g.location.get()
        }
    }
    fun put(block: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) = scope.launch { if (signedIn) g.account.updatePreferences(buildJsonObject(block)) }
    // PUT /me/preferences is partial at the top level; nested objects are always sent whole.
    fun setNotify(n: Notify) = put { put("notify", AppJson.encodeToJsonElement(Notify.serializer(), n)) }

    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Settings", onBack = { nav.back() })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            SettingsHeader("Start the app on")
            Segmented(Tab.landingChoices.map { it to Tab.label(it) }, local?.landingTab ?: Tab.EXPLORE, { t -> scope.launch { g.account.setLandingTab(t) } })
            Text("We may suggest a change if you open another tab most.", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(horizontal = Gutter, vertical = 8.dp))

            if (signedIn) {
                SettingsHeader("Notifications")
                val push = prefs.notify.push
                FormCard {
                    listOf(
                        Triple("plans", "Plans and requests", push.plans), Triple("replies", "Replies and answers", push.replies),
                        Triple("messages", "Messages", push.messages), Triple("trips", "Trips and payments", push.trips),
                        Triple("tags", "Story tags", push.tags), Triple("marketing", "Offers and news", push.marketing),
                    ).forEachIndexed { i, (key, label, on) ->
                        if (i > 0) InsetRule()
                        SwitchRow(label, null, on, { v -> setNotify(prefs.notify.copy(push = push.with(key, v))) })
                    }
                    InsetRule()
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Quiet hours", style = Pc.type.bodyStrong, color = c.ink)
                            Text("Messages and trip alerts still come through", style = Pc.type.small, color = c.ink2)
                        }
                        val q = prefs.notify.quietHours ?: QuietHours()
                        TimeChip(q.from, QuietPresets) { v -> setNotify(prefs.notify.copy(quietHours = q.copy(from = v))) }
                        Text(" – ", style = Pc.type.num, color = c.ink2)
                        TimeChip(q.to, WakePresets) { v -> setNotify(prefs.notify.copy(quietHours = q.copy(to = v))) }
                    }
                }
            }

            SettingsHeader("Suggestions")
            FormCard {
                SwitchRow("Suggestions near me", "Uses approximate location only, never stored", local?.nearMe == true, { on ->
                    if (on) locLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                    else scope.launch { g.settings.setNearMe(false); if (signedIn) g.account.updatePreferences(buildJsonObject { put("suggestByLocation", false) }) }
                })
                if (signedIn) {
                    InsetRule()
                    SwitchRow("Suggest by gender", "Shows women-only plans when you're a woman", prefs.suggestByGender, { v -> put { put("suggestByGender", v) } })
                    InsetRule()
                    Column(Modifier.padding(16.dp)) {
                        Text("Gender (optional)", style = Pc.type.bodyStrong, color = c.ink)
                        Text("Used for women-only plans and suggestions. Not shown on your profile.", style = Pc.type.small, color = c.ink2)
                        Spacer(Modifier.height(10.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Genders.forEach { (k, l) -> PcChip(l, me?.user?.gender == k, { scope.launch { g.account.patchMe(PatchMeRequest(gender = k)) } }) }
                        }
                    }
                    InsetRule()
                    Column(Modifier.padding(16.dp)) {
                        Text("Interests", style = Pc.type.bodyStrong, color = c.ink)
                        Spacer(Modifier.height(10.dp))
                        FlowRowChips(InterestOptions, prefs.interests.toSet()) { tag ->
                            val next = if (tag in prefs.interests) prefs.interests - tag else prefs.interests + tag
                            put { putJsonArray("interests") { next.forEach { add(it) } } }
                        }
                    }
                }
            }

            SettingsHeader("Data")
            FormCard { SwitchRow("Data saver", "Low-resolution photos only", local?.dataSaver == true, { v -> scope.launch { g.account.setDataSaver(v) } }) }

            SettingsHeader("Account")
            FormCard {
                if (signedIn) {
                    val verified = me?.user?.isPhoneVerified == true
                    NavRow(if (verified) "Phone verified" else "Verify your phone", me?.user?.phone ?: "Needed to host trips; lets you sign in by SMS", PcIcons.Phone, { if (!verified) nav.to(Routes.PHONE) }, trailing = if (verified) "✓" else null)
                    InsetRule(start = 66.dp)
                    NavRow("Leaderboard", "Points from stories and trips", PcIcons.Trophy, { nav.openWeb("/leaderboard") })
                    InsetRule(start = 66.dp)
                } else { NavRow("Sign in", "Or create an account", PcIcons.User, { nav.to(Routes.AUTH) }); InsetRule(start = 66.dp) }
                NavRow("Privacy and terms", null, PcIcons.Shield, { nav.openWeb("/privacy") })
                if (signedIn) {
                    InsetRule(start = 66.dp)
                    NavRow("Sign out", com.unsolo.app.core.auth.AccountContact.label(me?.user?.email, me?.user?.phone)?.let { "Signed in as $it" }, PcIcons.Logout, { scope.launch { g.account.signOut(g.push.currentToken()); nav.tab(Routes.EXPLORE) } }, danger = true)
                    InsetRule(start = 66.dp)
                    NavRow("Delete account", "Removes your profile, posts and sign-in", PcIcons.Close, { deleting = true }, danger = true)
                }
            }
            if (deleting) DeleteAccountSheet(onDismiss = { deleting = false }, onDelete = { g.account.deleteAccount() },
                onDeleted = { deleting = false; nav.tab(Routes.EXPLORE) }, onLearnMore = { nav.openWeb("/account/delete") })
            Text("UnSOLO ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})" + if (DemoMode.enabled) " · demo data" else "", style = Pc.type.label, color = c.ink3, modifier = Modifier.navigationBarsPadding().padding(Gutter))
        }
    }
}

private fun NotifyChannels.with(key: String, v: Boolean) = when (key) {
    "plans" -> copy(plans = v); "replies" -> copy(replies = v); "messages" -> copy(messages = v)
    "trips" -> copy(trips = v); "tags" -> copy(tags = v); else -> copy(marketing = v)
}

@Composable
private fun SettingsHeader(text: String) {
    Overline(text, Modifier.padding(start = Gutter + 4.dp, end = Gutter, top = 24.dp, bottom = 8.dp))
}

@Composable
private fun TimeChip(value: String, presets: List<String>, onPick: (String) -> Unit) {
    val c = Pc.colors
    Text(value, style = Pc.type.price.copy(fontSize = 12.sp), color = c.ink, modifier = Modifier.clip(CircleShape).background(tonal())
        .clickable { onPick(presets[(presets.indexOf(value) + 1).mod(presets.size)]) }.padding(horizontal = 10.dp, vertical = 10.dp))
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun FlowRowChips(options: List<String>, selected: Set<String>, onToggle: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { o -> PcChip(o, o in selected, { onToggle(o) }, solidSelected = false) }
    }
}


/** Delete account: type DELETE, then the server removes the account and the app signs out. */
@Composable
private fun DeleteAccountSheet(onDismiss: () -> Unit, onDelete: suspend () -> ApiResult<Unit>, onDeleted: () -> Unit, onLearnMore: () -> Unit) {
    val c = Pc.colors
    val scope = rememberCoroutineScope()
    var typed by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    PcSheet({ if (!busy) onDismiss() }) {
        Column(Modifier.padding(horizontal = Gutter)) {
            Text("Delete your account?", style = Pc.type.title1, color = c.ink)
            Spacer(Modifier.height(6.dp))
            Text("This can't be undone. Your profile, Tribe posts, comments, chats and sign-in are deleted. Bookings and payments stay in our records without your name.", style = Pc.type.small, color = c.ink2)
            Spacer(Modifier.height(14.dp))
            Text("Type DELETE to confirm", style = Pc.type.bodyStrong, color = c.ink)
            Spacer(Modifier.height(6.dp))
            BoxedInput(typed, { typed = it.take(10) }, "DELETE")
            error?.let { Text(it, style = Pc.type.small, color = c.red, modifier = Modifier.padding(top = 8.dp)) }
            Spacer(Modifier.height(14.dp))
            PcButton(if (busy) "Deleting…" else "Delete my account", {
                busy = true; error = null
                scope.launch {
                    when (val r = onDelete()) {
                        is ApiResult.Ok -> onDeleted()
                        is ApiResult.Err -> { error = r.userMessage(); busy = false }
                        ApiResult.Offline -> { error = "You're offline. Connect and try again."; busy = false }
                    }
                }
            }, Modifier.fillMaxWidth(), kind = BtnKind.Danger, enabled = typed.trim() == "DELETE" && !busy)
            Spacer(Modifier.height(8.dp))
            PcButton("What gets deleted", onLearnMore, Modifier.fillMaxWidth(), kind = BtnKind.Ghost, enabled = !busy)
            Spacer(Modifier.height(8.dp))
        }
    }
}
