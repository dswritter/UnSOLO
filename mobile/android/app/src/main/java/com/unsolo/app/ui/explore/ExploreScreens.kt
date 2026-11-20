package com.unsolo.app.ui.explore

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.unsolo.app.AppGraph
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.data.MoneyFormat
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.LocalHeaderCounts
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

val Categories = listOf("trips" to "Trips", "stays" to "Stays", "activities" to "Activities", "rentals" to "Rentals")

@OptIn(ExperimentalCoroutinesApi::class)
class ExploreViewModel(private val g: AppGraph) : ViewModel() {
    val category = MutableStateFlow("trips")
    val items: StateFlow<List<TripLite>> = category.flatMapLatest { g.explore.observeExplore(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val hero: StateFlow<Pair<TripLite?, TripDetail?>> = items.map { it.firstOrNull()?.slug }.distinctUntilChanged()
        .flatMapLatest { slug -> if (slug == null) flowOf(null to null) else g.explore.observeTrip(slug) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null to null)
    val suggestions = g.explore.observeSuggestions().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val refreshing = MutableStateFlow(false)
    val error = MutableStateFlow<String?>(null)
    val me = g.account.me

    init {
        viewModelScope.launch { category.collect { refresh() } }
        viewModelScope.launch {
            hero.map { it.first?.slug }.filterNotNull().distinctUntilChanged().collect { g.explore.refreshTrip(it) }
        }
        viewModelScope.launch { g.explore.refreshSuggestions(g.location.last?.lat, g.location.last?.lng) }
        // Faces are only sent to signed-in viewers: refetch when the session changes.
        viewModelScope.launch {
            g.account.isSignedIn.drop(1).distinctUntilChanged().collect {
                refresh(); hero.value.first?.slug?.let { s -> g.explore.refreshTrip(s) }
            }
        }
    }

    fun refresh() = viewModelScope.launch {
        refreshing.value = true
        val r = g.explore.refreshExplore(category.value)
        error.value = when (r) { is ApiResult.Err -> "Couldn't refresh"; ApiResult.Offline -> null; else -> null }
        refreshing.value = false
    }

    fun nearMe() = viewModelScope.launch {
        val loc = g.location.get()
        g.settings.setNearMe(true)
        g.explore.refreshSuggestions(loc?.lat, loc?.lng)
    }

    fun tapSuggestion(s: Suggestion) = g.analytics.track("suggestion.tap", "explore", mapOf("type" to s.type, "reason" to s.reason))
}

@Composable
fun ExploreScreen(nav: AppNav) {
    val vm: ExploreViewModel = viewModel { ExploreViewModel(nav.graph) }
    val category by vm.category.collectAsStateWithLifecycle()
    val items by vm.items.collectAsStateWithLifecycle()
    val hero by vm.hero.collectAsStateWithLifecycle()
    val suggestions by vm.suggestions.collectAsStateWithLifecycle()
    val me by vm.me.collectAsStateWithLifecycle()
    val counts = LocalHeaderCounts.current
    val locLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) vm.nearMe() }
    val c = Pc.colors

    LazyColumn(Modifier.fillMaxSize().background(c.paper)) {
        item(key = "header", contentType = "header") {
            Column(Modifier.statusBarsPadding()) {
                Row(Modifier.fillMaxWidth().height(PcTokens.topBar).padding(start = Gutter, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Wordmark()
                    Spacer(Modifier.weight(1f))
                    HeaderActions(counts, { if (nav.requireSignIn()) nav.to(Routes.INBOX) }, { if (nav.requireSignIn()) nav.to(Routes.ACTIVITY) })
                    Box(Modifier.size(44.dp).clickable { nav.tab(Routes.YOU) }, contentAlignment = Alignment.Center) { Avatar(me?.user, 32.dp) }
                }
                SearchPill { nav.to(Routes.SEARCH) }
                Spacer(Modifier.height(6.dp))
                TextTabs(Categories, category, { vm.category.value = it })
            }
        }
        val first = items.firstOrNull()
        if (first == null) {
            item(key = "empty") { EmptyState("Nothing here yet", "Pull the departures board again when you're back online.", action = "Retry", onAction = { vm.refresh() }) }
        } else {
            item(key = "hero-h", contentType = "section") { SectionHeader("Leaving next", Modifier.padding(top = 8.dp)) }
            item(key = "hero", contentType = "hero") {
                HeroDeparture(first, hero.second, onOpen = { nav.to(Routes.trip(first.slug)) }, onTake = {
                    nav.graph.analytics.track("trip.take_seat", "explore", mapOf("slug" to first.slug, "date" to first.nextDeparture))
                    nav.openWeb("/packages/${first.slug}?book=1")
                })
            }
            val planning = hero.second?.planningCount
            if (planning != null && planning >= 3) item(key = "bridge", contentType = "bridge") {
                TribeBridgeRow(planning, first.place?.name ?: first.title, hero.second?.stories?.size ?: 0, hero.second?.goingFaces.orEmpty()) { nav.tab(Routes.TRIBE) }
            }
        }
        if (suggestions.isNotEmpty() || category == "trips") item(key = "sugg", contentType = "rail") {
            SuggestionRail(suggestions, onNearMe = {
                if (nav.graph.location.hasPermission()) vm.nearMe() else locLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
            }) { s ->
                vm.tapSuggestion(s)
                s.trip?.let { nav.to(Routes.trip(it.slug)) } ?: s.post?.let { nav.to(Routes.post(it.id)) }
            }
        }
        if (items.size > 1) {
            item(key = "dep-h", contentType = "section") {
                SectionHeader("Departures", Modifier.padding(top = 12.dp), trailing = "See all ${items.size}", trailingLink = { nav.to(Routes.SEARCH) })
            }
            items(items.drop(1), key = { "dep-" + it.slug }, contentType = { "departure" }) { t -> DepartureRow(t) { nav.to(Routes.trip(t.slug)) } }
        }
        item(key = "pad") { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun SearchPill(onClick: () -> Unit) {
    val c = Pc.colors
    Row(
        Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().height(60.dp).raisedCard(radius = PcTokens.radiusPill)
            .clickable(role = Role.Button, onClickLabel = "Search", onClick = onClick).padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PcIcon(PcIcons.Search, null)
        Spacer(Modifier.width(12.dp))
        Column {
            Text("Where to?", style = Pc.type.bodyStrong, color = c.ink)
            Text("Any dates · 1 traveller", style = Pc.type.small, color = c.ink2)
        }
    }
}

@Composable
fun HeroDeparture(t: TripLite, detail: TripDetail?, onOpen: () -> Unit, onTake: () -> Unit) {
    val c = Pc.colors
    val seats = detail?.seats?.takeIf { it.isNotEmpty() } ?: seatsFromCounts(t.seatsTotal, t.seatsLeft)
    val taken = (t.seatsTotal ?: 0) - (t.seatsLeft ?: 0)
    Column(Modifier.padding(horizontal = Gutter).fillMaxWidth().raisedCard().clickable(onClick = onOpen)) {
        Box {
            ProgressiveImage(t.image, Modifier.fillMaxWidth().height(184.dp), t.title)
            Tag(Fmt.inDays(t.nextDeparture).ifBlank { "Next departure" }, TagKind.Muted, Modifier.padding(12.dp).clip(CircleShape).background(c.raised.copy(alpha = 0.92f)))
        }
        Column(Modifier.padding(16.dp)) {
            Text(t.title, style = Pc.type.title1.copy(fontSize = 26.sp), color = c.ink, maxLines = 2)
            Text(t.place?.name.orEmpty(), style = Pc.type.small, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(10.dp))
            Facts(listOf(Fact(PcIcons.Calendar, Fmt.dowDayMonth(t.nextDeparture)), Fact(PcIcons.Clock, Fmt.nights(t.durationDays)), Fact(PcIcons.Users, "$taken of ${t.seatsTotal ?: 0} going")))
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Who's going", style = Pc.type.bodyStrong, color = c.ink, modifier = Modifier.weight(1f))
                val left = t.seatsLeft ?: 0
                Text("$left seats left", style = Pc.type.smallStrong, color = if (left <= 5) c.red else c.ink2)
            }
            Spacer(Modifier.height(10.dp))
            SeatRow(seats, maxCell = PcTokens.seat)
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(MoneyFormat.rupees(t.priceFromPaise), style = Pc.type.numLarge, color = c.ink)
                        Text(" / person", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(bottom = 3.dp))
                    }
                    t.host?.let { Text("Hosted by ${it.name}", style = Pc.type.small, color = c.ink2) }
                }
                PcButton("Take a seat", onTake)
            }
        }
    }
}

@Composable
fun TribeBridgeRow(count: Int, place: String, stories: Int, faces: List<UserLite>, onClick: () -> Unit) {
    val c = Pc.colors
    Row(Modifier.padding(horizontal = Gutter, vertical = 12.dp).fillMaxWidth().pencilledCard().clickable(onClick = onClick).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        if (faces.isNotEmpty()) { FaceStack(faces.take(3), size = 28.dp); Spacer(Modifier.width(4.dp)) }
        Column(Modifier.weight(1f)) {
            Overline("In the Tribe")
            Text("$count people are planning ${place.substringBefore(',')}", style = Pc.type.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (stories > 0) Text("$stories stories from people who went", style = Pc.type.small, color = c.ink2)
        }
        PcIcon(PcIcons.ChevronRight, null, size = 18.dp, tint = c.ink2)
    }
}

@Composable
private fun SuggestionRail(items: List<Suggestion>, onNearMe: () -> Unit, onTap: (Suggestion) -> Unit) {
    val c = Pc.colors
    Column(Modifier.padding(top = 8.dp)) {
        SectionHeader("For you")
        LazyRow(contentPadding = PaddingValues(horizontal = Gutter, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            item(key = "near") {
                Column(Modifier.width(150.dp).height(120.dp).tonalFill().clickable(onClickLabel = "Suggestions near you", onClick = onNearMe).padding(14.dp)) {
                    Box(Modifier.size(36.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) { PcIcon(PcIcons.NearMe, null, size = 20.dp) }
                    Spacer(Modifier.weight(1f))
                    Text("Near you", style = Pc.type.bodyStrong, color = c.ink)
                    Text("Approximate location", style = Pc.type.small, color = c.ink2)
                }
            }
            items(items, key = { (it.trip?.slug ?: it.post?.id ?: "") + it.reason }) { s ->
                val title = s.trip?.title ?: s.post?.title ?: ""
                val sub = s.trip?.let { "${Fmt.dayMonth(it.nextDeparture)} · ${MoneyFormat.rupees(it.priceFromPaise)}" }
                    ?: s.post?.let { p -> "Community plan · ${Fmt.range(p.startsOn, p.endsOn)}" } ?: ""
                val plan = s.type == "plan"
                Column(Modifier.width(200.dp).height(120.dp).then(if (plan) Modifier.pencilledCard() else Modifier.raisedCard()).clickable { onTap(s) }.padding(14.dp)) {
                    Overline(s.reason)
                    Spacer(Modifier.height(6.dp))
                    Text(title, style = Pc.type.title3, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.weight(1f))
                    Text(sub, style = Pc.type.small, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/** Departures board entry: date column · title + seat dots · price. One raised card per departure. */
@Composable
fun DepartureRow(t: TripLite, onClick: () -> Unit) {
    val c = Pc.colors
    Row(Modifier.padding(horizontal = Gutter, vertical = 5.dp).fillMaxWidth().raisedCard().clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.width(48.dp).clip(RoundedCornerShape(PcTokens.radiusButton)).background(tonal()).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(Fmt.dayNum(t.nextDeparture), style = Pc.type.numLarge.copy(fontSize = 22.sp), color = c.ink)
            Text(Fmt.monUpper(t.nextDeparture), style = Pc.type.code, color = c.ink2)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(t.title, style = Pc.type.title3, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(6.dp))
            SeatStrip(seatsFromCounts(t.seatsTotal, t.seatsLeft))
            Spacer(Modifier.height(6.dp))
            val left = t.seatsLeft ?: 0
            Text(buildString {
                append("${Fmt.dowUpper(t.nextDeparture).lowercase().replaceFirstChar { it.uppercase() }} · ${Fmt.nights(t.durationDays)}")
                if (t.seatsTotal != null) append(" · $left left")
            }, style = Pc.type.small, color = if (left in 1..2) c.red else c.ink2)
        }
        Spacer(Modifier.width(8.dp))
        Text(MoneyFormat.rupees(t.priceFromPaise), style = Pc.type.price, color = c.ink)
    }
}

/** "HOSTED TRIP · BOOKABLE" card used on stories (sits inside a raised card, so it uses a 1dp rule). */
@Composable
fun HostedTripCard(t: TripLite, onOpen: () -> Unit, onTake: () -> Unit, label: String = "Hosted trip · bookable") {
    val c = Pc.colors
    val shape = RoundedCornerShape(PcTokens.radiusImage + 2.dp)
    Column(Modifier.fillMaxWidth().clip(shape).background(c.paper).border(1.dp, c.rule, shape).clickable(onClick = onOpen).padding(12.dp)) {
        Tag(label, TagKind.Muted)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            ProgressiveImage(t.image, Modifier.size(52.dp).clip(RoundedCornerShape(PcTokens.radiusImage)))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(t.title, style = Pc.type.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(MoneyFormat.rupees(t.priceFromPaise), style = Pc.type.price.copy(fontSize = 13.sp), color = c.ink)
                    Text(" · ${Fmt.dayMonth(t.nextDeparture)}${t.seatsLeft?.let { " · $it left" } ?: ""}", style = Pc.type.small, color = c.ink2, maxLines = 1)
                }
            }
            Spacer(Modifier.width(8.dp))
            PcButton("Take a seat", onTake, height = 44.dp)
        }
    }
}

// ---------------- Search ----------------

@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
class SearchViewModel(private val g: AppGraph) : ViewModel() {
    val query = MutableStateFlow("")
    val category = MutableStateFlow("trips")
    val results = combine(query.debounce(250), category) { q, c -> q to c }
        .flatMapLatest { (q, c) -> g.explore.observeExplore(c, q) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        viewModelScope.launch {
            combine(query.debounce(300), category) { q, c -> q to c }.distinctUntilChanged().collect { (q, c) -> g.explore.refreshExplore(c, q) }
        }
    }
}

@Composable
fun SearchScreen(nav: AppNav) {
    val vm: SearchViewModel = viewModel { SearchViewModel(nav.graph) }
    val q by vm.query.collectAsStateWithLifecycle()
    val cat by vm.category.collectAsStateWithLifecycle()
    val results by vm.results.collectAsStateWithLifecycle()
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    Column(Modifier.fillMaxSize().background(Pc.colors.paper)) {
        Column(Modifier.statusBarsPadding()) {
            Row(Modifier.padding(end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                IconTap(PcIcons.Back, "Back", { nav.back() })
                BoxedInput(q, { vm.query.value = it.take(80) }, "Where to? Spiti, Kasol, Bhutan…", Modifier.weight(1f).focusRequester(focus))
            }
            TextTabs(Categories, cat, { vm.category.value = it })
        }
        LazyColumn(Modifier.fillMaxSize()) {
            if (results.isEmpty()) item { EmptyState("No departures match", "Try a place name, or another category.") }
            items(results, key = { it.slug }, contentType = { "departure" }) { t -> DepartureRow(t) { nav.to(Routes.trip(t.slug)) } }
        }
    }
}

// ---------------- Trip detail ----------------

class TripViewModel(private val g: AppGraph, val slug: String) : ViewModel() {
    val trip = g.explore.observeTrip(slug).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null to null)
    val selectedDate = MutableStateFlow<String?>(null)
    val loading = MutableStateFlow(true)
    val notFound = MutableStateFlow(false)

    init {
        g.analytics.track("trip.view", "trip_detail", mapOf("slug" to slug))
        viewModelScope.launch {
            val r = g.explore.refreshTrip(slug)
            notFound.value = r is ApiResult.Err && r.status == 404
            loading.value = false
        }
    }

    fun takeSeat(nav: AppNav, date: String?) {
        g.analytics.track("trip.take_seat", "trip_detail", mapOf("slug" to slug, "date" to date))
        nav.openWeb("/packages/$slug?book=1")
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TripDetailScreen(slug: String, nav: AppNav) {
    val vm: TripViewModel = viewModel(key = "trip-$slug") { TripViewModel(nav.graph, slug) }
    val (lite, detail) = vm.trip.collectAsStateWithLifecycle().value
    val notFound by vm.notFound.collectAsStateWithLifecycle()
    val selected by vm.selectedDate.collectAsStateWithLifecycle()
    val c = Pc.colors
    if (lite == null && detail == null) {
        Column(Modifier.fillMaxSize().background(c.paper)) {
            DetailTopBar(null, onBack = { nav.back() })
            if (notFound) EmptyState("Trip not found", "It may have been unlisted.") else Text("Loading…", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(Gutter))
        }
        return
    }
    val t = detail?.lite() ?: lite!!
    val images = detail?.images?.ifEmpty { null } ?: listOfNotNull(t.image)
    val seats = detail?.seats?.takeIf { it.isNotEmpty() } ?: seatsFromCounts(t.seatsTotal, t.seatsLeft)
    val date = selected ?: t.nextDeparture
    val dep = detail?.departures?.firstOrNull { it.date == date }
    val left = dep?.seatsLeft ?: t.seatsLeft ?: 0
    Column(Modifier.fillMaxSize().background(c.paper)) {
        LazyColumn(Modifier.weight(1f)) {
            item(key = "photos", contentType = "photos") {
                val pager = rememberPagerState { images.size.coerceAtLeast(1) }
                Box(Modifier.fillMaxWidth().height(280.dp)) {
                    HorizontalPager(pager, Modifier.fillMaxSize(), key = { it }) { i -> ProgressiveImage(images.getOrNull(i), Modifier.fillMaxSize(), t.title) }
                    Row(Modifier.statusBarsPadding().padding(12.dp).fillMaxWidth()) {
                        PhotoButton(PcIcons.Back, "Back") { nav.back() }
                        Spacer(Modifier.weight(1f))
                        PhotoButton(PcIcons.Share, "Share") { nav.share("${t.title} on UnSOLO: https://unsolo.in/packages/${t.slug}") }
                    }
                    Text("${pager.currentPage + 1} / ${images.size.coerceAtLeast(1)}", style = Pc.type.label, color = Color.White,
                        modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 10.dp, vertical = 4.dp))
                }
            }
            item(key = "title") {
                Column(Modifier.padding(start = Gutter, end = Gutter, top = 20.dp)) {
                    Text(t.title, style = Pc.type.display, color = c.ink)
                    t.place?.let { Text(it.name, style = Pc.type.body, color = c.ink2) }
                    Spacer(Modifier.height(12.dp))
                    val back = Fmt.date(date)?.plusDays((t.durationDays - 1).coerceAtLeast(0).toLong())?.toString()
                    Facts(listOf(
                        Fact(PcIcons.Calendar, "${Fmt.dayMonth(date)} – ${Fmt.dayMonth(back)}"),
                        Fact(PcIcons.Clock, Fmt.nights(t.durationDays)),
                        Fact(PcIcons.Star, detail?.rating?.takeIf { it.count > 0 }?.let { "%.1f (%d)".format(it.avg, it.count) } ?: "New"),
                    ))
                    if (!detail?.description.isNullOrBlank()) { Spacer(Modifier.height(12.dp)); Text(detail!!.description, style = Pc.type.body, color = c.ink) }
                }
            }
            item(key = "seats") {
                Column(Modifier.padding(horizontal = Gutter, vertical = 16.dp).fillMaxWidth().raisedCard().padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Who's going", style = Pc.type.title3, color = c.ink, modifier = Modifier.weight(1f))
                        Text("${seats.count { it.state != SeatState.OPEN }} of ${seats.size}", style = Pc.type.num, color = c.ink2)
                    }
                    Spacer(Modifier.height(12.dp))
                    SeatRow(seats, maxCell = PcTokens.seat, onSeat = { s -> s.user?.takeIf { it.username.isNotBlank() }?.let { nav.to(Routes.profile(it.username)) } })
                    Spacer(Modifier.height(12.dp))
                    Text(if (left > 0) "$left seats left on ${Fmt.dayMonth(date)}" else "Full on ${Fmt.dayMonth(date)} · pick another date", style = Pc.type.smallStrong, color = if (left <= 5) c.red else c.ink2)
                }
            }
            t.host?.let { h ->
                item(key = "host") {
                    Row(Modifier.padding(horizontal = Gutter).fillMaxWidth().tonalFill().clickable { if (h.username.isNotBlank()) nav.to(Routes.profile(h.username)) }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(52.dp).border(2.dp, c.gold, CircleShape).padding(3.dp)) { Avatar(h, 46.dp) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(h.name, style = Pc.type.bodyStrong, color = c.ink)
                                Spacer(Modifier.width(6.dp))
                                if (h.isHost) Tag("Host", TagKind.Host)
                            }
                            Text(detail?.rating?.takeIf { it.count > 0 }?.let { "★ %.1f · %d reviews".format(it.avg, it.count) } ?: "Verified host", style = Pc.type.small, color = c.ink2)
                        }
                        PcIcon(PcIcons.ChevronRight, null, size = 18.dp, tint = c.ink2)
                    }
                }
            }
            val deps = detail?.departures.orEmpty()
            if (deps.isNotEmpty()) item(key = "deps") {
                Column(Modifier.padding(top = 16.dp)) {
                    SectionHeader("Departures", trailing = "${deps.size} dates")
                    LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(deps, key = { "d-" + it.date }) { d ->
                            val sel = d.date == date
                            Column(Modifier.width(112.dp).clip(RoundedCornerShape(PcTokens.radiusCard)).background(if (sel) c.ink else tonal())
                                .clickable { vm.selectedDate.value = d.date }.padding(12.dp)) {
                                Text(Fmt.dowUpper(d.date), style = Pc.type.code, color = if (sel) c.onInk.copy(alpha = 0.7f) else c.ink2)
                                Text(Fmt.dayMonth(d.date), style = Pc.type.title3, color = if (sel) c.onInk else c.ink)
                                Text(if (d.seatsLeft > 0) "${d.seatsLeft} of ${d.seatsTotal} left" else "Full", style = Pc.type.label,
                                    color = if (sel) c.onInk.copy(alpha = 0.8f) else if (d.seatsLeft in 1..3) c.red else c.ink2)
                            }
                        }
                    }
                }
            }
            val includes = detail?.includes.orEmpty()
            if (includes.isNotEmpty()) item(key = "inc") {
                Column(Modifier.padding(top = 16.dp)) {
                    SectionHeader("Included")
                    FormCard {
                        includes.forEachIndexed { i, inc ->
                            if (i > 0) InsetRule(start = 52.dp)
                            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(24.dp).clip(CircleShape).background(tonal()), contentAlignment = Alignment.Center) { PcIcon(PcIcons.Check, null, size = 14.dp) }
                                Spacer(Modifier.width(12.dp))
                                Text(inc, style = Pc.type.body, color = c.ink)
                            }
                        }
                    }
                }
            }
            val stories = detail?.stories.orEmpty()
            if (stories.isNotEmpty()) item(key = "stories") {
                Column(Modifier.padding(top = 16.dp)) {
                    SectionHeader("From people who went", trailing = "${stories.size} stories")
                    LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(stories, key = { it.id }) { s -> StoryRailCard(s) { nav.to(Routes.post(s.id)) } }
                    }
                }
            }
            val planning = detail?.planningCount
            if (planning != null && planning >= 3) item(key = "bridge") {
                TribeBridgeRow(planning, t.place?.name ?: t.title, 0, detail.goingFaces) { nav.tab(Routes.TRIBE) }
            }
            item(key = "end") { Spacer(Modifier.height(20.dp)) }
        }
        BottomActionBar(
            title = MoneyFormat.rupees(t.priceFromPaise), titleMono = true, titleSuffix = "/ person",
            subtitle = if (left > 0) "$left seats left · pay on unsolo.in" else "This date is full",
            action = "Take a seat", enabled = left > 0, onAction = { vm.takeSeat(nav, date) },
        )
    }
}

@Composable
private fun PhotoButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Box(Modifier.size(44.dp).clip(CircleShape).background(Pc.colors.raised.copy(alpha = 0.92f)).clickable(role = Role.Button, onClickLabel = label, onClick = onClick), contentAlignment = Alignment.Center) {
        PcIcon(icon, label)
    }
}

@Composable
fun StoryRailCard(s: Post, onClick: () -> Unit) {
    val c = Pc.colors
    Column(Modifier.width(240.dp).clickable(onClick = onClick)) {
        Box(Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(PcTokens.radiusCard))) {
            ProgressiveImage(s.media.firstOrNull(), Modifier.fillMaxSize())
            Box(Modifier.align(Alignment.BottomStart).padding(10.dp).size(32.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) { Avatar(s.author, 28.dp) }
        }
        Spacer(Modifier.height(8.dp))
        Text(s.title ?: s.body, style = Pc.type.bodyStrong, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text("${s.author.firstName} · ${s.reactions.wantToGo} want to go", style = Pc.type.small, color = c.ink2, maxLines = 1)
    }
}

@Suppress("unused") private val keepWeight = FontWeight.Bold
