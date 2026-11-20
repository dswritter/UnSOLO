package com.unsolo.app.ui.host

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.unsolo.app.AppGraph
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.userMessage
import com.unsolo.app.data.MoneyFormat
import com.unsolo.app.data.PostItem
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens
import com.unsolo.app.ui.tribe.CommunityPlanLine
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class HostViewModel(private val g: AppGraph) : ViewModel() {
    /** No dedicated "looking for a host" endpoint in api-v1: open plans from GET /feed?kind=plan (see Contract gaps). */
    val plans = g.tribe.observeFeed(PostKind.PLAN).map { s -> s.items.filterIsInstance<PostItem>().map { it.post }.filter { !it.viewer.isAuthor && it.status == "live" } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val me = g.account.me
    init { viewModelScope.launch { g.tribe.refreshFeed(PostKind.PLAN) } }
}

@Composable
fun HostScreen(nav: AppNav) {
    val vm: HostViewModel = viewModel { HostViewModel(nav.graph) }
    val plans by vm.plans.collectAsStateWithLifecycle()
    val me by vm.me.collectAsStateWithLifecycle()
    val isHost = me?.user?.isHost == true
    val c = Pc.colors
    LazyColumn(Modifier.fillMaxSize().background(c.paper)) {
        item(key = "h") {
            Column(Modifier.statusBarsPadding()) {
                Row(Modifier.fillMaxWidth().height(64.dp).padding(start = 4.dp, end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconTap(PcIcons.Back, "Back", { nav.back() })
                    Text("Hosting", style = Pc.type.display, color = c.ink, modifier = Modifier.weight(1f))
                    PcButton("New trip", { nav.openWeb("/host") }, icon = PcIcons.Plus, height = BtnSmall)
                }
            }
            InsetRule()
            NavRow("Departures, bookings and payouts", "Managed on unsolo.in for now", PcIcons.Briefcase, { nav.openWeb("/host") })
            InsetRule()
            if (!isHost) Text("Hosts make offers as people, with the HOST tag. Become a host on unsolo.in to send offers.", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(Gutter))
            SectionHeader("Plans looking for a host", Modifier.padding(top = 8.dp), trailing = "${plans.size} open")
        }
        if (plans.isEmpty()) item { EmptyState("No open plans right now", "When travellers plan trips together, they show up here.") }
        items(plans, key = { it.id }) { p ->
            Column(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().pencilledCard().clickable { nav.to(Routes.post(p.id)) }.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PcIcon(PcIcons.Pin, null, size = 16.dp)
                    Spacer(Modifier.width(4.dp))
                    Text("${p.reactions.wantToGo} want to go", style = Pc.type.smallStrong, color = c.ink)
                }
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.title ?: "Plan", style = Pc.type.title3, color = c.ink, modifier = Modifier.weight(1f))
                    Text(Fmt.range(p.startsOn, p.endsOn), style = Pc.type.num.copy(fontSize = 13.sp), color = c.ink)
                }
                Text("${p.place?.name.orEmpty()} · ${p.memberCount} of ${p.spotsTotal ?: p.seats.size} in · organiser ${p.author.firstName}", style = Pc.type.small, color = c.ink2)
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    FaceStack(p.seats.mapNotNull { it.user }.take(4))
                    Spacer(Modifier.weight(1f))
                    PcButton("Offer to host", { if (nav.requirePhone()) nav.to(Routes.offerForm(p.id)) }, kind = BtnKind.Outline, height = BtnSmall, enabled = isHost)
                }
            }
        }
        item { Text("Only the organiser and members see offers. If they accept, every member gets a held seat and 48h to pay.", style = Pc.type.small, color = c.ink2, modifier = Modifier.navigationBarsPadding().padding(16.dp)) }
    }
}

// ---------------- Offer form ----------------

class OfferFormViewModel(private val g: AppGraph, val postId: String) : ViewModel() {
    val post = g.tribe.observePost(postId).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    var price by mutableStateOf("")
    val includes = mutableStateListOf("Transport", "Stay")
    var custom by mutableStateOf("")
    var extraOn by mutableStateOf(false)
    var extraSeats by mutableIntStateOf(2)
    var notes by mutableStateOf("")
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    init { viewModelScope.launch { g.tribe.refreshPost(postId) } }

    fun send(done: () -> Unit) {
        val rupees = price.filter(Char::isDigit).toLongOrNull() ?: return
        busy = true; error = null
        viewModelScope.launch {
            when (val r = g.tribe.makeOffer(postId, OfferRequest(rupees * 100, includes.toList(), notes.trim().ifBlank { null }, if (extraOn) extraSeats else 0))) {
                is ApiResult.Ok -> { g.events.emit(com.unsolo.app.data.AppEvent.Message("Offer sent. The group has 7 days to decide.")); done() }
                is ApiResult.Err -> error = r.userMessage()
                ApiResult.Offline -> error = "You're offline. Offers are sent live, try again when connected."
            }
            busy = false
        }
    }
}

private val IncludeOptions = listOf("Transport", "Stay", "Meals", "Guide", "Permits", "Activities", "Insurance")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OfferFormScreen(postId: String, nav: AppNav) {
    val vm: OfferFormViewModel = viewModel(key = "offer-$postId") { OfferFormViewModel(nav.graph, postId) }
    val item by vm.post.collectAsStateWithLifecycle()
    val p = item?.post
    val c = Pc.colors
    Column(Modifier.fillMaxSize().background(c.paper)) {
        ComposerTopBar("Offer to host") { nav.back() }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            if (p != null) Column(Modifier.padding(Gutter).fillMaxWidth().pencilledCard().padding(12.dp)) {
                CommunityPlanLine()
                Spacer(Modifier.height(4.dp))
                Row {
                    Text(p.title ?: "Plan", style = Pc.type.title3, color = c.ink, modifier = Modifier.weight(1f))
                    Text(Fmt.range(p.startsOn, p.endsOn), style = Pc.type.num.copy(fontSize = 13.sp), color = c.ink)
                }
                Text("Group of ${p.spotsTotal ?: p.seats.size} · ${p.memberCount} in · ${p.estCostText ?: "no estimate"}", style = Pc.type.small, color = c.ink2)
            }
            FieldRow("Your price per person (₹)", vm.price, { vm.price = it.filter(Char::isDigit).take(7) }, placeholder = "5499", keyboardType = KeyboardType.Number,
                style = Pc.type.numLarge, helper = "Paid through UnSOLO, under your cancellation policy.")
            InsetRule()
            Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
                Text("Included", style = Pc.type.small, color = c.ink2)
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    (IncludeOptions + vm.includes.filter { it !in IncludeOptions }).forEach { o ->
                        PcChip(o, o in vm.includes, { if (o in vm.includes) vm.includes.remove(o) else vm.includes.add(o) }, solidSelected = false,
                            icon = if (o in vm.includes) PcIcons.Check else PcIcons.Plus)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BoxedInput(vm.custom, { vm.custom = it.take(40) }, "Add your own, e.g. 2 nights, Kalga homestay", Modifier.weight(1f))
                    IconTap(PcIcons.Plus, "Add", { if (vm.custom.isNotBlank()) { vm.includes.add(vm.custom.trim()); vm.custom = "" } })
                }
            }
            InsetRule()
            SwitchRow("Open more seats to others", "The group can say no to this", vm.extraOn, { vm.extraOn = it })
            if (vm.extraOn) Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Extra seats", style = Pc.type.body, color = c.ink, modifier = Modifier.weight(1f))
                Stepper(vm.extraSeats, { vm.extraSeats = it }, 1, 12)
            }
            InsetRule()
            FieldRow("Note to the group", vm.notes, { vm.notes = it }, placeholder = "We've run Kalga 14 times…", singleLine = false, maxLength = 600)
            vm.error?.let { Text(it, style = Pc.type.smallStrong, color = c.red, modifier = Modifier.padding(Gutter)) }
        }
        BottomActionBar("Seen by the ${p?.memberCount ?: 0} members only", "Not shown in the public feed", "Send offer", { vm.send { nav.back() } },
            enabled = !vm.busy && vm.price.isNotBlank() && vm.includes.isNotEmpty())
    }
}

// ---------------- Organiser: review offers ----------------

class OffersViewModel(private val g: AppGraph, val postId: String) : ViewModel() {
    val post = g.tribe.observePost(postId).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    val offers = g.tribe.observeOffers(postId).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    var accepted by mutableStateOf<AcceptOfferResponse?>(null)
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    init { viewModelScope.launch { g.tribe.refreshPost(postId) } }

    fun accept(offer: HostOffer) { busy = true; error = null; viewModelScope.launch {
        when (val r = g.tribe.acceptOffer(offer.id, offer.pricePaise)) {
            is ApiResult.Ok -> { accepted = r.value; g.tribe.refreshPost(postId) }
            is ApiResult.Err -> if (r.status == 409) { error = r.message ?: "The host changed this offer; review the new price."; g.tribe.refreshPost(postId) } else error = r.userMessage()
            ApiResult.Offline -> error = "You're offline."
        }
        busy = false
    } }

    fun decline(id: String) { busy = true; viewModelScope.launch {
        when (val r = g.tribe.declineOffer(id)) { is ApiResult.Ok -> g.tribe.refreshPost(postId); is ApiResult.Err -> error = r.userMessage(); ApiResult.Offline -> error = "You're offline." }
        busy = false
    } }
}

@Composable
fun OffersReviewScreen(postId: String, nav: AppNav) {
    val vm: OffersViewModel = viewModel(key = "offers-$postId") { OffersViewModel(nav.graph, postId) }
    val item by vm.post.collectAsStateWithLifecycle()
    val offers by vm.offers.collectAsStateWithLifecycle()
    var index by remember { mutableIntStateOf(0) }
    val c = Pc.colors
    val p = item?.post
    val o = offers.getOrNull(index.coerceIn(0, (offers.size - 1).coerceAtLeast(0)))
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar(null, onBack = { nav.back() }) {
            if (offers.size > 1) {
                IconTap(PcIcons.Back, "Previous offer", { if (index > 0) index-- }, tint = if (index > 0) c.ink else c.ink3)
                Text("Offer ${index + 1} of ${offers.size}", style = Pc.type.code, color = c.ink2)
                IconTap(PcIcons.ChevronRight, "Next offer", { if (index < offers.size - 1) index++ }, tint = if (index < offers.size - 1) c.ink else c.ink3)
            }
        }
        if (o == null || p == null) { EmptyState("No offers yet", "Hosts can offer to run your plan as a booked trip."); return@Column }
        val accepted = vm.accepted
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            Column(Modifier.padding(Gutter)) {
                Text("Run ${p.title ?: "this plan"} as a hosted trip?", style = Pc.type.title1, color = c.ink)
                Text("Your group of ${p.spotsTotal ?: p.seats.size} stays together. Expires ${Fmt.dayMonth(o.expiresAt)}.", style = Pc.type.small, color = c.ink2)
            }
            Column(Modifier.padding(horizontal = Gutter).fillMaxWidth().raisedCard()) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(o.host, 48.dp, square = true)
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) { Text(o.host.name, style = Pc.type.bodyStrong, color = c.ink); Spacer(Modifier.width(6.dp)); Tag("Host", TagKind.Host) }
                        Text(o.state.replaceFirstChar { it.uppercase() }, style = Pc.type.small, color = c.ink2)
                    }
                }
                ChartCells(listOf("When" to Fmt.range(p.startsOn, p.endsOn), "Price" to MoneyFormat.rupees(o.pricePaise), "Your estimate" to (p.estCostText?.let { Regex("₹[\\d,]+").find(it)?.value } ?: "—")), monoValues = setOf(0, 1, 2))
                o.includes.forEach { inc ->
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(inc, style = Pc.type.body, color = c.ink, modifier = Modifier.weight(1f)); PcIcon(PcIcons.Check, null, size = 18.dp)
                    }
                    Hairline(Modifier.padding(horizontal = 12.dp))
                }
                o.notes?.let { Text("“$it”", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(12.dp)) }
                if (o.extraSeats > 0) Text("Opens ${o.extraSeats} more seats to other travellers", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
            }
            SectionHeader("If you accept", Modifier.padding(top = 12.dp))
            listOf(
                "Each of the ${p.memberCount} members gets a held seat and 48h to pay through UnSOLO",
                "Your plan chat becomes the trip chat. ${o.host.name} joins as host",
                "Unpaid seats are released. Refunds follow the host's policy",
            ).forEachIndexed { i, s ->
                Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) { Text("${i + 1}", style = Pc.type.num, color = c.ink, modifier = Modifier.width(28.dp)); Text(s, style = Pc.type.body, color = c.ink) }
                InsetRule()
            }
            if (accepted != null) Column(Modifier.padding(Gutter).fillMaxWidth().clip(RoundedCornerShape(RadiusField)).background(c.tonal).padding(14.dp)) {
                Text("Accepted. Seats are held.", style = Pc.type.bodyStrong, color = c.ink)
                Text("Everyone pays on unsolo.in by ${Fmt.dowDayMonth(accepted.payBy)}.", style = Pc.type.small, color = c.ink2)
                accepted.packageSlug?.let { slug -> Spacer(Modifier.height(8.dp)); PcButton("Open the trip page", { nav.openWeb("/packages/$slug?book=1") }, Modifier.fillMaxWidth()) }
            }
            vm.error?.let { Text(it, style = Pc.type.smallStrong, color = c.red, modifier = Modifier.padding(Gutter)) }
        }
        if (p.viewer.isAuthor && o.state == "pending" && accepted == null) Column(Modifier.fillMaxWidth().background(c.raised).navigationBarsPadding()) {
            Spacer(Modifier.height(4.dp))
            Row(Modifier.padding(Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PcButton("Ask the group", { nav.to(Routes.INBOX) }, Modifier.weight(1f), kind = BtnKind.Outline)
                PcButton("Accept offer", { vm.accept(o) }, Modifier.weight(1f), enabled = !vm.busy)
            }
            PcButton("Decline this offer…", { vm.decline(o.id) }, Modifier.fillMaxWidth(), kind = BtnKind.Danger, enabled = !vm.busy)
        }
    }
}
