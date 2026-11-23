package com.unsolo.app.ui.explore

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.foundation.Canvas
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
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
        // Dates and open seats only apply to trips; listings have neither.
        list.filter { t -> (t.isListing || (inWindow(t.nextDeparture, w) && (!open || (t.seatsLeft ?: 0) > 0))) && (p.paise == null || t.priceFromPaise <= p.paise) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val hero: StateFlow<Pair<TripLite?, TripDetail?>> = items.map { it.firstOrNull()?.slug }.distinctUntilChanged()
        .flatMapLatest { slug -> if (slug == null) flowOf(null to null) else g.explore.observeTrip(slug) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null to null)
    val suggestions = g.explore.observeSuggestions().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    /** Open community plans (not your own), for "Plans looking for people". */
    val plans: StateFlow<List<Post>> = g.tribe.observeFeed(PostKind.PLAN).map { st ->
        st.items.filterIsInstance<com.unsolo.app.data.PostItem>().map { it.post }.filter { it.kind == PostKind.PLAN && it.status == "live" && !it.viewer.isAuthor }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
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
        viewModelScope.launch { g.tribe.refreshFeed(PostKind.PLAN) }
        // Faces are only sent to signed-in viewers: refetch when the session changes.
        viewModelScope.launch {
            g.account.isSignedIn.drop(1).distinctUntilChanged().collect {
                refresh(); hero.value.first?.slug?.let { s -> g.explore.refreshTrip(s) }
            }
        }
    }

    /** Cursor for the next page (null: none or not loaded yet). Pages are 12 cards: fewer rows, less data. */
    val nextCursor = MutableStateFlow<String?>(null)
    val loadingMore = MutableStateFlow(false)
    /** Tabs (category + search) fetched at least once this session: until then an empty list means "loading", not "none". */
    val loaded = MutableStateFlow<Set<String>>(emptySet())
    private fun key() = category.value + "|" + query.value.trim()

    fun refresh() = viewModelScope.launch {
        refreshing.value = true
        val k = key()
        val r = g.explore.refreshExplore(category.value, query.value.trim())
        if (r !is ApiResult.Offline) loaded.value = loaded.value + k
        nextCursor.value = (r as? ApiResult.Ok)?.value
        error.value = when (r) { is ApiResult.Err -> "Couldn't refresh"; ApiResult.Offline -> null; else -> null }
        refreshing.value = false
    }

    fun loadMore() {
        val cursor = nextCursor.value ?: return
        if (loadingMore.value) return
        loadingMore.value = true
        viewModelScope.launch {
            val r = g.explore.refreshExplore(category.value, query.value.trim(), cursor = cursor, offset = all.value.size)
            if (r is ApiResult.Ok) nextCursor.value = r.value
            loadingMore.value = false
        }
    }

    /** Swipe on Explore: the next or previous tab (Trips, Stays, Activities, Rentals). */
    fun stepCategory(by: Int) {
        val keys = Categories.map { it.first }
        val i = keys.indexOf(category.value) + by
        if (i in keys.indices) category.value = keys[i]
    }

    fun clearFilters() { query.value = ""; window.value = WhenWindow.Any; openOnly.value = false; price.value = PriceCap.Any }
    fun toggleSave(slug: String) { g.trips.toggleSaved(slug) }

    fun nearMe() = viewModelScope.launch {
        val loc = g.location.get()
        g.settings.setNearMe(true)
        g.explore.refreshSuggestions(loc?.lat, loc?.lng)
    }

    fun tapSuggestion(s: Suggestion) = g.analytics.track("suggestion.tap", "explore", mapOf("type" to s.type, "reason" to s.reason))
}

private fun takeSeat(nav: AppNav, t: TripLite, screen: String) {
    if (t.isListing) { openTrip(nav, t); return }
    nav.graph.analytics.track("trip.take_seat", screen, mapOf("slug" to t.slug, "date" to t.nextDeparture))
    nav.openWeb("/packages/${t.slug}?book=1")
}

/** Everything opens natively (trips and listings share the detail page). */
private fun openTrip(nav: AppNav, t: TripLite) {
    // Stays, activities and rentals open the same native page as trips; only booking goes to the web.
    nav.to(Routes.trip(t.slug))
}

private fun categoryNoun(category: String) = when (category) { "stays" -> "stays"; "activities" -> "activities"; "rentals" -> "rentals"; else -> "departures" }

@Composable
fun ExploreScreen(nav: AppNav) {
    val vm: ExploreViewModel = viewModel { ExploreViewModel(nav.graph) }
    val category by vm.category.collectAsStateWithLifecycle()
    val items by vm.items.collectAsStateWithLifecycle()
    val hero by vm.hero.collectAsStateWithLifecycle()
    val suggestions by vm.suggestions.collectAsStateWithLifecycle()
    val saved by vm.saved.collectAsStateWithLifecycle()
    val plans by vm.plans.collectAsStateWithLifecycle()
    val me by vm.me.collectAsStateWithLifecycle()
    val query by vm.query.collectAsStateWithLifecycle()
    val window by vm.window.collectAsStateWithLifecycle()
    vm.openOnly.collectAsStateWithLifecycle(); vm.price.collectAsStateWithLifecycle()
    val counts = LocalHeaderCounts.current
    val locLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) vm.nearMe() }
    var searchSheet by remember { mutableStateOf(false) }
    var showAll by rememberSaveable { mutableStateOf(false) }
    val nextCursor by vm.nextCursor.collectAsStateWithLifecycle()
    val c = Pc.colors
    val leaving = items.take(3)
    val rest = items.drop(3)
    // "More" shows a few rows; the rest are a tap away in the full list (fewer rows, fewer images).
    val restShown = rest.take(MORE_ROWS)
    val moreCount = items.size - leaving.size - restShown.size
    val swipe = rememberCategorySwipe(vm)

    if (showAll) {
        AllResultsScreen(vm, nav, onFilters = { searchSheet = true }, onBack = { showAll = false })
        if (searchSheet) ExploreSearchSheet(vm, items.size, onDismiss = { searchSheet = false })
        return
    }

    Box(Modifier.fillMaxSize().background(c.paper)) {
        val exploreList = androidx.compose.foundation.lazy.rememberLazyListState()
        LaunchedEffect(Unit) { nav.reselected.collect { if (it == Routes.EXPLORE) exploreList.animateScrollToItem(0) } }
        val tabsStuck by remember { derivedStateOf { exploreList.firstVisibleItemIndex > 0 } }
        PullRefresh({ vm.refresh().join(); nav.graph.statuses.refresh() }, Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize().then(swipe), state = exploreList, contentPadding = PaddingValues(bottom = PcTokens.searchDock + 40.dp)) {
            item(key = "header", contentType = "header") {
                Column(Modifier.statusBarsPadding()) {
                    Row(Modifier.fillMaxWidth().height(PcTokens.topBar).padding(start = Gutter + 2.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Wordmark()
                        Spacer(Modifier.weight(1f))
                        HeaderActions(counts, { if (nav.requireSignIn()) nav.to(Routes.INBOX) }, { if (nav.requireSignIn()) nav.to(Routes.ACTIVITY) })
                    }
                    // "Find your circle" is a heading for screen readers only; the chips sit right under the top bar.
                    Box(Modifier.fillMaxWidth().height(1.dp).semantics { heading(); contentDescription = "Find your circle" })
                }
            }
            // The tabs stay pinned while you scroll; swiping the page left or right also switches them.
            stickyHeader(key = "tabs", contentType = "tabs") {
                Column(Modifier.fillMaxWidth().background(c.paper).then(if (tabsStuck) Modifier.statusBarsPadding() else Modifier)) {
                    TextTabs(Categories, category, { vm.category.value = it }, icons = CategoryIcons)
                    Spacer(Modifier.height(6.dp))
                }
            }
            if (items.isEmpty()) {
                item(key = "empty") {
                    val noun = categoryNoun(category)
                    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
                    val loaded by vm.loaded.collectAsStateWithLifecycle()
                    val offline = !nav.graph.connectivity.online.collectAsStateWithLifecycle().value
                    when {
                        // Not fetched yet (or fetching): placeholders shaped like the cards, never a bare page.
                        !offline && (refreshing || "$category|${query.trim()}" !in loaded) -> ExploreSkeleton()
                        vm.filterCount > 0 || query.isNotBlank() -> EmptyState("No $noun match", if (category == "trips") "Try another week or clear the filters." else "Try another place or clear the filters.", action = "Clear filters", onAction = { vm.clearFilters() })
                        offline -> EmptyState("You're offline", "Connect to see $noun.", action = "Retry", onAction = { vm.refresh() })
                        else -> EmptyState("No $noun yet", "New ones are added every week.", action = "Refresh", onAction = { vm.refresh() })
                    }
                }
            } else {
                item(key = "hero-h", contentType = "section") { SectionHeader(when (category) { "stays" -> "Places to stay"; "activities" -> "Things to do"; "rentals" -> "Rent for the road"; else -> "Leaving soon" }, trailing = "See all", trailingLink = { showAll = true }) }
                item(key = "pager", contentType = "pager") {
                    val w = LocalConfiguration.current.screenWidthDp.dp
                    val pager = rememberPagerState { leaving.size }
                    HorizontalPager(pager, contentPadding = PaddingValues(horizontal = Gutter), pageSpacing = 12.dp,
                        // Density: ~78% of the width (max 300dp) for trips, ~62% for stays/activities/rentals, so the next card peeks.
                        pageSize = PageSize.Fixed(if (leaving.size > 1) (if (category == "trips") minOf(w * 0.78f, 300.dp) else w * 0.62f) else w - Gutter * 2), key = { leaving[it].slug }, verticalAlignment = Alignment.Top) { i ->
                        val t = leaving[i]
                        TripCard(t, t.slug in saved, onSave = { vm.toggleSave(t.slug) }, onOpen = { openTrip(nav, t) }, onTake = { takeSeat(nav, t, "explore") })
                    }
                }
            }
            // Stories from travellers (24 hours), the same row as the top of Tribe.
            if (query.isBlank()) item(key = "stories", contentType = "stories") {
                com.unsolo.app.ui.status.StatusRail(nav, Modifier.padding(top = 10.dp), hideWhenEmpty = true, title = "Stories")
            }
            // Plans looking for people: one row that leads with the invite card, then open plans.
            if (category == "trips" && query.isBlank()) {
                item(key = "plans-h", contentType = "section") { SectionHeader("Plans looking for people", Modifier.padding(top = 8.dp)) }
                item(key = "plans", contentType = "plans") {
                    LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        item(key = "invite") {
                            PlanInviteCard(plans.size, plans.map { it.author }.distinctBy { it.id }.take(3),
                                onStart = { if (nav.requirePhone()) nav.to(Routes.compose(PostKind.PLAN)) }, onTribe = { nav.tab(Routes.TRIBE) })
                        }
                        items(plans.take(6), key = { "plan-" + it.id }) { p -> ExplorePlanCard(p, me?.user?.id) { nav.to(Routes.post(p.id)) } }
                    }
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
                // One list, same as web: "Next few weeks" (dates already sorted soonest first).
                item(key = "next-weeks", contentType = "section") {
                    SectionHeader(if (category == "trips") "More trips" else "More ${categoryNoun(category)}", Modifier.padding(top = 12.dp), trailing = "See all", trailingLink = { showAll = true })
                }
                items(restShown, key = { "dep-" + it.slug }, contentType = { "departure" }) { t -> DepartureRow(t) { openTrip(nav, t) } }
                if (moreCount > 0 || nextCursor != null) item(key = "see-all", contentType = "more") {
                    PcButton(if (nextCursor == null) "See all ${items.size} ${categoryNoun(category).let { if (category == "trips") "trips" else it }}" else "See all ${categoryNoun(category).let { if (category == "trips") "trips" else it }}",
                        { showAll = true }, Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 12.dp), kind = BtnKind.Outline)
                }
            }
        }
        }
        SearchDock(
            label = query.ifBlank { "Where to?" }, sub = window.label, filters = vm.filterCount,
            onClick = { searchSheet = true }, onMap = { nav.to(Routes.exploreMap(category)) },
            modifier = Modifier.align(Alignment.BottomCenter).padding(start = Gutter, end = Gutter, bottom = 18.dp),
        )
    }
    if (searchSheet) ExploreSearchSheet(vm, items.size, onDismiss = { searchSheet = false }, onShow = { searchSheet = false; showAll = true })
}

private const val MORE_ROWS = 5

/** Placeholder cards and rows that pulse while a tab loads. */
@Composable
private fun ExploreSkeleton() {
    val c = Pc.colors
    val pulse = androidx.compose.animation.core.rememberInfiniteTransition(label = "sk")
    val a by pulse.animateFloat(0.45f, 0.9f, androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(700), androidx.compose.animation.core.RepeatMode.Reverse), label = "sk-a")
    val block = Modifier.graphicsLayer { alpha = a }.clip(RoundedCornerShape(12.dp)).background(c.tonal)
    Column(Modifier.fillMaxWidth().padding(horizontal = Gutter).semantics { contentDescription = "Loading" }) {
        Box(block.padding(top = 6.dp).width(140.dp).height(22.dp))
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(2) { i ->
                Column(Modifier.width(if (i == 0) 280.dp else 120.dp)) {
                    Box(block.fillMaxWidth().aspectRatio(16f / 10f))
                    Spacer(Modifier.height(10.dp)); Box(block.fillMaxWidth(0.8f).height(16.dp))
                    Spacer(Modifier.height(6.dp)); Box(block.fillMaxWidth(0.5f).height(12.dp))
                }
            }
        }
        Spacer(Modifier.height(24.dp))
        repeat(3) {
            Row(Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(block.size(46.dp))
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) { Box(block.fillMaxWidth(0.7f).height(14.dp)); Spacer(Modifier.height(6.dp)); Box(block.fillMaxWidth(0.45f).height(11.dp)) }
                Box(block.width(54.dp).height(16.dp))
            }
        }
    }
}

/** Horizontal swipe anywhere on the page moves to the next / previous tab; the page leans with the finger. */
@Composable
private fun rememberCategorySwipe(vm: ExploreViewModel): Modifier {
    val threshold = with(androidx.compose.ui.platform.LocalDensity.current) { 72.dp.toPx() }
    var drag by remember { mutableFloatStateOf(0f) }
    val lean by androidx.compose.animation.core.animateFloatAsState(if (drag == 0f) 0f else drag * 0.25f, label = "lean")
    return Modifier
        .graphicsLayer { translationX = lean }
        .pointerInput(Unit) {
            detectHorizontalDragGestures(
                onDragEnd = { if (drag < -threshold) vm.stepCategory(1) else if (drag > threshold) vm.stepCategory(-1); drag = 0f },
                onDragCancel = { drag = 0f },
            ) { change, dx -> drag += dx; change.consume() }
        }
}

/**
 * "See all": every card for the current tab and filters, full width, 12 at a time: the next page
 * loads as you near the end. Filters and tabs stay at hand; swipe switches tabs here too.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AllResultsScreen(vm: ExploreViewModel, nav: AppNav, onFilters: () -> Unit, onBack: () -> Unit) {
    val c = Pc.colors
    val items by vm.items.collectAsStateWithLifecycle()
    val category by vm.category.collectAsStateWithLifecycle()
    val saved by vm.saved.collectAsStateWithLifecycle()
    val next by vm.nextCursor.collectAsStateWithLifecycle()
    val loadingMore by vm.loadingMore.collectAsStateWithLifecycle()
    val query by vm.query.collectAsStateWithLifecycle()
    val window by vm.window.collectAsStateWithLifecycle()
    androidx.activity.compose.BackHandler(onBack = onBack)
    val list = androidx.compose.foundation.lazy.rememberLazyListState()
    val nearEnd by remember { derivedStateOf { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 >= list.layoutInfo.totalItemsCount - 3 } }
    LaunchedEffect(nearEnd, next) { if (nearEnd && next != null) vm.loadMore() }
    Box(Modifier.fillMaxSize().background(c.paper)) {
        Column(Modifier.fillMaxSize()) {
            DetailTopBar(if (category == "trips") "All trips" else "All ${categoryNoun(category)}", onBack = onBack, headerActions = false)
            TextTabs(Categories, category, { vm.category.value = it }, icons = CategoryIcons)
            LazyColumn(Modifier.weight(1f).then(rememberCategorySwipe(vm)), state = list,
                contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 8.dp, bottom = PcTokens.searchDock + 40.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                if (items.isEmpty()) item { EmptyState("Nothing matches", "Try another place or clear the filters.", action = "Clear filters", onAction = { vm.clearFilters() }) }
                items(items, key = { "all-" + it.slug }, contentType = { "card" }) { t ->
                    TripCard(t, t.slug in saved, onSave = { vm.toggleSave(t.slug) }, onOpen = { openTrip(nav, t) }, onTake = { takeSeat(nav, t, "explore_all") })
                }
                if (next != null || loadingMore) item(key = "more") {
                    Box(Modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                        androidx.compose.material3.CircularProgressIndicator(Modifier.size(22.dp), color = c.ink2, strokeWidth = 2.dp)
                    }
                }
            }
        }
        SearchDock(label = query.ifBlank { "Where to?" }, sub = window.label, filters = vm.filterCount, onClick = onFilters, onMap = { nav.to(Routes.exploreMap(category)) },
            modifier = Modifier.align(Alignment.BottomCenter).padding(start = Gutter, end = Gutter, bottom = 18.dp))
    }
}

/** Bottom search: a 56dp pill floating above the tab bar ("Where to? · Any week" + filter button). */
@Composable
fun SearchDock(label: String, sub: String, filters: Int, onClick: () -> Unit, modifier: Modifier = Modifier, onMap: (() -> Unit)? = null) {
    val c = Pc.colors
    val shape = CircleShape
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    Row(
        Modifier.weight(1f).height(PcTokens.searchDock)
            .shadow(10.dp, shape, clip = false, ambientColor = Color.Black.copy(alpha = 0.10f), spotColor = Color.Black.copy(alpha = 0.18f))
            .clip(shape).background(c.raised).border(1.dp, c.rule, shape)
            .clickable(role = Role.Button, onClickLabel = "Search and filters", onClick = onClick)
            .padding(start = 18.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PcIcon(PcIcons.Search, null, tint = c.ink, size = 20.dp)
        Spacer(Modifier.width(12.dp))
        // "Where to?" keeps its room; the dates give way when space is short.
        Text(label, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 150.dp))
        Text("  ·  $sub", style = Pc.type.body, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Box(Modifier.size(38.dp).clip(CircleShape).background(c.tonal).semantics { contentDescription = "Filters" }, contentAlignment = Alignment.Center) {
            PcIcon(PcIcons.Sliders, null, tint = c.ink, size = 20.dp)
            if (filters > 0) Box(Modifier.align(Alignment.TopEnd).size(16.dp).clip(CircleShape).background(c.ink), contentAlignment = Alignment.Center) {
                Text("$filters", style = Pc.type.label.copy(fontSize = 8.5.sp, fontWeight = FontWeight.ExtraBold), color = c.raised)
            }
        }
    }
    // Map: right next to search, where the thumb already is.
    if (onMap != null) Row(
        Modifier.height(PcTokens.searchDock)
            .shadow(10.dp, shape, clip = false, ambientColor = Color.Black.copy(alpha = 0.10f), spotColor = Color.Black.copy(alpha = 0.22f))
            .clip(shape).background(c.ink).clickable(role = Role.Button, onClickLabel = "Show on a map", onClick = onMap).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PcIcon(PcIcons.Pin, null, tint = c.onInk, size = 18.dp)
        Spacer(Modifier.width(6.dp))
        Text("Map", style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.onInk)
    }
    }
}

@Composable
private fun ExploreSearchSheet(vm: ExploreViewModel, count: Int, onDismiss: () -> Unit, onShow: () -> Unit = onDismiss) {
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
        SwitchRow("Only departures with open spots", "Hide full circles", open, { vm.openOnly.value = it }, Modifier.padding(horizontal = 4.dp))
        Spacer(Modifier.height(10.dp))
        Row(Modifier.padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            PcButton("Clear", { vm.clearFilters() }, kind = BtnKind.Ghost)
            PcButton(if (count == 1) "Show 1 result" else "Show $count results", onShow, Modifier.weight(1f), kind = BtnKind.Accent)
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
    Column(modifier.size(width = 40.dp, height = 44.dp).clip(RoundedCornerShape(12.dp)).background(c.raised), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(Fmt.dayNum(date), style = Pc.type.numLarge.copy(fontSize = 16.sp), color = c.ink)
        Text(Fmt.monUpper(date), style = Pc.type.code.copy(fontSize = 8.5.sp), color = c.ink2)
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
 * host, a short "N going" line, price and "Grab a spot".
 */
@Composable
fun TripCard(t: TripLite, saved: Boolean, onSave: () -> Unit, onOpen: () -> Unit, onTake: () -> Unit, modifier: Modifier = Modifier, label: String? = null) {
    val c = Pc.colors
    val ring = ringFromCounts(t.seatsTotal, t.seatsLeft)
    val open = ring.total - ring.taken
    Column(modifier.fillMaxWidth().raisedCard().clickable(onClickLabel = "Open ${t.title}", onClick = onOpen).padding(6.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f).clip(RoundedCornerShape(PcTokens.radiusImage))) {
            ProgressiveImage(t.image, Modifier.fillMaxSize(), t.title)
            Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(56.dp).background(Brush.verticalGradient(listOf(Color.Transparent, Color(0x47111111)))))
            if (!t.isListing && t.nextDeparture != null) DateChip(t.nextDeparture, Modifier.align(Alignment.TopStart).padding(10.dp))
            GlassButton(if (saved) PcIcons.HeartFilled else PcIcons.Heart, if (saved) "Saved" else "Save", onSave, Modifier.align(Alignment.TopEnd).padding(4.dp), tint = if (saved) c.rose else c.ink)
            if (label != null) Text(label, style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = c.ink,
                modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp).clip(CircleShape).background(c.raised.copy(alpha = 0.86f)).padding(horizontal = 10.dp, vertical = 5.dp))
        }
        if (t.isListing) Column(Modifier.padding(start = 6.dp, end = 6.dp, top = 10.dp)) {
            Text(t.title, style = Pc.type.title2.copy(fontSize = 15.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            t.place?.name?.let { Text(it, style = Pc.type.small.copy(fontSize = 12.5.sp), color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        } else Row(Modifier.padding(horizontal = 6.dp).overlapUp(36.dp), verticalAlignment = Alignment.Top) {
            RingMount {
                when {
                    // No upcoming date (past-only or undated): no seat count to show, so never "full".
                    t.nextDeparture == null || t.seatsLeft == null -> SeatRing(ringFromCounts(t.seatsTotal, t.seatsTotal), PcTokens.ringCard, past = true, centerLabel = "Ask" to "for dates")
                    isPastDate(t.nextDeparture) -> SeatRing(ring, PcTokens.ringCard, past = true, centerLabel = (if (ring.filled > 0) "${ring.filled}" else "✓") to (if (ring.filled > 0) "went" else "done"))
                    else -> SeatRing(ring, PcTokens.ringCard, spotsLabel = true)
                }
            }
            Column(Modifier.weight(1f).padding(start = 10.dp, top = 40.dp)) {
                Text(t.title, style = Pc.type.title2.copy(fontSize = 15.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(t.place?.name, Fmt.nights(t.durationDays).takeIf { t.durationDays > 0 }).joinToString(" · "), style = Pc.type.small.copy(fontSize = 12.5.sp), color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Column(Modifier.padding(start = 6.dp, end = 6.dp, top = 8.dp, bottom = 2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                t.host?.let { Tag(it.name, TagKind.Verified, Modifier.weight(1f, fill = false)); Spacer(Modifier.width(10.dp)) }
                if (!t.isListing) Text(when { t.nextDeparture == null -> "Dates on request"; ring.full -> "Full"; ring.filled <= 0 -> "Be first in the circle"; else -> "${ring.filled} going" },
                    style = Pc.type.smallStrong.copy(fontSize = 12.sp), color = if (ring.full) c.full else c.ink2, modifier = Modifier.weight(1f), textAlign = TextAlign.End, maxLines = 1)
            }
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.Bottom) {
                    Text(MoneyFormat.rupees(t.priceFromPaise), style = Pc.type.priceLarge.copy(fontSize = 17.sp), color = c.ink)
                    Text("/${if (t.isListing) t.unit ?: "booking" else "person"}", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(start = 3.dp, bottom = 2.dp))
                }
                if (t.isListing) PcButton("View", onOpen, kind = BtnKind.Quiet, height = BtnSmall)
                else if (t.nextDeparture == null) PcButton("View", onOpen, kind = BtnKind.Quiet, height = BtnSmall)
                else PcButton(if (ring.full) "Full" else "Grab a spot", onTake, kind = BtnKind.Quiet, height = BtnSmall, enabled = !ring.full)
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
        PcIcon(PcIcons.ArrowRight, null, size = 18.dp, tint = c.ink2)
    }
}

@Composable
private fun SuggestionRail(items: List<Suggestion>, onNearMe: () -> Unit, onTap: (Suggestion) -> Unit) {
    val c = Pc.colors
    Column(Modifier.padding(top = 8.dp)) {
        SectionHeader("For you")
        LazyRow(contentPadding = PaddingValues(horizontal = Gutter, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            item(key = "near") {
                Column(Modifier.width(128.dp).height(116.dp).clip(RoundedCornerShape(PcTokens.radiusCard)).background(c.tonal).clickable(onClickLabel = "Suggestions near you", onClick = onNearMe).padding(14.dp)) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) { PcIcon(PcIcons.NearMe, null, size = 20.dp, tint = c.ink) }
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
                Column(Modifier.width(180.dp).height(116.dp).then(if (plan) Modifier.pencilledCard() else Modifier.raisedCard()).clickable { onTap(s) }.padding(14.dp)) {
                    Text(s.reason, style = Pc.type.label, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick).defaultMinSize(minHeight = 60.dp).padding(vertical = 7.dp, horizontal = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            ProgressiveImage(t.image, Modifier.size(46.dp).clip(RoundedCornerShape(12.dp)), t.title)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(t.title, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (t.isListing) t.place?.name ?: "" else listOfNotNull(Fmt.dowDayMonth(t.nextDeparture).ifEmpty { "Dates on request" }, Fmt.nights(t.durationDays).takeIf { t.durationDays > 0 }, t.place?.name?.substringBefore(',')).joinToString(" · "),
                    style = Pc.type.small, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.width(10.dp))
            val gone = isPastDate(t.nextDeparture)
            if (ring.total > 0 && t.nextDeparture != null) MiniArc(ring.total, ring.taken, past = gone)
            Spacer(Modifier.width(12.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(MoneyFormat.rupees(t.priceFromPaise), style = Pc.type.price, color = c.ink)
                if (t.isListing) Text("per ${t.unit ?: "booking"}", style = Pc.type.small, color = c.ink2)
                else if (t.nextDeparture != null) Text(if (gone) "Done" else if (ring.full) "Full" else "${ring.total - ring.taken} open", style = Pc.type.small, color = if (ring.full && !gone) c.full else c.ink2)
            }
        }
        Hairline()
    }
}

/** Linked next departure (on stories): mini arc · date · spots and price · "Grab a spot →". */
@Composable
fun HostedTripCard(t: TripLite, onOpen: () -> Unit, onTake: () -> Unit, label: String = "Next departure") {
    val c = Pc.colors
    val ring = ringFromCounts(t.seatsTotal, t.seatsLeft)
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.tonal).clickable(onClick = onOpen).padding(start = 10.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (ring.total > 0) MiniArc(ring.total, ring.taken, size = 38.dp) else ProgressiveImage(t.image, Modifier.size(38.dp).clip(CircleShape))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text("$label · ${Fmt.dayMonth(t.nextDeparture)}", style = Pc.type.smallStrong.copy(fontWeight = FontWeight.Bold, fontSize = 11.5.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(if (t.nextDeparture == null) "Dates on request" else if (isPastDate(t.nextDeparture)) "Trip done" else t.seatsLeft?.let { if (it == 0) "Full" else "$it spot${if (it == 1) "" else "s"} left" }, MoneyFormat.rupees(t.priceFromPaise)).joinToString(" · "), style = Pc.type.small, color = c.ink2, maxLines = 1)
        }
        Box(Modifier.defaultMinSize(minHeight = 48.dp).clip(CircleShape).clickable(role = Role.Button, onClick = onTake).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
            Text("Grab a spot →", style = Pc.type.smallStrong.copy(fontWeight = FontWeight.ExtraBold, fontSize = 11.5.sp), color = c.accentInk, maxLines = 1)
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
            items(results, key = { it.slug }, contentType = { "departure" }) { t -> DepartureRow(t) { openTrip(nav, t) } }
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

    fun toggleSave() { g.trips.toggleSaved(slug) }

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
    // "More like this": the cached Explore list for the same tab (no extra request).
    val kindCat = when ((detail?.lite() ?: lite)?.kind) { "stay" -> "stays"; "activity" -> "activities"; "rental" -> "rentals"; else -> "trips" }
    val related by remember(kindCat, slug) { nav.graph.explore.observeExplore(kindCat).map { l -> l.filter { it.slug != slug }.take(8) } }.collectAsStateWithLifecycle(emptyList())
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
    val ring = if (date == t.nextDeparture && !detail?.seats.isNullOrEmpty()) ringFromSeats(detail!!.seats, me?.user?.id, seatsTotal = dep?.seatsTotal ?: t.seatsTotal)
        else if (dep != null) ringFromCounts(dep.seatsTotal, dep.seatsLeft) else ringFromCounts(t.seatsTotal, t.seatsLeft)
    val left = dep?.seatsLeft ?: t.seatsLeft ?: (ring.total - ring.filled)
    // Trip photos are 16:9 (the host form crops to it), so the cover is 16:9 too: nothing cut off.
    var viewer by remember { mutableStateOf<Int?>(null) }
    var reviewPhotos by remember { mutableStateOf<Pair<List<Media>, Int>?>(null) }

    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val pastCover by remember { derivedStateOf { listState.firstVisibleItemIndex > 0 } }
    Box(Modifier.fillMaxSize()) {
    viewer?.let { PhotoViewer(images, it, t.title) { viewer = null } }
    reviewPhotos?.let { (ph, i) -> PhotoViewer(ph, i, "Review photo") { reviewPhotos = null } }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        LazyColumn(Modifier.weight(1f), state = listState) {
            item(key = "cover", contentType = "cover") {
                val pager = rememberPagerState { images.size.coerceAtLeast(1) }
                // Starts below the status bar so the top of the photo isn't hidden behind it.
                Box(Modifier.fillMaxWidth().background(c.paper).statusBarsPadding().aspectRatio(16f / 9f)) {
                    HorizontalPager(pager, Modifier.fillMaxSize(), key = { it }) { i ->
                        ProgressiveImage(images.getOrNull(i), Modifier.fillMaxSize().clickable(onClickLabel = "View photo") { viewer = i }, t.title)
                    }
                    Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(140.dp).background(Brush.verticalGradient(listOf(Color.Transparent, Color(0x59111111)))))
                    Box(Modifier.align(Alignment.TopCenter).fillMaxWidth().height(72.dp).background(Brush.verticalGradient(listOf(Color(0x33111111), Color.Transparent))))
                    Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp).fillMaxWidth()) {
                        GlassButton(PcIcons.Back, "Back", { nav.back() })
                        Spacer(Modifier.weight(1f))
                        GlassButton(PcIcons.Share, "Share", { nav.share("${t.title} on UnSOLO: https://unsolo.in/packages/${t.slug}") })
                    }
                    if (images.size > 1) Text("${pager.currentPage + 1} / ${images.size}", style = Pc.type.label, color = Color.White,
                        modifier = Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 16.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 10.dp, vertical = 4.dp))
                }
            }
            item(key = "title") {
                Column(Modifier.fillMaxWidth().padding(horizontal = Gutter).padding(top = 14.dp)) {
                    Text(t.title, style = Pc.type.display.copy(fontSize = 24.sp), color = c.ink)
                    t.place?.name?.let { Text(it, style = Pc.type.body, color = c.ink2, modifier = Modifier.padding(top = 2.dp)) }
                    // Host: a small face right beside the name.
                    t.host?.let { h ->
                        Row(Modifier.padding(top = 12.dp).clip(RoundedCornerShape(12.dp)).clickable { if (h.username.isNotBlank()) nav.to(Routes.profile(h.username)) }.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Avatar(h, 30.dp)
                            Spacer(Modifier.width(8.dp))
                            Text(buildAnnotatedString { append("Hosted by "); withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = c.ink)) { append(h.name) } },
                                style = Pc.type.body, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                            if (h.isIdVerified) { Spacer(Modifier.width(4.dp)); VerifiedMark() }
                            if (h.isHost) { Spacer(Modifier.width(6.dp)); Tag("Host", TagKind.Host, height = 20.dp) }
                        }
                    }
                    // Seats: one line, with who's booked (faces show to co-travellers).
                    if (!t.isListing && date != null) {
                        val faces = detail?.goingFaces?.ifEmpty { null } ?: t.goingFaces
                        val names = faces.map { it.firstName }.filter { it.isNotBlank() }
                        Row(Modifier.padding(top = 8.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.tonal).clickable(onClickLabel = "See who's going") { whoSheet = true }
                            .padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            val gone = isPastDate(date)
                            MiniArc(ring.total, ring.taken, size = 32.dp, past = gone)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(when {
                                    gone -> "Trip done · ${Fmt.dayMonth(date)}"
                                    ring.full -> "Full"
                                    else -> "$left of ${ring.total} spots left"
                                }, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = if (ring.full && !gone) c.full else c.ink)
                                Text(when {
                                    gone && names.isNotEmpty() -> names.take(2).joinToString(", ") + (if (ring.filled > names.take(2).size) " +${ring.filled - names.take(2).size}" else "") + " travelled"
                                    gone -> if (ring.filled > 0) "${ring.filled} travelled on this one" else "This date has passed"
                                    names.isNotEmpty() -> names.take(2).joinToString(", ") + (if (ring.filled > names.take(2).size) " +${ring.filled - names.take(2).size}" else "") + " going"
                                    ring.filled > 0 -> "${ring.filled} going · faces show once you book"
                                    else -> "Be the first in the circle"
                                }, style = Pc.type.small, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            if (faces.isNotEmpty()) FaceStack(faces.take(3), size = 26.dp)
                            PcIcon(PcIcons.ChevronRight, null, size = 16.dp, tint = c.ink3)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    val back = Fmt.date(date)?.plusDays((t.durationDays - 1).coerceAtLeast(0).toLong())?.toString()
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (!t.isListing) InfoChip(PcIcons.Calendar, if (date == null) "Dates on request" else if (t.durationDays > 1) "${Fmt.dayMonth(date)} – ${Fmt.dayMonth(back)}" else Fmt.dowDayMonth(date))
                        if (!t.isListing && t.durationDays > 0) InfoChip(PcIcons.Clock, Fmt.nights(t.durationDays))
                        InfoChip(PcIcons.Star, detail?.rating?.takeIf { it.count > 0 }?.let { "%.1f · %d reviews".format(it.avg, it.count) } ?: "New")
                    }
                    if (!detail?.description.isNullOrBlank()) {
                        var more by rememberSaveable { mutableStateOf(false) }
                        val long = detail!!.description.length > 320
                        Text(detail.description, style = Pc.type.body, color = c.ink, maxLines = if (long && !more) 6 else Int.MAX_VALUE, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.fillMaxWidth().padding(top = 14.dp))
                        if (long) LinkText(if (more) "Show less" else "Read more", { more = !more }, style = Pc.type.smallStrong)
                    }
                }
            }
            val deps = detail?.departures.orEmpty()
            if (deps.size > 1) item(key = "deps") {
                // Dates side by side; the selected one sets the seats line and the bar below.
                Column(Modifier.padding(top = 14.dp)) {
                    SectionHeader("Pick a date", trailing = "${deps.size} dates")
                    LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(deps, key = { it.date }) { d ->
                            val sel = d.date == date
                            val gone = isPastDate(d.date)
                            val full = d.seatsLeft <= 0 && !gone
                            val shape = RoundedCornerShape(14.dp)
                            Column(Modifier.width(96.dp).clip(shape).background(if (sel) c.ink else c.raised).border(1.dp, if (sel) c.ink else c.rule, shape)
                                .clickable(role = Role.RadioButton) { vm.selectedDate.value = d.date }.padding(horizontal = 10.dp, vertical = 10.dp)) {
                                Text(Fmt.dowUpper(d.date), style = Pc.type.code.copy(fontSize = 10.sp), color = if (sel) c.raised.copy(alpha = 0.8f) else c.ink2)
                                Text(Fmt.dayMonth(d.date), style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = if (sel) c.raised else c.ink)
                                Text(if (gone) "Done" else if (full) "Full" else "${d.seatsLeft} left", style = Pc.type.small, color = if (sel) c.raised.copy(alpha = 0.85f) else if (full) c.full else if (gone) c.ink3 else c.ink2)
                            }
                        }
                    }
                }
            }
            val includes = detail?.includes.orEmpty()
            val reviews = detail?.reviews.orEmpty()
            if (reviews.isNotEmpty()) item(key = "reviews") {
                Column(Modifier.padding(top = 16.dp)) {
                    SectionHeader("What travellers say", trailing = detail?.rating?.takeIf { it.count > 0 }?.let { "★ %.1f · %d".format(it.avg, it.count) })
                    LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(reviews, key = { it.id }) { r ->
                            Column(Modifier.width(270.dp).raisedCard().padding(14.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Avatar(r.author, 28.dp); Spacer(Modifier.width(8.dp))
                                    Text(r.author.firstName, style = Pc.type.smallStrong, color = c.ink, modifier = Modifier.weight(1f))
                                    Text("★".repeat(r.rating.coerceIn(0, 5)), style = Pc.type.small, color = c.gold)
                                }
                                r.title?.let { Text(it, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, modifier = Modifier.padding(top = 8.dp), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                                r.body?.let { Text(it, style = Pc.type.small, color = c.ink2, maxLines = 4, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp)) }
                                if (r.photos.isNotEmpty()) Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    r.photos.take(3).forEachIndexed { i, m ->
                                        ProgressiveImage(m, Modifier.size(70.dp).clip(RoundedCornerShape(10.dp)).clickable { reviewPhotos = r.photos to i })
                                    }
                                    if (r.photos.size > 3) Text("+${r.photos.size - 3}", style = Pc.type.smallStrong, color = c.ink2, modifier = Modifier.align(Alignment.CenterVertically))
                                }
                            }
                        }
                    }
                }
            }
            if (includes.isNotEmpty()) item(key = "inc") {
                var open by rememberSaveable { mutableStateOf(false) }
                Column(Modifier.padding(start = Gutter, end = Gutter, top = 16.dp).fillMaxWidth().raisedCard()) {
                    Row(Modifier.fillMaxWidth().clickable(onClickLabel = if (open) "Hide" else "Show") { open = !open }.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(if (t.isListing) "Amenities" else "What's included", style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, modifier = Modifier.weight(1f))
                        Text("${includes.size}", style = Pc.type.small, color = c.ink2)
                        Spacer(Modifier.width(6.dp))
                        PcIcon(if (open) PcIcons.ChevronUp else PcIcons.ChevronDown, null, size = 18.dp, tint = c.ink2)
                    }
                    androidx.compose.animation.AnimatedVisibility(open) {
                        Column(Modifier.padding(bottom = 6.dp)) {
                            includes.forEach { inc ->
                                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    PcIcon(PcIcons.Check, null, size = 16.dp, tint = c.ink)
                                    Spacer(Modifier.width(10.dp))
                                    Text(inc, style = Pc.type.body, color = c.ink)
                                }
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
            if (related.isNotEmpty()) item(key = "related") {
                Column(Modifier.padding(top = 18.dp)) {
                    SectionHeader(if (t.isListing) "More like this" else "More trips")
                    LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(related, key = { "rel-" + it.slug }) { r ->
                            TripCard(r, false, onSave = {}, onOpen = { openTrip(nav, r) }, onTake = { takeSeat(nav, r, "trip_related") }, modifier = Modifier.width(260.dp))
                        }
                    }
                }
            }
            item(key = "end") { Spacer(Modifier.height(20.dp)) }
        }
        BottomActionBar(
            title = MoneyFormat.rupees(t.priceFromPaise), titleMono = true, titleSuffix = "/${if (t.isListing) t.unit ?: "booking" else "person"}",
            subtitle = when {
                t.isListing -> t.place?.name ?: "Book on UnSOLO"
                date == null -> "Dates on request"
                isPastDate(date) -> "${Fmt.dowDayMonth(date)} has passed · ask for the next one"
                left > 0 -> "${Fmt.dowDayMonth(date)} · $left ${if (left == 1) "spot" else "spots"} left"
                else -> "${Fmt.dowDayMonth(date)} is full · pick another date"
            },
            action = if (t.isListing) "Book" else if (date == null || isPastDate(date)) "Ask for dates" else "Grab a spot", kind = BtnKind.Accent, enabled = t.isListing || date == null || isPastDate(date) || left > 0,
            onAction = { if (t.isListing) t.webPath?.let { nav.openWeb(it) } else vm.takeSeat(nav, if (isPastDate(date)) null else date) },
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
    Row(Modifier.height(32.dp).clip(CircleShape).background(c.raised).border(1.dp, c.rule, CircleShape).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        PcIcon(icon, null, size = 16.dp, tint = c.ink)
        Spacer(Modifier.width(6.dp))
        Text(text, style = Pc.type.smallStrong.copy(fontSize = 12.sp), color = c.ink, maxLines = 1)
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
            SeatRing(ring, 172.dp, photo = t.image, badge = t.host?.let { RingBadge(it) })
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
            youSeat?.let { s -> InsetRule(64.dp); PersonRow(s.user, "Your spot", onClick = null) { Box(Modifier.size(12.dp).clip(CircleShape).background(c.gold).border(1.5.dp, c.ink, CircleShape)) } }
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
                Text(if (ring.full) "No open spots" else "${ring.total - ring.filled} spots open", style = Pc.type.bodyStrong, color = c.ink)
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
    Column(Modifier.width(204.dp).clip(RoundedCornerShape(PcTokens.radiusImage)).clickable(onClick = onClick)) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f).clip(RoundedCornerShape(PcTokens.radiusImage))) {
            ProgressiveImage(s.media.firstOrNull(), Modifier.fillMaxSize())
            Box(Modifier.align(Alignment.BottomStart).padding(10.dp).size(32.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) { Avatar(s.author, 28.dp) }
        }
        Spacer(Modifier.height(8.dp))
        Text(s.title ?: s.body, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text("${s.author.firstName} · ${s.reactions.love} loved", style = Pc.type.small, color = c.ink2, maxLines = 1)
    }
}


/** Centre word under the seat count. */
fun seatsLeftWord(open: Int, full: Boolean) = spotsWord(open, full)

/** A departure date that has already gone: shown as "N travelled", never "full". */
fun isPastDate(date: String?) = (Fmt.daysUntil(date) ?: 0) < 0

/**
 * Invite card that leads "Plans looking for people". The whole card opens the plan composer;
 * the "N planning in Tribe" line is its own target. Dashed like plans, press scale 0.99, no other motion.
 */
@Composable
fun PlanInviteCard(planning: Int, faces: List<UserLite>, onStart: () -> Unit, onTribe: () -> Unit) {
    val c = Pc.colors
    val src = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val scale by androidx.compose.animation.core.animateFloatAsState(if (pressed && !Pc.reduceMotion) 0.99f else 1f, androidx.compose.animation.core.tween(PcTokens.motionFast), label = "press")
    Column(Modifier.width(256.dp).graphicsLayer { scaleX = scale; scaleY = scale }.pencilledCard()
        .clickable(interactionSource = src, indication = androidx.compose.material3.ripple(), role = Role.Button, onClickLabel = "Post a plan", onClick = onStart).padding(14.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Box(Modifier.size(38.dp).clip(CircleShape).background(c.ink), contentAlignment = Alignment.Center) { PcIcon(PcIcons.Plus, null, tint = c.raised, size = 19.dp) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Going somewhere? Post a plan.", style = Pc.type.title3, color = c.ink)
                Spacer(Modifier.height(4.dp))
                Text("Travellers heading your way ask to join. No booking, no money.", style = Pc.type.small, color = c.ink2)
            }
        }
        if (planning > 0) Row(Modifier.padding(top = 4.dp, start = 48.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Open Tribe", onClick = onTribe).defaultMinSize(minHeight = 48.dp).padding(end = 6.dp),
            verticalAlignment = Alignment.CenterVertically) {
            if (faces.isNotEmpty()) { FaceStack(faces, size = 22.dp); Spacer(Modifier.width(8.dp)) }
            Text("$planning planning in Tribe →", style = Pc.type.smallStrong.copy(fontWeight = FontWeight.Bold), color = c.accentInk, maxLines = 1)
        }
    }
}

/** Compact open plan for the Explore row. */
@Composable
private fun ExplorePlanCard(p: Post, meId: String?, onOpen: () -> Unit) {
    val c = Pc.colors
    Column(Modifier.width(240.dp).pencilledCard().clickable(onClickLabel = "Open plan", onClick = onOpen).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(p.author, 28.dp)
            Spacer(Modifier.width(8.dp))
            Text(p.author.firstName, style = Pc.type.smallStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, modifier = Modifier.weight(1f), maxLines = 1)
            if (p.audience == "women") Tag("Women only", TagKind.Women, height = 22.dp)
        }
        Text(p.title ?: "Plan", style = Pc.type.title3, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            com.unsolo.app.ui.tribe.PlanRing(p, 68.dp, meId)
            Spacer(Modifier.width(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(Fmt.range(p.startsOn, p.endsOn), style = Pc.type.fact, color = c.ink2)
                p.place?.name?.let { Text(it.substringBefore(','), style = Pc.type.fact, color = c.ink2, maxLines = 1) }
                SeatCaption(p.spotsTotal ?: p.seats.size, p.memberCount, plan = true)
            }
        }
    }
}
