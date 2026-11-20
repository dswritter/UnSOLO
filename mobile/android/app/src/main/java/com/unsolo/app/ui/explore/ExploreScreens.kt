package com.unsolo.app.ui.explore

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PageSize
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId

val Categories = listOf("trips" to "Trips", "stays" to "Stays", "activities" to "Activities", "rentals" to "Rentals")
private val CategoryIcons = mapOf("trips" to PcIcons.Backpack, "stays" to PcIcons.Bed, "activities" to PcIcons.Hike, "rentals" to PcIcons.Motorcycle)

/** Departure-date windows for the search sheet (filtered on the device; the API has no date filter). */
enum class WhenWindow(val label: String) { Any("Any week"), Weekend("This weekend"), TwoWeeks("Next 2 weeks"), Month("This month"), NextMonth("Next month") }

/** Price caps for the search sheet, in paise. */
enum class PriceCap(val label: String, val paise: Long?) { Any("Any price", null), Under10("Under ₹10k", 1_000_000), Under20("Under ₹20k", 2_000_000), Under30("Under ₹30k", 3_000_000) }

internal fun inWindow(date: String?, w: WhenWindow, today: LocalDate = LocalDate.now(ZoneId.of("Asia/Kolkata"))): Boolean {
    if (w == WhenWindow.Any) return true
    val d = Fmt.date(date) ?: return false
    if (d.isBefore(today)) return false
    return when (w) {
        WhenWindow.Any -> true
        WhenWindow.Weekend -> {
            val sat = if (today.dayOfWeek == DayOfWeek.SUNDAY) today.minusDays(1) else today.plusDays(((DayOfWeek.SATURDAY.value - today.dayOfWeek.value + 7) % 7).toLong())
            !d.isBefore(sat.coerceAtLeast(today)) && !d.isAfter(sat.plusDays(1))
        }
        WhenWindow.TwoWeeks -> !d.isAfter(today.plusDays(14))
        WhenWindow.Month -> d.year == today.year && d.month == today.month
        WhenWindow.NextMonth -> today.plusMonths(1).let { n -> d.year == n.year && d.month == n.month }
    }
}

private fun LocalDate.coerceAtLeast(o: LocalDate) = if (isBefore(o)) o else this

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
class ExploreViewModel(private val g: AppGraph) : ViewModel() {
    val category = MutableStateFlow("trips")
    val query = MutableStateFlow("")
    val window = MutableStateFlow(WhenWindow.Any)
    val openOnly = MutableStateFlow(false)
    val price = MutableStateFlow(PriceCap.Any)

    private val all: StateFlow<List<TripLite>> = combine(category, query.debounce(200)) { c, q -> c to q.trim() }
        .flatMapLatest { (c, q) -> g.explore.observeExplore(c, q) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val items: StateFlow<List<TripLite>> = combine(all, window, openOnly, price) { list, w, open, p ->
        list.filter { t -> inWindow(t.nextDeparture, w) && (!open || (t.seatsLeft ?: 0) > 0) && (p.paise == null || t.priceFromPaise <= p.paise) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val hero: StateFlow<Pair<TripLite?, TripDetail?>> = items.map { it.firstOrNull()?.slug }.distinctUntilChanged()
        .flatMapLatest { slug -> if (slug == null) flowOf(null to null) else g.explore.observeTrip(slug) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null to null)
    val suggestions = g.explore.observeSuggestions().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val saved = g.settings.data.map { it.savedTrips }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptySet())
    val refreshing = MutableStateFlow(false)
    val error = MutableStateFlow<String?>(null)
    val me = g.account.me

    val filterCount: Int get() = listOf(window.value != WhenWindow.Any, openOnly.value, price.value != PriceCap.Any).count { it }

    init {
        viewModelScope.launch { combine(category, query.debounce(300)) { c, q -> c to q.trim() }.distinctUntilChanged().collect { refresh() } }
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
        val r = g.explore.refreshExplore(category.value, query.value.trim())
        error.value = when (r) { is ApiResult.Err -> "Couldn't refresh"; ApiResult.Offline -> null; else -> null }
        refreshing.value = false
    }

    fun clearFilters() { query.value = ""; window.value = WhenWindow.Any; openOnly.value = false; price.value = PriceCap.Any }
    fun toggleSave(slug: String) = viewModelScope.launch { g.settings.toggleSavedTrip(slug) }

    fun nearMe() = viewModelScope.launch {
        val loc = g.location.get()
        g.settings.setNearMe(true)
        g.explore.refreshSuggestions(loc?.lat, loc?.lng)
    }

    fun tapSuggestion(s: Suggestion) = g.analytics.track("suggestion.tap", "explore", mapOf("type" to s.type, "reason" to s.reason))
}

private fun takeSeat(nav: AppNav, t: TripLite, screen: String) {
    nav.graph.analytics.track("trip.take_seat", screen, mapOf("slug" to t.slug, "date" to t.nextDeparture))
    nav.openWeb("/packages/${t.slug}?book=1")
}

@Composable
fun ExploreScreen(nav: AppNav) {
    val vm: ExploreViewModel = viewModel { ExploreViewModel(nav.graph) }
    val category by vm.category.collectAsStateWithLifecycle()
    val items by vm.items.collectAsStateWithLifecycle()
    val hero by vm.hero.collectAsStateWithLifecycle()
    val suggestions by vm.suggestions.collectAsStateWithLifecycle()
    val saved by vm.saved.collectAsStateWithLifecycle()
    val query by vm.query.collectAsStateWithLifecycle()
    val window by vm.window.collectAsStateWithLifecycle()
    vm.openOnly.collectAsStateWithLifecycle(); vm.price.collectAsStateWithLifecycle()
    val counts = LocalHeaderCounts.current
    val locLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) vm.nearMe() }
    var searchSheet by remember { mutableStateOf(false) }
    val c = Pc.colors
    val leaving = items.take(3)
    val rest = items.drop(3)

    Box(Modifier.fillMaxSize().background(c.paper)) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = PcTokens.searchDock + 40.dp)) {
            item(key = "header", contentType = "header") {
                Column(Modifier.statusBarsPadding()) {
                    Row(Modifier.fillMaxWidth().height(PcTokens.topBar).padding(start = Gutter + 2.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Wordmark()
                        Spacer(Modifier.weight(1f))
                        HeaderActions(counts, { if (nav.requireSignIn()) nav.to(Routes.INBOX) }, { if (nav.requireSignIn()) nav.to(Routes.ACTIVITY) })
                    }
                    TextTabs(Categories, category, { vm.category.value = it }, icons = CategoryIcons)
                    Spacer(Modifier.height(6.dp))
                }
            }
            if (items.isEmpty()) {
                item(key = "empty") {
                    if (vm.filterCount > 0 || query.isNotBlank()) EmptyState("No departures match", "Try another week or clear the filters.", action = "Clear filters", onAction = { vm.clearFilters() })
                    else EmptyState("Nothing here yet", "Pull the departures board again when you're back online.", action = "Retry", onAction = { vm.refresh() })
                }
            } else {
                item(key = "hero-h", contentType = "section") { SectionHeader("Leaving soon", trailing = "See all", trailingLink = { searchSheet = true }) }
                item(key = "pager", contentType = "pager") {
                    val w = LocalConfiguration.current.screenWidthDp.dp
                    val pager = rememberPagerState { leaving.size }
                    HorizontalPager(pager, contentPadding = PaddingValues(horizontal = Gutter), pageSpacing = 12.dp,
                        pageSize = PageSize.Fixed(if (leaving.size > 1) w - Gutter * 2 - 36.dp else w - Gutter * 2), key = { leaving[it].slug }, verticalAlignment = Alignment.Top) { i ->
                        val t = leaving[i]
                        TripCard(t, t.slug in saved, onSave = { vm.toggleSave(t.slug) }, onOpen = { nav.to(Routes.trip(t.slug)) }, onTake = { takeSeat(nav, t, "explore") })
                    }
                }
                val planning = hero.second?.planningCount
                val first = items.first()
                if (planning != null && planning >= 3) item(key = "bridge", contentType = "bridge") {
                    TribeBridgeRow(planning, first.place?.name ?: first.title, hero.second?.stories?.size ?: 0, hero.second?.goingFaces.orEmpty()) { nav.tab(Routes.TRIBE) }
                }
            }
            if (category == "trips" && query.isBlank()) item(key = "sugg", contentType = "rail") {
                SuggestionRail(suggestions, onNearMe = {
                    if (nav.graph.location.hasPermission()) vm.nearMe() else locLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                }) { s ->
                    vm.tapSuggestion(s)
                    s.trip?.let { nav.to(Routes.trip(it.slug)) } ?: s.post?.let { nav.to(Routes.post(it.id)) }
                }
            }
            if (rest.isNotEmpty()) {
                val groups = rest.groupBy { monthLabel(it.nextDeparture) }
                groups.forEach { (label, list) ->
                    item(key = "m-$label", contentType = "section") { SectionHeader(label, Modifier.padding(top = 12.dp)) }
                    items(list, key = { "dep-" + it.slug }, contentType = { "departure" }) { t -> DepartureRow(t) { nav.to(Routes.trip(t.slug)) } }
                }
            }
        }
        SearchDock(
            label = query.ifBlank { "Where to?" }, sub = window.label, filters = vm.filterCount,
            onClick = { searchSheet = true },
            modifier = Modifier.align(Alignment.BottomCenter).padding(start = Gutter, end = Gutter, bottom = 22.dp),
        )
    }
    if (searchSheet) ExploreSearchSheet(vm, items.size, onDismiss = { searchSheet = false })
}

private fun monthLabel(date: String?): String {
    val d = Fmt.date(date) ?: return "Later"
    val today = LocalDate.now(ZoneId.of("Asia/Kolkata"))
    return when {
        d.year == today.year && d.month == today.month -> "This month"
        d.year == today.year -> d.month.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH)
        else -> d.month.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH) + " ${d.year}"
    }
}

/** Bottom search: a 56dp pill floating above the tab bar ("Where to? · Any week" + filter button). */
@Composable
fun SearchDock(label: String, sub: String, filters: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = Pc.colors
    val shape = CircleShape
    Row(
        modifier.fillMaxWidth().height(PcTokens.searchDock)
            .shadow(10.dp, shape, clip = false, ambientColor = Color.Black.copy(alpha = 0.10f), spotColor = Color.Black.copy(alpha = 0.18f))
            .clip(shape).background(c.raised).border(1.dp, c.rule, shape)
            .clickable(role = Role.Button, onClickLabel = "Search and filters", onClick = onClick)
            .padding(start = 18.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PcIcon(PcIcons.Search, null, tint = c.ink, size = 20.dp)
        Spacer(Modifier.width(12.dp))
        Text(label, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        Text("  ·  $sub", style = Pc.type.body, color = c.ink2, maxLines = 1)
        Spacer(Modifier.weight(1f))
        Box(Modifier.size(44.dp).clip(CircleShape).background(c.pine).semantics { contentDescription = "Filters" }, contentAlignment = Alignment.Center) {
            PcIcon(PcIcons.Sliders, null, tint = c.onPine, size = 20.dp)
            if (filters > 0) Box(Modifier.align(Alignment.TopEnd).size(16.dp).clip(CircleShape).background(c.gold), contentAlignment = Alignment.Center) {
                Text("$filters", style = Pc.type.label.copy(fontSize = 10.sp, fontWeight = FontWeight.ExtraBold), color = c.onGold)
            }
        }
    }
}

@Composable
private fun ExploreSearchSheet(vm: ExploreViewModel, count: Int, onDismiss: () -> Unit) {
    val q by vm.query.collectAsStateWithLifecycle()
    val cat by vm.category.collectAsStateWithLifecycle()
    val w by vm.window.collectAsStateWithLifecycle()
    val open by vm.openOnly.collectAsStateWithLifecycle()
    val price by vm.price.collectAsStateWithLifecycle()
    val focus = remember { FocusRequester() }
    PcSheet(onDismiss) {
        SheetTitle("Search")
        Column(Modifier.padding(horizontal = Gutter)) {
            BoxedInput(q, { vm.query.value = it.take(80) }, "Where to? Spiti, Kasol, Bhutan…", Modifier.focusRequester(focus), leadingIcon = PcIcons.Search)
            SheetLabel("When")
        }
        FlowRow(Modifier.padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WhenWindow.entries.forEach { o -> PcChip(o.label, w == o, { vm.window.value = o }) }
        }
        Column(Modifier.padding(horizontal = Gutter)) { SheetLabel("What") }
        FlowRow(Modifier.padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Categories.forEach { (k, l) -> PcChip(l, cat == k, { vm.category.value = k }, icon = CategoryIcons[k]) }
        }
        Column(Modifier.padding(horizontal = Gutter)) { SheetLabel("Price per person") }
        FlowRow(Modifier.padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PriceCap.entries.forEach { o -> PcChip(o.label, price == o, { vm.price.value = o }) }
        }
        Spacer(Modifier.height(6.dp))
        SwitchRow("Only departures with open seats", "Hide full circles", open, { vm.openOnly.value = it }, Modifier.padding(horizontal = 4.dp))
        Spacer(Modifier.height(10.dp))
        Row(Modifier.padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            PcButton("Clear", { vm.clearFilters() }, kind = BtnKind.Ghost)
            PcButton(if (count == 1) "Show 1 departure" else "Show $count departures", onDismiss, Modifier.weight(1f))
        }
    }
}

@Composable
private fun SheetLabel(text: String) {
    Text(text, style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = Pc.colors.ink2, modifier = Modifier.padding(top = 16.dp, bottom = 4.dp))
}

/** Date chip on photos: big day number + month. */
@Composable
fun DateChip(date: String?, modifier: Modifier = Modifier) {
    val c = Pc.colors
    Column(modifier.size(width = 46.dp, height = 50.dp).clip(RoundedCornerShape(14.dp)).background(c.raised), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(Fmt.dayNum(date), style = Pc.type.numLarge.copy(fontSize = 20.sp), color = c.ink)
        Text(Fmt.monUpper(date), style = Pc.type.code.copy(fontSize = 10.sp), color = c.ink2)
    }
}

/** Short seat line under a card title (always next to the ring). */
@Composable
fun SeatCaption(total: Int, filled: Int, modifier: Modifier = Modifier, textAlign: TextAlign? = null, plan: Boolean = false) {
    val c = Pc.colors
    Text(if (plan) planCaption(total, filled) else ringCaption(total, filled), style = Pc.type.smallStrong.copy(fontWeight = FontWeight.Medium).let { it.copy(color = c.ink2) },
        color = c.ink2, modifier = modifier, maxLines = 2, textAlign = textAlign)
}

/**
 * Photo-first trip card: a full-width photo with the date chip and save button, the 88dp ring
 * overlapping the photo's bottom edge with the open count in its centre, then title, place,
 * host, seat line, price and "Take a seat".
 */
@Composable
fun TripCard(t: TripLite, saved: Boolean, onSave: () -> Unit, onOpen: () -> Unit, onTake: () -> Unit, modifier: Modifier = Modifier, label: String? = null) {
    val c = Pc.colors
    val ring = ringFromCounts(t.seatsTotal, t.seatsLeft)
    val open = ring.total - ring.taken
    Column(modifier.fillMaxWidth().raisedCard().clickable(onClickLabel = "Open ${t.title}", onClick = onOpen).padding(8.dp)) {
        Box(Modifier.fillMaxWidth().height(196.dp).clip(RoundedCornerShape(PcTokens.radiusImage))) {
            ProgressiveImage(t.image, Modifier.fillMaxSize(), t.title)
            Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(70.dp).background(Brush.verticalGradient(listOf(Color.Transparent, Color(0x470B1A15)))))
            DateChip(t.nextDeparture, Modifier.align(Alignment.TopStart).padding(12.dp))
            GlassButton(if (saved) PcIcons.HeartFilled else PcIcons.Heart, if (saved) "Saved" else "Save", onSave, Modifier.align(Alignment.TopEnd).padding(6.dp), tint = if (saved) c.rose else c.ink)
            if (label != null) Text(label, style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = c.ink,
                modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp).clip(CircleShape).background(c.raised.copy(alpha = 0.86f)).padding(horizontal = 10.dp, vertical = 5.dp))
        }
        Row(Modifier.padding(horizontal = 8.dp).overlapUp(44.dp), verticalAlignment = Alignment.Top) {
            RingMount {
                SeatRing(ring, PcTokens.ringCard, centerLabel = "$open" to (if (ring.full) "full" else "open"), centerLabelSize = 26.dp)
            }
            Column(Modifier.weight(1f).padding(start = 12.dp, top = 50.dp)) {
                Text(t.title, style = Pc.type.title2.copy(fontSize = 19.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(t.place?.name, Fmt.nights(t.durationDays).takeIf { t.durationDays > 0 }).joinToString(" · "), style = Pc.type.small.copy(fontSize = 14.sp), color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Column(Modifier.padding(start = 8.dp, end = 8.dp, top = 10.dp, bottom = 4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                t.host?.let { Tag(it.name, TagKind.Verified, Modifier.weight(1f, fill = false)); Spacer(Modifier.width(10.dp)) }
                SeatCaption(ring.total, ring.filled, Modifier.weight(1f), textAlign = TextAlign.End)
            }
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.Bottom) {
                    Text(MoneyFormat.rupees(t.priceFromPaise), style = Pc.type.priceLarge, color = c.ink)
                    Text("/person", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(start = 3.dp, bottom = 2.dp))
                }
                PcButton(if (ring.full) "Full" else "Take a seat", onTake, height = BtnSmall, enabled = !ring.full)
            }
        }
    }
}

@Composable
fun TribeBridgeRow(count: Int, place: String, stories: Int, faces: List<UserLite>, onClick: () -> Unit) {
    val c = Pc.colors
    Row(Modifier.padding(horizontal = Gutter, vertical = 12.dp).fillMaxWidth().clip(RoundedCornerShape(PcTokens.radiusCard)).background(c.tonal).clickable(onClick = onClick).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        if (faces.isNotEmpty()) { FaceStack(faces.take(3), size = 28.dp); Spacer(Modifier.width(4.dp)) }
        Column(Modifier.weight(1f)) {
            Text("$count people are planning ${place.substringBefore(',')}", style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (stories > 0) "$stories stories from people who went · Tribe" else "See their plans in Tribe", style = Pc.type.small, color = c.ink2)
        }
        PcIcon(PcIcons.ArrowRight, null, size = 18.dp, tint = c.pine)
    }
}

@Composable
private fun SuggestionRail(items: List<Suggestion>, onNearMe: () -> Unit, onTap: (Suggestion) -> Unit) {
    val c = Pc.colors
    Column(Modifier.padding(top = 8.dp)) {
        SectionHeader("For you")
        LazyRow(contentPadding = PaddingValues(horizontal = Gutter, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            item(key = "near") {
                Column(Modifier.width(150.dp).height(128.dp).clip(RoundedCornerShape(PcTokens.radiusCard)).background(c.tonal).clickable(onClickLabel = "Suggestions near you", onClick = onNearMe).padding(16.dp)) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) { PcIcon(PcIcons.NearMe, null, size = 20.dp, tint = c.pine) }
                    Spacer(Modifier.weight(1f))
                    Text("Near you", style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink)
                    Text("Approximate location", style = Pc.type.small, color = c.ink2)
                }
            }
            items(items, key = { (it.trip?.slug ?: it.post?.id ?: "") + it.reason }) { s ->
                val title = s.trip?.title ?: s.post?.title ?: ""
                val sub = s.trip?.let { "${Fmt.dayMonth(it.nextDeparture)} · ${MoneyFormat.rupees(it.priceFromPaise)}" }
                    ?: s.post?.let { p -> "Plan · ${Fmt.range(p.startsOn, p.endsOn)}" } ?: ""
                val plan = s.type == "plan"
                Column(Modifier.width(210.dp).height(128.dp).then(if (plan) Modifier.pencilledCard() else Modifier.raisedCard()).clickable { onTap(s) }.padding(16.dp)) {
                    Text(s.reason, style = Pc.type.label, color = c.pine, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(6.dp))
                    Text(title, style = Pc.type.title3, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.weight(1f))
                    Text(sub, style = Pc.type.small, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/** List row: thumbnail · title + date line · mini arc · price + open count. */
@Composable
fun DepartureRow(t: TripLite, onClick: () -> Unit) {
    val c = Pc.colors
    val ring = ringFromCounts(t.seatsTotal, t.seatsLeft)
    Column(Modifier.padding(horizontal = Gutter)) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick).padding(vertical = 12.dp, horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            ProgressiveImage(t.image, Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)), t.title)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(t.title, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(Fmt.dowDayMonth(t.nextDeparture), Fmt.nights(t.durationDays).takeIf { t.durationDays > 0 }, t.place?.name?.substringBefore(',')).joinToString(" · "),
                    style = Pc.type.small, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.width(10.dp))
            if (ring.total > 0) MiniArc(ring.total, ring.taken)
            Spacer(Modifier.width(12.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(MoneyFormat.rupees(t.priceFromPaise), style = Pc.type.price, color = c.ink)
                Text(if (ring.full) "Full" else "${ring.total - ring.taken} open", style = Pc.type.small, color = if (ring.full) c.full else c.ink2)
            }
        }
        Hairline()
    }
}

/** Linked next departure (on stories): mini arc · date · seats and price · "Take a seat →". */
@Composable
fun HostedTripCard(t: TripLite, onOpen: () -> Unit, onTake: () -> Unit, label: String = "Next departure") {
    val c = Pc.colors
    val ring = ringFromCounts(t.seatsTotal, t.seatsLeft)
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.tonal).clickable(onClick = onOpen).padding(start = 10.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (ring.total > 0) MiniArc(ring.total, ring.taken, size = 38.dp) else ProgressiveImage(t.image, Modifier.size(38.dp).clip(CircleShape))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text("$label · ${Fmt.dayMonth(t.nextDeparture)}", style = Pc.type.smallStrong.copy(fontWeight = FontWeight.Bold, fontSize = 13.5.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(t.seatsLeft?.let { if (it == 0) "Full" else "$it seat${if (it == 1) "" else "s"} left" }, MoneyFormat.rupees(t.priceFromPaise)).joinToString(" · "), style = Pc.type.small, color = c.ink2, maxLines = 1)
        }
        Box(Modifier.defaultMinSize(minHeight = 48.dp).clip(CircleShape).clickable(role = Role.Button, onClick = onTake).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
            Text("Take a seat →", style = Pc.type.smallStrong.copy(fontWeight = FontWeight.ExtraBold, fontSize = 13.5.sp), color = c.pine, maxLines = 1)
        }
    }
}

// ---------------- Search (full screen; "See all" from other places) ----------------

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
            Row(Modifier.padding(end = 16.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconTap(PcIcons.Back, "Back", { nav.back() })
                BoxedInput(q, { vm.query.value = it.take(80) }, "Where to? Spiti, Kasol, Bhutan…", Modifier.weight(1f).focusRequester(focus), leadingIcon = PcIcons.Search)
            }
            TextTabs(Categories, cat, { vm.category.value = it }, icons = CategoryIcons)
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
    val saved = g.settings.data.map { slug in it.savedTrips }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)
    val me = g.account.me
    val signedIn = g.account.isSignedIn

    init {
        g.analytics.track("trip.view", "trip_detail", mapOf("slug" to slug))
        viewModelScope.launch {
            val r = g.explore.refreshTrip(slug)
            notFound.value = r is ApiResult.Err && r.status == 404
            loading.value = false
        }
    }

    fun toggleSave() = viewModelScope.launch { g.settings.toggleSavedTrip(slug) }

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
    val saved by vm.saved.collectAsStateWithLifecycle()
    val me by vm.me.collectAsStateWithLifecycle()
    val signedIn by vm.signedIn.collectAsStateWithLifecycle()
    var whoSheet by remember { mutableStateOf(false) }
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
    val date = selected ?: t.nextDeparture
    val dep = detail?.departures?.firstOrNull { it.date == date }
    val ring = if (date == t.nextDeparture && !detail?.seats.isNullOrEmpty()) ringFromSeats(detail!!.seats, me?.user?.id, hostIsBadge = true)
        else if (dep != null) ringFromCounts(dep.seatsTotal, dep.seatsLeft) else ringFromCounts(t.seatsTotal, t.seatsLeft)
    val left = dep?.seatsLeft ?: t.seatsLeft ?: (ring.total - ring.filled)
    val coverH = (LocalConfiguration.current.screenHeightDp * 0.45f).dp

    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val pastCover by remember { derivedStateOf { listState.firstVisibleItemIndex > 0 } }
    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().background(c.paper)) {
        LazyColumn(Modifier.weight(1f), state = listState) {
            item(key = "cover", contentType = "cover") {
                val pager = rememberPagerState { images.size.coerceAtLeast(1) }
                Box(Modifier.fillMaxWidth().height(coverH)) {
                    HorizontalPager(pager, Modifier.fillMaxSize(), key = { it }) { i -> ProgressiveImage(images.getOrNull(i), Modifier.fillMaxSize(), t.title) }
                    Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(140.dp).background(Brush.verticalGradient(listOf(Color.Transparent, Color(0x590B1A15)))))
                    Box(Modifier.align(Alignment.TopCenter).fillMaxWidth().height(110.dp).background(Brush.verticalGradient(listOf(Color(0x400B1A15), Color.Transparent))))
                    Row(Modifier.statusBarsPadding().padding(horizontal = 8.dp, vertical = 4.dp).fillMaxWidth()) {
                        GlassButton(PcIcons.Back, "Back", { nav.back() })
                        Spacer(Modifier.weight(1f))
                        GlassButton(PcIcons.Share, "Share", { nav.share("${t.title} on UnSOLO: https://unsolo.in/packages/${t.slug}") })
                    }
                    if (images.size > 1) Text("${pager.currentPage + 1} / ${images.size}", style = Pc.type.label, color = Color.White,
                        modifier = Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 16.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 10.dp, vertical = 4.dp))
                }
            }
            item(key = "ring", contentType = "ring") {
                Box(Modifier.fillMaxWidth().overlapUp(116.dp), contentAlignment = Alignment.Center) {
                    RingMount(pad = 6.dp, color = c.paper) {
                        SeatRing(ring, PcTokens.ringHero, photo = t.image, badge = t.host?.let { RingBadge(it) },
                            centerLabel = (if (ring.full) "Full" else "${ring.total - ring.filled}") to (if (ring.full) "${ring.total}/${ring.total}" else "of ${ring.total} open"),
                            centerLabelSize = 40.dp, spinOnAppear = ring.full, onClick = { whoSheet = true })
                    }
                }
            }
            item(key = "title") {
                Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    // Title and host directly under the ring, then the seat line and privacy, then the facts.
                    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(t.title, style = Pc.type.display.copy(fontSize = 28.sp), color = c.ink, textAlign = TextAlign.Center)
                        Spacer(Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(listOfNotNull(t.place?.name, t.host?.let { "hosted by ${it.name}" }).joinToString(" · "), style = Pc.type.body, color = c.ink2, textAlign = TextAlign.Center, modifier = Modifier.weight(1f, fill = false))
                            if (t.host?.isIdVerified == true) { Spacer(Modifier.width(4.dp)); VerifiedMark() }
                        }
                        Spacer(Modifier.height(12.dp))
                        SeatCaption(ring.total, ring.filled, textAlign = TextAlign.Center)
                        val privacy = when {
                            !signedIn -> "Sign in to see who's going"
                            !ring.coTraveller -> "Faces show once you're travelling together"
                            else -> null
                        }
                        if (privacy != null) Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            PcIcon(PcIcons.Lock, null, size = 13.dp, tint = c.ink3); Spacer(Modifier.width(4.dp))
                            Text(privacy, style = Pc.type.label, color = c.ink3)
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    val back = Fmt.date(date)?.plusDays((t.durationDays - 1).coerceAtLeast(0).toLong())?.toString()
                    // One left-aligned row of fact chips that scrolls sideways.
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        InfoChip(PcIcons.Calendar, if (t.durationDays > 1) "${Fmt.dayMonth(date)} – ${Fmt.dayMonth(back)}" else Fmt.dowDayMonth(date))
                        if (t.durationDays > 0) InfoChip(PcIcons.Clock, Fmt.nights(t.durationDays))
                        InfoChip(PcIcons.Star, detail?.rating?.takeIf { it.count > 0 }?.let { "%.1f · %d reviews".format(it.avg, it.count) } ?: "New")
                    }
                    if (!detail?.description.isNullOrBlank()) {
                        Spacer(Modifier.height(16.dp))
                        Text(detail!!.description, style = Pc.type.body, color = c.ink, modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp))
                    }
                }
            }
            val deps = detail?.departures.orEmpty()
            if (deps.isNotEmpty()) item(key = "deps") {
                Column(Modifier.padding(top = 16.dp)) {
                    SectionHeader("Pick a date", trailing = "${deps.size} dates")
                    Column(Modifier.padding(horizontal = Gutter), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        deps.forEach { d ->
                            val sel = d.date == date
                            val full = d.seatsLeft <= 0
                            val shape = RoundedCornerShape(RadiusField)
                            Row(Modifier.fillMaxWidth().clip(shape).background(c.raised).border(if (sel) 2.dp else 1.dp, if (sel) c.pine else c.rule, shape)
                                .clickable(role = Role.RadioButton) { vm.selectedDate.value = d.date }.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                MiniArc(d.seatsTotal, d.seatsTotal - d.seatsLeft, size = 38.dp)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(Fmt.dowDayMonth(d.date), style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold, fontSize = 14.sp), color = c.ink)
                                    Text(if (full) "Full" else "${d.seatsLeft} open", style = Pc.type.small, color = if (full) c.full else c.ink2)
                                }
                                if (sel) PcIcon(PcIcons.CheckCircleFilled, "Selected", tint = c.pine, size = 22.dp)
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
                                Box(Modifier.size(24.dp).clip(CircleShape).background(c.tonal), contentAlignment = Alignment.Center) { PcIcon(PcIcons.Check, null, size = 14.dp, tint = c.pine) }
                                Spacer(Modifier.width(12.dp))
                                Text(inc, style = Pc.type.body, color = c.ink)
                            }
                        }
                    }
                }
            }
            t.host?.let { h ->
                item(key = "host") {
                    Row(Modifier.padding(start = Gutter, end = Gutter, top = 16.dp).fillMaxWidth().raisedCard().clickable { if (h.username.isNotBlank()) nav.to(Routes.profile(h.username)) }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(52.dp).border(2.dp, c.gold, CircleShape).padding(3.dp)) { Avatar(h, 46.dp) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(h.name, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                Spacer(Modifier.width(6.dp))
                                if (h.isHost) Tag("Host", TagKind.Host, height = 20.dp)
                            }
                            Text(detail?.rating?.takeIf { it.count > 0 }?.let { "★ %.1f · %d reviews".format(it.avg, it.count) } ?: "Verified host", style = Pc.type.small, color = c.ink2)
                        }
                        PcIcon(PcIcons.ChevronRight, null, size = 18.dp, tint = c.ink3)
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
            title = MoneyFormat.rupees(t.priceFromPaise), titleMono = true, titleSuffix = "/person",
            subtitle = if (left > 0) "${Fmt.dowDayMonth(date)} · $left seats left" else "${Fmt.dowDayMonth(date)} is full · pick another date",
            action = "Take a seat", enabled = left > 0, onAction = { vm.takeSeat(nav, date) },
            leading = { IconTap(if (saved) PcIcons.HeartFilled else PcIcons.Heart, if (saved) "Saved" else "Save", { vm.toggleSave() }, tint = if (saved) c.rose else c.ink) },
        )
    }
    // Once the cover has scrolled away, the status bar gets a base-coloured strip.
    if (pastCover) Box(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(c.paper))
    }
    if (whoSheet) WhoIsGoingSheet(t, ring, if (date == t.nextDeparture) detail?.seats.orEmpty() else emptyList(), signedIn, onDismiss = { whoSheet = false }) { u ->
        whoSheet = false; if (u.username.isNotBlank()) nav.to(Routes.profile(u.username))
    }
}

@Composable
private fun InfoChip(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    val c = Pc.colors
    Row(Modifier.height(36.dp).clip(CircleShape).background(c.raised).border(1.dp, c.rule, CircleShape).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        PcIcon(icon, null, size = 16.dp, tint = c.ink)
        Spacer(Modifier.width(6.dp))
        Text(text, style = Pc.type.smallStrong.copy(fontSize = 14.sp), color = c.ink, maxLines = 1)
    }
}

/** "Who's going": the ring, then the host, travellers (faces only for co-travellers), you, and open seats. */
@Composable
private fun WhoIsGoingSheet(t: TripLite, ring: RingData, seats: List<Seat>, signedIn: Boolean, onDismiss: () -> Unit, onProfile: (UserLite) -> Unit) {
    val c = Pc.colors
    PcSheet(onDismiss) {
        Column(Modifier.fillMaxWidth().padding(horizontal = Gutter), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Who's going", style = Pc.type.title1, color = c.ink)
            Text(t.title + (t.nextDeparture?.let { " · " + Fmt.dowDayMonth(it) } ?: ""), style = Pc.type.small, color = c.ink2)
            Spacer(Modifier.height(22.dp))
            SeatRing(ring, 200.dp, photo = t.image, badge = t.host?.let { RingBadge(it) })
            Spacer(Modifier.height(10.dp))
            SeatCaption(ring.total, ring.filled, textAlign = TextAlign.Center)
            Spacer(Modifier.height(12.dp))
        }
        val host = seats.firstOrNull { it.state == SeatState.HOST }?.user ?: t.host
        val members = seats.filter { it.state == SeatState.MEMBER }
        val youSeat = seats.firstOrNull { it.state == SeatState.YOU }
        Column(Modifier.padding(horizontal = Gutter).fillMaxWidth().raisedCard()) {
            if (host != null) {
                PersonRow(host, "Host", onClick = { onProfile(host) }) { Tag("Host", TagKind.Host, height = 20.dp) }
            }
            youSeat?.let { s -> InsetRule(64.dp); PersonRow(s.user, "Your seat", onClick = null) { Box(Modifier.size(12.dp).clip(CircleShape).background(c.gold).border(1.5.dp, c.ink, CircleShape)) } }
            members.forEach { s ->
                InsetRule(64.dp)
                val u = s.user
                // Faces only for co-travellers; everyone else sees initials.
                if (u != null) PersonRow(if (ring.coTraveller) u else u.copy(avatarUrl = null), if (ring.coTraveller) "Travelling with you" else "Going", onClick = { onProfile(u) }) {}
                else PersonRow(null, "Traveller", onClick = null) { PcIcon(PcIcons.Lock, "Private", size = 16.dp, tint = c.ink3) }
            }
            if (seats.isEmpty() && ring.filled > 0) { InsetRule(64.dp); Text("${ring.filled} people going", style = Pc.type.body, color = c.ink2, modifier = Modifier.padding(16.dp)) }
            InsetRule(64.dp)
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(36.dp).clip(CircleShape).border(2.dp, c.seatOpen, CircleShape))
                Spacer(Modifier.width(12.dp))
                Text(if (ring.full) "No open seats" else "${ring.total - ring.filled} seats open", style = Pc.type.bodyStrong, color = c.ink)
            }
        }
        Text(if (!signedIn) "Sign in to see initials. Faces show only to people travelling together." else "Faces show only to people travelling together. Women can keep their photo private.",
            style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(horizontal = Gutter + 4.dp, vertical = 12.dp))
    }
}

@Composable
private fun PersonRow(user: UserLite?, sub: String, onClick: (() -> Unit)?, trailing: @Composable () -> Unit) {
    val c = Pc.colors
    Row(Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(user, 36.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(user?.name ?: "Traveller", style = Pc.type.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(sub, style = Pc.type.small, color = c.ink2)
        }
        trailing()
    }
}

@Composable
fun StoryRailCard(s: Post, onClick: () -> Unit) {
    val c = Pc.colors
    Column(Modifier.width(240.dp).clip(RoundedCornerShape(PcTokens.radiusImage)).clickable(onClick = onClick)) {
        Box(Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(PcTokens.radiusImage))) {
            ProgressiveImage(s.media.firstOrNull(), Modifier.fillMaxSize())
            Box(Modifier.align(Alignment.BottomStart).padding(10.dp).size(32.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) { Avatar(s.author, 28.dp) }
        }
        Spacer(Modifier.height(8.dp))
        Text(s.title ?: s.body, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text("${s.author.firstName} · ${s.reactions.love} loved", style = Pc.type.small, color = c.ink2, maxLines = 1)
    }
}
