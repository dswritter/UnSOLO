package com.unsolo.app.ui.host

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.data.AppEvent
import com.unsolo.app.data.MoneyFormat
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import kotlinx.coroutines.launch

private fun statusLabel(s: String) = when (s) { "approved" -> "Live"; "rejected" -> "Changes needed"; "archived" -> "Archived"; else -> "In review" }

@Composable
private fun StatusPill(moderation: String, active: Boolean) {
    val c = Pc.colors
    val (label, bg, fg) = when {
        moderation == "rejected" -> Triple("Changes needed", c.red.copy(alpha = 0.12f), c.red)
        moderation != "approved" -> Triple("In review", c.goldBg, c.goldInk)
        !active -> Triple("Hidden", c.tonal, c.ink2)
        else -> Triple("Live", c.green.copy(alpha = 0.14f), c.green)
    }
    Text(label, style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = fg, modifier = Modifier.clip(CircleShape).background(bg).padding(horizontal = 10.dp, vertical = 4.dp))
}

/** Something went wrong loading a host screen: say what, offer to retry, and the web as a fallback. */
@Composable
private fun HostError(r: ApiResult<*>?, onRetry: () -> Unit, nav: AppNav, webPath: String = "/host") {
    val msg = when (r) { is ApiResult.Err -> r.message ?: "Something went wrong."; ApiResult.Offline -> "You're offline."; else -> "Something went wrong." }
    EmptyState("Couldn't load this", "$msg Try again, or open it on unsolo.in.", action = "Try again", onAction = onRetry)
    LinkText("Open on unsolo.in", { nav.openWeb(webPath) }, Modifier.padding(horizontal = Gutter), style = Pc.type.smallStrong)
}

// ======================= Dashboard =======================

/**
 * Hosting home: what needs you, your numbers, your trips (tap to manage), your stays/activities/
 * rentals, next departures, payout and earnings, and plans looking for a host.
 */
@Composable
fun HostDashboardScreen(nav: AppNav) {
    val g = nav.graph
    val c = Pc.colors
    var data by remember { mutableStateOf<HostDashboard?>(null) }
    var last by remember { mutableStateOf<ApiResult<HostDashboard>?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(attempt) {
        if (data == null) data = g.host.cachedDashboard()
        val r = g.host.dashboard(); last = r
        if (r is ApiResult.Ok) data = r.value
    }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Hosting", onBack = { nav.back() }) {
            if (data?.isHost == true) PcButton("New trip", { nav.to(if (data?.payoutConfigured == true) Routes.hostEdit() else Routes.HOST_PAYOUT) }, icon = PcIcons.Plus, height = BtnSmall)
        }
        val d = data
        when {
            d == null && last != null && last !is ApiResult.Ok -> HostError(last, { attempt++ }, nav)
            d == null -> Column(Modifier.padding(Gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) { repeat(4) { Box(Modifier.fillMaxWidth().height(if (it == 0) 90.dp else 120.dp).clip(RoundedCornerShape(18.dp)).background(c.tonal)) } }
            !d.isHost -> Column(Modifier.padding(Gutter)) {
                EmptyState("Host trips on UnSOLO", "Verify your email and phone to become a host, then list trips, stays and activities and take bookings right here.", action = "Become a host") { nav.openWeb("/host/verify") }
                Spacer(Modifier.height(8.dp))
                NavRow("Plans looking for a host", "Offer to run a trip travellers are planning", PcIcons.Briefcase, { nav.to(Routes.HOST_PLANS) })
            }
            else -> PullRefresh({ g.host.dashboard().let { if (it is ApiResult.Ok) data = it.value } }, Modifier.weight(1f)) {
                LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
                    // What needs you
                    items(d.attention, key = { "a" + it.kind + (it.tripId ?: it.listingId ?: "") }) { a ->
                        Row(Modifier.padding(horizontal = Gutter, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp))
                            .background(if (a.kind.contains("rejected")) c.red.copy(alpha = 0.08f) else c.goldBg).clickable {
                                when {
                                    a.kind == "payout" -> nav.to(Routes.HOST_PAYOUT)
                                    a.tripId != null -> nav.to(Routes.hostTrip(a.tripId))
                                    a.listingId != null -> d.services.firstOrNull { it.id == a.listingId }?.webEditPath?.let { nav.openWeb(it) }
                                }
                            }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            PcIcon(if (a.kind == "payout") PcIcons.Wallet else if (a.kind == "requests") PcIcons.Users else PcIcons.Info, null, tint = c.ink, size = 20.dp)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(a.title, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink)
                                a.body?.let { Text(it, style = Pc.type.small, color = c.ink2) }
                            }
                            PcIcon(PcIcons.ChevronRight, null, tint = c.ink3, size = 16.dp)
                        }
                    }
                    item {
                        Row(Modifier.padding(horizontal = Gutter, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Stat("${d.stats.activeTrips}/${d.stats.totalTrips}", "Trips live", Modifier.weight(1f))
                            Stat("${d.stats.pendingRequests}", "Requests", Modifier.weight(1f))
                            Stat(MoneyFormat.rupees(d.stats.totalEarnedPaise), "Earned", Modifier.weight(1f)) { nav.to(Routes.HOST_EARNINGS) }
                        }
                    }
                    if (d.upcoming.isNotEmpty()) {
                        item { SectionHeader("Next departures") }
                        item {
                            LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                items(d.upcoming, key = { it.tripId + it.date }) { u ->
                                    Column(Modifier.width(170.dp).raisedCard().clickable { nav.to(Routes.hostTrip(u.tripId)) }.padding(12.dp)) {
                                        Text(Fmt.dowDayMonth(u.date), style = Pc.type.smallStrong, color = c.ink2)
                                        Text(u.title, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                        Spacer(Modifier.height(8.dp))
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            MiniArc(u.maxGroupSize, u.booked, size = 30.dp); Spacer(Modifier.width(8.dp))
                                            Text("${u.booked} booked", style = Pc.type.small, color = c.ink2)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    item { SectionHeader("Your trips", Modifier.padding(top = 10.dp), trailing = "${d.trips.size}") }
                    if (d.trips.isEmpty()) item {
                        EmptyState("No trips yet", "List your first trip: dates, price, what's included and a few photos. We review it within a day.", action = "Create a trip") {
                            nav.to(if (d.payoutConfigured) Routes.hostEdit() else Routes.HOST_PAYOUT)
                        }
                    }
                    items(d.trips, key = { "t" + it.id }) { t -> HostTripCard(t) { nav.to(Routes.hostTrip(t.id)) } }
                    if (d.services.isNotEmpty()) {
                        item { SectionHeader("Stays, activities and rentals", Modifier.padding(top = 10.dp), trailing = "${d.services.size}") }
                        items(d.services, key = { "s" + it.id }) { s ->
                            var on by remember(s.id, s.isActive) { mutableStateOf(s.isActive) }
                            Row(Modifier.padding(horizontal = Gutter, vertical = 5.dp).fillMaxWidth().raisedCard().clickable { s.webEditPath?.let { nav.openWeb(it) } }.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically) {
                                ProgressiveImage(s.image, Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)), s.title)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(s.title, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text("${s.type.replaceFirstChar { it.uppercase() }} · ${s.itemCount} item${if (s.itemCount == 1) "" else "s"} · ${s.bookingCount} bookings", style = Pc.type.small, color = c.ink2)
                                    Spacer(Modifier.height(4.dp)); StatusPill(s.status, on)
                                }
                                if (s.status == "approved") PcSwitch(on, { v -> on = v; scope.launch { if (g.host.setServiceActive(s.id, v) !is ApiResult.Ok) { on = !v; g.events.emit(AppEvent.Message("Couldn't change that.")) } } },
                                    contentDescription = "Show ${s.title}")
                            }
                        }
                        item { Text("Editing stays, activities and rentals opens unsolo.in for now.", style = Pc.type.small, color = c.ink3, modifier = Modifier.padding(horizontal = Gutter, vertical = 4.dp)) }
                    }
                    item {
                        Column(Modifier.padding(top = 14.dp)) {
                            NavRow("Payout details", if (d.payoutConfigured) "Where we send your earnings" else "Add UPI or a bank account to create trips", PcIcons.Wallet, { nav.to(Routes.HOST_PAYOUT) })
                            NavRow("Earnings", "${MoneyFormat.rupees(d.stats.pendingPayoutPaise)} waiting to be paid", PcIcons.ChartBar, { nav.to(Routes.HOST_EARNINGS) })
                            NavRow("Plans looking for a host", "Offer to run a trip travellers are planning", PcIcons.Briefcase, { nav.to(Routes.HOST_PLANS) })
                            NavRow("New stay, activity or rental", "Opens unsolo.in", PcIcons.Bed, { nav.openWeb("/host") })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier, onClick: (() -> Unit)? = null) {
    val c = Pc.colors
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(c.raised).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(vertical = 14.dp, horizontal = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = Pc.type.num.copy(fontSize = 18.sp), color = c.ink, maxLines = 1)
        Text(label, style = Pc.type.label, color = c.ink2)
    }
}

@Composable
private fun HostTripCard(t: HostTripSummary, onClick: () -> Unit) {
    val c = Pc.colors
    Row(Modifier.padding(horizontal = Gutter, vertical = 5.dp).fillMaxWidth().raisedCard().clickable(onClick = onClick).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
        ProgressiveImage(t.image, Modifier.size(width = 96.dp, height = 54.dp).clip(RoundedCornerShape(12.dp)), t.title)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(t.title, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(t.nextDeparture?.let { "Next ${Fmt.dayMonth(it)}" } ?: "No upcoming dates", "${t.bookingCount} booked", MoneyFormat.rupees(t.priceFromPaise)).joinToString(" · "),
                style = Pc.type.small, color = c.ink2, maxLines = 1)
            Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                StatusPill(t.moderationStatus, t.isActive)
                if (t.bookingsPaused) Text("Bookings paused", style = Pc.type.label, color = c.ink2)
                if (t.pendingRequests > 0) Text("${t.pendingRequests} request${if (t.pendingRequests == 1) "" else "s"}", style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = c.accentInk)
            }
        }
        PcIcon(PcIcons.ChevronRight, null, tint = c.ink3, size = 16.dp)
    }
}

// ======================= One trip =======================

/**
 * Manage a trip: switches (visible, bookings paused), each date (mark full, booking cut-off),
 * join requests to approve or decline, who's booked (with their numbers), who's interested.
 */
@Composable
fun HostTripScreen(nav: AppNav, id: String) {
    val g = nav.graph
    val c = Pc.colors
    val scope = rememberCoroutineScope()
    val tick = rememberTick()
    var data by remember { mutableStateOf<HostTripDetail?>(null) }
    var last by remember { mutableStateOf<ApiResult<HostTripDetail>?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    var tab by rememberSaveable { mutableStateOf("requests") }
    var declining by remember { mutableStateOf<JoinRequest?>(null) }
    var cutoffFor by remember { mutableStateOf<HostDeparture?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf<String?>(null) }
    suspend fun reload() { val r = g.host.trip(id); last = r; if (r is ApiResult.Ok) data = r.value }
    LaunchedEffect(attempt) { if (data == null) data = g.host.cachedTrip(id); reload() }
    fun patch(p: HostTripPatch, what: String) {
        busy = what
        scope.launch {
            when (val r = g.host.patch(id, p)) {
                is ApiResult.Ok -> { tick(); data = data?.copy(trip = r.value) }
                is ApiResult.Err -> g.events.emit(AppEvent.Message(r.message ?: "Couldn't change that."))
                ApiResult.Offline -> g.events.emit(AppEvent.Message("You're offline."))
            }
            busy = null
        }
    }
    fun decide(r: JoinRequest, approve: Boolean, reason: String? = null) {
        busy = r.id
        scope.launch {
            when (val res = g.host.decide(r.id, approve, reason)) {
                is ApiResult.Ok -> {
                    tick()
                    g.events.emit(AppEvent.Message(if (approve) "${r.user.name.substringBefore(' ')} is in. They have 48 hours to pay." else "Request declined"))
                    reload()
                }
                is ApiResult.Err -> g.events.emit(AppEvent.Message(res.message ?: "Couldn't do that."))
                ApiResult.Offline -> g.events.emit(AppEvent.Message("You're offline."))
            }
            busy = null
        }
    }
    declining?.let { r ->
        var reason by remember { mutableStateOf("") }
        PcSheet({ declining = null }) {
            SheetTitle("Decline ${r.user.name.substringBefore(' ')}?", "They'll get a notification and an email. A short reason helps (optional).")
            BoxedInput(reason, { reason = it.take(300) }, "e.g. This departure is for women only", Modifier.padding(horizontal = Gutter).fillMaxWidth(), singleLine = false, minLines = 2)
            Row(Modifier.padding(Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PcButton("Keep", { declining = null }, Modifier.weight(1f), kind = BtnKind.Outline)
                PcButton("Decline", { declining = null; decide(r, false, reason.trim().ifBlank { null }) }, Modifier.weight(1f), kind = BtnKind.Danger)
            }
        }
    }
    cutoffFor?.let { dep ->
        val options = listOf(0, 1, 2, 3, 7).map { n -> n to Fmt.date(dep.date)?.minusDays(n.toLong())?.toString() }
        PcSheet({ cutoffFor = null }) {
            SheetTitle("Stop bookings for ${Fmt.dowDayMonth(dep.date)}", "Bookings close at the end of the day you pick.")
            Column(Modifier.padding(horizontal = Gutter, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                options.forEach { (n, d) -> if (d != null) PcButton(if (n == 0) "On the day" else "$n day${if (n == 1) "" else "s"} before (${Fmt.dayMonth(d)})",
                    { cutoffFor = null; patch(HostTripPatch(cutoff = HostCutoff(dep.date, d)), "cut" + dep.date) }, Modifier.fillMaxWidth(), kind = if (dep.cutoff == d) BtnKind.Primary else BtnKind.Outline) }
                if (dep.cutoff != null) PcButton("No cut-off", { cutoffFor = null; patch(HostTripPatch(cutoff = HostCutoff(dep.date, null)), "cut" + dep.date) }, Modifier.fillMaxWidth(), kind = BtnKind.Line)
            }
            Spacer(Modifier.height(10.dp))
        }
    }
    if (confirmDelete) PcSheet({ confirmDelete = false }) {
        SheetTitle("Delete this trip?", "If it has bookings it's archived (kept for records, hidden everywhere). You can't delete while a departure is running or has active bookings.")
        Row(Modifier.padding(Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PcButton("Keep", { confirmDelete = false }, Modifier.weight(1f), kind = BtnKind.Outline)
            PcButton("Delete", {
                scope.launch {
                    when (val r = g.host.delete(id)) {
                        is ApiResult.Ok -> { g.events.emit(AppEvent.Message(if (r.value.archived) "Trip archived" else "Trip deleted")); g.host.dashboard(); nav.back() }
                        is ApiResult.Err -> { confirmDelete = false; g.events.emit(AppEvent.Message(r.message ?: "Couldn't delete it.")) }
                        ApiResult.Offline -> g.events.emit(AppEvent.Message("You're offline."))
                    }
                }
            }, Modifier.weight(1f), kind = BtnKind.Danger)
        }
    }

    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar(data?.trip?.title ?: "Trip", onBack = { nav.back() }, headerActions = false) {
            IconTap(PcIcons.Edit, "Edit trip", { nav.to(Routes.hostEdit(id)) })
            IconTap(PcIcons.Trash, "Delete trip", { confirmDelete = true })
        }
        val d = data
        if (d == null) { if (last != null && last !is ApiResult.Ok) HostError(last, { attempt++ }, nav, "/host/$id") else Text("Loading…", style = Pc.type.body, color = c.ink2, modifier = Modifier.padding(Gutter)); return }
        val t = d.trip
        PullRefresh({ reload() }, Modifier.weight(1f)) {
            LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
                item {
                    Row(Modifier.padding(horizontal = Gutter, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        ProgressiveImage(t.image, Modifier.size(width = 112.dp, height = 63.dp).clip(RoundedCornerShape(12.dp)), t.title)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            StatusPill(t.moderationStatus, t.isActive)
                            Text("${MoneyFormat.rupees(t.priceFromPaise)}/person · ${Fmt.nights(t.durationDays)} · up to ${t.maxGroupSize}", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(top = 4.dp))
                            LinkText("See the trip page", { nav.to(Routes.trip(t.slug)) }, style = Pc.type.smallStrong)
                        }
                    }
                    if (t.moderationStatus == "rejected") Text("The team asked for changes. Edit the trip and save to send it for review again.", style = Pc.type.small, color = c.red,
                        modifier = Modifier.padding(horizontal = Gutter, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.red.copy(alpha = 0.08f)).padding(12.dp))
                    else if (t.moderationStatus == "pending") Text("In review. We'll let you know within a day; you can keep editing meanwhile.", style = Pc.type.small, color = c.goldInk,
                        modifier = Modifier.padding(horizontal = Gutter, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.goldBg).padding(12.dp))
                    SwitchRow("Show on UnSOLO", if (t.moderationStatus == "approved") "Off hides it from Explore and search" else "Available once it's approved", t.isActive,
                        { v -> if (t.moderationStatus == "approved") patch(HostTripPatch(isActive = v), "active") })
                    SwitchRow("Pause new bookings", "The trip stays visible; checkout is closed", t.bookingsPaused, { v -> patch(HostTripPatch(bookingsPaused = v), "paused") })
                }
                item { SectionHeader("Dates", Modifier.padding(top = 8.dp), trailing = "${t.departures.size} upcoming") }
                if (t.departures.isEmpty()) item { Text("No upcoming dates. Edit the trip to add some.", style = Pc.type.body, color = c.ink2, modifier = Modifier.padding(horizontal = Gutter)) }
                items(t.departures, key = { "d" + it.date }) { dep ->
                    Row(Modifier.padding(horizontal = Gutter, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.raised).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        MiniArc(t.maxGroupSize, dep.booked, size = 34.dp, past = dep.closed); Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text("${Fmt.dowDayMonth(dep.date)}${dep.returnDate?.let { " – ${Fmt.dayMonth(it)}" } ?: ""}", style = Pc.type.bodyStrong, color = c.ink)
                            Text(listOfNotNull("${dep.booked} booked", if (dep.closed) "marked full" else null, dep.cutoff?.let { "bookings close ${Fmt.dayMonth(it)}" }).joinToString(" · "), style = Pc.type.small, color = c.ink2)
                        }
                        PcButton(if (dep.closed) "Reopen" else "Mark full", { patch(HostTripPatch(closeDate = HostCloseDate(dep.date, !dep.closed)), "close" + dep.date) },
                            kind = BtnKind.Outline, height = BtnSmall, loading = busy == "close" + dep.date)
                        IconTap(PcIcons.Clock, "Booking cut-off", { cutoffFor = dep })
                    }
                }
                item {
                    Spacer(Modifier.height(10.dp))
                    Segmented(listOf("requests" to "Requests · ${d.requests.pending.size}", "booked" to "Booked · ${d.roster.count { it.status != "cancelled" }}", "interested" to "Interested · ${d.interested.size}"), tab, { tab = it },
                        Modifier.padding(horizontal = Gutter))
                    Spacer(Modifier.height(6.dp))
                }
                when (tab) {
                    "requests" -> {
                        if (d.requests.pending.isEmpty()) item { Text("No requests waiting.", style = Pc.type.body, color = c.ink2, modifier = Modifier.padding(Gutter)) }
                        items(d.requests.pending, key = { "p" + it.id }) { r -> RequestCard(r, nav, busy == r.id, onApprove = { decide(r, true) }, onDecline = { declining = r }) }
                        if (d.requests.processed.isNotEmpty()) {
                            item { SectionHeader("Earlier", Modifier.padding(top = 8.dp)) }
                            items(d.requests.processed, key = { "x" + it.id }) { r -> RequestCard(r, nav, false, null, null) }
                        }
                    }
                    "booked" -> {
                        if (d.roster.isEmpty()) item { Text("No bookings yet.", style = Pc.type.body, color = c.ink2, modifier = Modifier.padding(Gutter)) }
                        items(d.roster, key = { "b" + it.id }) { b -> RosterRow(b, nav) }
                        if (d.pendingClaims > 0) item { NavRow("${d.pendingClaims} companion claim${if (d.pendingClaims == 1) "" else "s"} to review", "Opens unsolo.in", PcIcons.Users, { nav.openWeb("/host/$id") }) }
                        item { NavRow("Cancellations and changes", "Partial cancellations and traveller changes open unsolo.in", PcIcons.Briefcase, { nav.openWeb("/host/$id") }) }
                    }
                    else -> {
                        if (d.interested.isEmpty()) item { Text("No one has saved this yet.", style = Pc.type.body, color = c.ink2, modifier = Modifier.padding(Gutter)) }
                        items(d.interested, key = { "i" + it.id }) { u ->
                            Row(Modifier.fillMaxWidth().clickable { if (u.username.isNotBlank()) nav.to(Routes.profile(u.username)) }.padding(horizontal = Gutter, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Avatar(u, 36.dp); Spacer(Modifier.width(10.dp)); Text(u.name, style = Pc.type.body, color = c.ink)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RequestCard(r: JoinRequest, nav: AppNav, busy: Boolean, onApprove: (() -> Unit)?, onDecline: (() -> Unit)?) {
    val c = Pc.colors
    val u = r.user
    Column(Modifier.padding(horizontal = Gutter, vertical = 5.dp).fillMaxWidth().raisedCard().padding(14.dp)) {
        Row(Modifier.clickable { if (u.username.isNotBlank()) nav.to(Routes.profile(u.username)) }, verticalAlignment = Alignment.CenterVertically) {
            Avatar(u.lite(), 44.dp); Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(u.name, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (u.isIdVerified) { Spacer(Modifier.width(4.dp)); VerifiedMark() }
                }
                Text(listOfNotNull(u.age?.let { "$it" }, u.location, "${u.tripsCompleted} trips", "${u.score} pts").joinToString(" · "), style = Pc.type.small, color = c.ink2, maxLines = 1)
            }
            if (onApprove == null) Text(when (r.status) { "approved" -> "Approved"; "rejected" -> "Declined"; "withdrawn" -> "Withdrew"; else -> r.status }, style = Pc.type.label.copy(fontWeight = FontWeight.Bold),
                color = if (r.status == "approved") c.green else c.ink3)
        }
        r.message?.takeIf { it.isNotBlank() }?.let { Text("“$it”", style = Pc.type.body, color = c.ink, modifier = Modifier.padding(top = 10.dp)) }
        u.bio?.takeIf { it.isNotBlank() && onApprove != null }?.let { Text(it, style = Pc.type.small, color = c.ink2, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp)) }
        r.hostResponse?.takeIf { onApprove == null && it.isNotBlank() }?.let { Text("You said: $it", style = Pc.type.small, color = c.ink3, modifier = Modifier.padding(top = 6.dp)) }
        if (r.status == "approved") r.paymentDeadline?.let { dl ->
            val due = runCatching { java.time.Instant.parse(dl).atZone(java.time.ZoneId.of("Asia/Kolkata")).format(java.time.format.DateTimeFormatter.ofPattern("d MMM, h:mm a")) }.getOrNull()
            if (due != null) Text("Has until $due to pay", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(top = 4.dp))
        }
        if (onApprove != null && onDecline != null) Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PcButton("Decline", onDecline, Modifier.weight(1f), kind = BtnKind.Outline, height = BtnSmall)
            PcButton("Approve", onApprove, Modifier.weight(1f), kind = BtnKind.Accent, height = BtnSmall, loading = busy)
        }
    }
}

@Composable
private fun RosterRow(b: RosterBooking, nav: AppNav) {
    val c = Pc.colors
    Column(Modifier.padding(horizontal = Gutter, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.raised).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(b.lead.lite(), 36.dp); Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(b.lead.name, style = Pc.type.bodyStrong, color = c.ink)
                Text(listOfNotNull(Fmt.dayMonth(b.travelDate), "${b.guests} traveller${if (b.guests == 1) "" else "s"}", b.confirmationCode, b.coupon?.let { "code $it" }).joinToString(" · "), style = Pc.type.small, color = c.ink2, maxLines = 1)
            }
            if (b.status == "cancelled") Text("Cancelled", style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = c.red)
            else b.lead.phone?.let { p -> IconTap(PcIcons.Phone, "Call ${b.lead.name}", { nav.openUrl("tel:$p") }) }
        }
        if (b.travellers.size > 1) Text(b.travellers.joinToString(", ") { t -> listOfNotNull(t.name, t.age?.toString()).joinToString(" ") }, style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(top = 6.dp))
    }
}

// ======================= Payout =======================

/** Where your earnings go: UPI or a bank account (account number confirmed twice). */
@Composable
fun PayoutScreen(nav: AppNav) {
    val g = nav.graph
    val c = Pc.colors
    val scope = rememberCoroutineScope()
    var cur by remember { mutableStateOf<HostPayout?>(null) }
    var method by rememberSaveable { mutableStateOf("upi") }
    var upi by rememberSaveable { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf("") }
    var acct by rememberSaveable { mutableStateOf("") }
    var acct2 by rememberSaveable { mutableStateOf("") }
    var ifsc by rememberSaveable { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        (g.host.payout() as? ApiResult.Ok)?.value?.let { p ->
            cur = p; method = p.method ?: "upi"; upi = p.upiId.orEmpty(); name = p.bankAccountName.orEmpty(); ifsc = p.bankIfsc.orEmpty()
        }
    }
    val upiOk = Regex("^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$").matches(upi.trim())
    val keepAcct = acct.isBlank() && cur?.bankAccountNumberMasked != null
    val acctOk = keepAcct || (Regex("^[0-9]{9,18}$").matches(acct.replace(" ", "")) && acct == acct2)
    val ifscOk = Regex("^[A-Z]{4}0[A-Z0-9]{6}$").matches(ifsc.trim().uppercase())
    val ready = if (method == "upi") upiOk else name.trim().length >= 2 && acctOk && ifscOk
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Payout details", onBack = { nav.back() }, headerActions = false)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).imePadding().padding(Gutter), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("We send your share after each trip. Needed before you create a trip.", style = Pc.type.body, color = c.ink2)
            Segmented(listOf("upi" to "UPI", "bank" to "Bank account"), method, { method = it })
            if (method == "upi") {
                BoxedInput(upi, { upi = it.trim().take(120) }, "yourname@okbank", Modifier.fillMaxWidth())
                if (upi.isNotBlank() && !upiOk) Text("That doesn't look like a UPI ID (name@bank).", style = Pc.type.small, color = c.red)
            } else {
                BoxedInput(name, { name = it.take(80) }, "Account holder's name", Modifier.fillMaxWidth())
                BoxedInput(acct, { acct = it.filter(Char::isDigit).take(18) }, cur?.bankAccountNumberMasked?.let { "Account number (saved: $it)" } ?: "Account number", Modifier.fillMaxWidth(), keyboardType = KeyboardType.Number)
                if (acct.isNotBlank()) BoxedInput(acct2, { acct2 = it.filter(Char::isDigit).take(18) }, "Type it again", Modifier.fillMaxWidth(), keyboardType = KeyboardType.Number)
                if (acct.isNotBlank() && acct2.isNotBlank() && acct != acct2) Text("The two account numbers don't match.", style = Pc.type.small, color = c.red)
                BoxedInput(ifsc, { ifsc = it.uppercase().filter { ch -> ch.isLetterOrDigit() }.take(11) }, "IFSC (e.g. HDFC0001234)", Modifier.fillMaxWidth())
                if (ifsc.length == 11 && !ifscOk) Text("IFSC is 4 letters, 0, then 6 letters or numbers.", style = Pc.type.small, color = c.red)
            }
            error?.let { Text(it, style = Pc.type.small, color = c.red) }
            PcButton("Save", {
                saving = true; error = null
                scope.launch {
                    val u = if (method == "upi") HostPayoutUpdate("upi", upiId = upi.trim().lowercase())
                        else HostPayoutUpdate("bank", bankAccountName = name.trim(), bankAccountNumber = acct.replace(" ", "").ifBlank { null }, bankIfsc = ifsc.trim().uppercase())
                    when (val r = g.host.savePayout(u)) {
                        is ApiResult.Ok -> { g.events.emit(AppEvent.Message("Payout details saved")); g.host.dashboard(); nav.back() }
                        is ApiResult.Err -> error = r.message ?: "Couldn't save."
                        ApiResult.Offline -> error = "You're offline."
                    }
                    saving = false
                }
            }, Modifier.fillMaxWidth(), kind = BtnKind.Accent, enabled = ready, loading = saving)
        }
    }
}

// ======================= Earnings =======================

/** What you've earned per booking, what's been paid and what's waiting. */
@Composable
fun EarningsScreen(nav: AppNav) {
    val g = nav.graph
    val c = Pc.colors
    var data by remember { mutableStateOf<HostEarnings?>(null) }
    var last by remember { mutableStateOf<ApiResult<HostEarnings>?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    LaunchedEffect(attempt) { val r = g.host.earnings(); last = r; if (r is ApiResult.Ok) data = r.value }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Earnings", onBack = { nav.back() }, headerActions = false)
        val d = data
        when {
            d == null && last != null -> HostError(last, { attempt++ }, nav)
            d == null -> Text("Loading…", style = Pc.type.body, color = c.ink2, modifier = Modifier.padding(Gutter))
            else -> LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
                item {
                    Row(Modifier.padding(Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Stat(MoneyFormat.rupees(d.totals.earnedPaise), "Earned", Modifier.weight(1f))
                        Stat(MoneyFormat.rupees(d.totals.pendingPaise), "Waiting", Modifier.weight(1f))
                        Stat(MoneyFormat.rupees(d.totals.paidPaise), "Paid", Modifier.weight(1f))
                    }
                }
                if (d.items.isEmpty()) item { EmptyState("No earnings yet", "When travellers pay for your trips, your share shows here.") }
                items(d.items, key = { it.bookingId }) { e ->
                    Row(Modifier.padding(horizontal = Gutter, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.raised).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(e.tripTitle, style = Pc.type.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(listOfNotNull(e.travelDate?.let { Fmt.dayMonth(it) }, "paid ${MoneyFormat.rupees(e.totalPaise)}", "fee ${MoneyFormat.rupees(e.platformFeePaise)}").joinToString(" · "), style = Pc.type.small, color = c.ink2)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(MoneyFormat.rupees(e.hostPaise), style = Pc.type.price, color = c.ink)
                            Text(when (e.payoutStatus) { "completed", "processed" -> "Paid" + (e.payoutDate?.let { " ${Fmt.dayMonth(it)}" } ?: ""); "failed", "reversed" -> "Payout failed"; "cancelled" -> "Cancelled"; else -> "Waiting" },
                                style = Pc.type.label, color = if (e.payoutStatus in setOf("completed", "processed")) c.green else c.ink2)
                        }
                    }
                }
            }
        }
    }
}
