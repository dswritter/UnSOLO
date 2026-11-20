package com.unsolo.app.ui.trips

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.unsolo.app.AppGraph
import com.unsolo.app.core.model.*
import com.unsolo.app.data.MoneyFormat
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.LocalHeaderCounts
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class MyTripsViewModel(private val g: AppGraph) : ViewModel() {
    val trips = g.explore.observeMyTrips().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    val chats = g.chat.observeChats().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    init { viewModelScope.launch { g.explore.refreshMyTrips(); g.chat.refreshChats() } }
}

@Composable
fun MyTripsScreen(nav: AppNav) {
    val signedIn by nav.graph.account.isSignedIn.collectAsStateWithLifecycle()
    val counts = LocalHeaderCounts.current
    val c = Pc.colors
    if (!signedIn) {
        Column(Modifier.fillMaxSize().background(c.paper)) {
            PageHeader("My trips", counts, { nav.to(Routes.AUTH) }, { nav.to(Routes.AUTH) })
            EmptyState("Your tickets live here", "Sign in to see bookings, plans you've joined and their group chats.", action = "Sign in", onAction = { nav.to(Routes.AUTH) })
        }
        return
    }
    val vm: MyTripsViewModel = viewModel { MyTripsViewModel(nav.graph) }
    val data by vm.trips.collectAsStateWithLifecycle()
    val chats by vm.chats.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf("upcoming") }
    val d = data ?: MyTripsResponse()
    val unreadByRoom = chats.associate { it.id to it.unread }
    LazyColumn(Modifier.fillMaxSize().background(c.paper)) {
        item(key = "h") {
            PageHeader("My trips", counts, { nav.to(Routes.INBOX) }, { nav.to(Routes.ACTIVITY) })
            Segmented(listOf("upcoming" to "Upcoming · ${d.upcoming.size + d.plans.size}", "past" to "Past · ${d.past.size}"), tab, { tab = it })
            Spacer(Modifier.height(12.dp))
        }
        if (tab == "upcoming") {
            if (d.upcoming.isEmpty() && d.plans.isEmpty() && d.requested.isEmpty()) item { EmptyState("No trips yet", "Take a seat on a departure, or ask to join a plan in Tribe.", action = "Explore departures", onAction = { nav.tab(Routes.EXPLORE) }) }
            items(d.upcoming, key = { "b-" + it.id }, contentType = { "ticket" }) { b ->
                TicketCard(b, b.chatRoomId?.let { unreadByRoom[it] } ?: 0, onOpen = { nav.to(Routes.trip(b.trip.slug)) }, onChat = { b.chatRoomId?.let { nav.to(Routes.chat(it)) } }, onPay = { nav.openWeb("/bookings") })
            }
            if (d.plans.isNotEmpty() || d.requested.isNotEmpty()) item(key = "plans-h") { SectionHeader("Plans you're in", Modifier.padding(top = 8.dp)) }
            items(d.plans, key = { "p-" + it.id }, contentType = { "plan" }) { p -> PlanTicket(p, onOpen = { nav.to(Routes.post(p.id)) }, onChat = { nav.to(Routes.INBOX) }) }
            items(d.requested, key = { "r-" + it.id }, contentType = { "plan" }) { p -> PlanTicket(p, onOpen = { nav.to(Routes.post(p.id)) }, onChat = null) }
            d.past.firstOrNull { it.storyPrompt }?.let { last ->
                item(key = "last") {
                    SectionHeader("Last trip", Modifier.padding(top = 8.dp))
                    StoryPrompt(last) { nav.to(Routes.compose(PostKind.STORY)) }
                }
            }
        } else {
            if (d.past.isEmpty()) item { EmptyState("No past trips", "Trips you've been on show up here, with a prompt to share your story.") }
            items(d.past, key = { "past-" + it.id }) { b ->
                Row(Modifier.padding(horizontal = Gutter, vertical = 5.dp).fillMaxWidth().raisedCard().clickable { nav.to(Routes.trip(b.trip.slug)) }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.width(48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(Fmt.dayNum(b.travelDate), style = Pc.type.numLarge, color = c.ink)
                        Text(Fmt.monUpper(b.travelDate), style = Pc.type.code, color = c.ink2)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(b.trip.title, style = Pc.type.bodyStrong, color = c.ink)
                        Text(b.trip.host?.name ?: "", style = Pc.type.small, color = c.ink2)
                    }
                    if (b.storyPrompt) PcButton("Post story", { nav.to(Routes.compose(PostKind.STORY)) }, height = 44.dp)
                }
            }
        }
        item { Spacer(Modifier.navigationBarsPadding().height(24.dp)) }
    }
}

/** The ticket stub: countdown in days, the trip, its chat. Printed: solid ink rule. */
@Composable
private fun TicketCard(b: Booking, unread: Int, onOpen: () -> Unit, onChat: () -> Unit, onPay: () -> Unit) {
    val c = Pc.colors
    val days = Fmt.daysUntil(b.travelDate) ?: 0
    Column(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().raisedCard()) {
        Row(Modifier.clickable(onClick = onOpen).height(IntrinsicSize.Min)) {
            Column(Modifier.weight(1f).padding(16.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("%02d".format(days.coerceAtLeast(0)), style = Pc.type.numLarge.copy(fontSize = 44.sp), color = c.ink)
                    Text(if (days == 1L) " day to go" else " days to go", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(bottom = 6.dp))
                }
                Text(b.trip.title, style = Pc.type.title2, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${Fmt.dowDayMonth(b.travelDate)} · ${b.confirmationCode ?: b.status}", style = Pc.type.small, color = c.ink2)
            }
            ProgressiveImage(b.trip.image, Modifier.padding(10.dp).width(96.dp).fillMaxHeight().clip(RoundedCornerShape(PcTokens.radiusImage)))
        }
        if (b.balancePaise > 0 || b.chatRoomId != null) InsetRule()
        if (b.balancePaise > 0) {
            Row(Modifier.fillMaxWidth().clickable(onClick = onPay).padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Balance ", style = Pc.type.small, color = c.ink2)
                Text(MoneyFormat.rupees(b.balancePaise), style = Pc.type.price.copy(fontSize = 14.sp), color = c.ink, modifier = Modifier.weight(1f))
                Text("${MoneyFormat.rupees(b.paidPaise)} PAID", style = Pc.type.code, color = c.green, modifier = Modifier.clip(CircleShape).background(c.green.copy(alpha = 0.12f)).padding(horizontal = 8.dp, vertical = 3.dp))
            }
            if (b.chatRoomId != null) InsetRule()
        }
        if (b.chatRoomId != null) Row(Modifier.fillMaxWidth().clickable(onClick = onChat).defaultMinSize(minHeight = 52.dp).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            PcIcon(PcIcons.Chat, null, size = 20.dp)
            Spacer(Modifier.width(10.dp))
            Text("Trip chat", style = Pc.type.bodyStrong, color = c.ink, modifier = Modifier.weight(1f))
            if (unread > 0) CountBadge(unread)
            PcIcon(PcIcons.ChevronRight, null, size = 18.dp)
        }
    }
}

/** Pencilled: plans are dashed, never a ticket. */
@Composable
private fun PlanTicket(p: Post, onOpen: () -> Unit, onChat: (() -> Unit)?) {
    val c = Pc.colors
    Column(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().pencilledCard().clickable(onClick = onOpen).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(p.title ?: "Plan", style = Pc.type.title3, color = c.ink, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(Fmt.range(p.startsOn, p.endsOn), style = Pc.type.fact, color = c.ink2)
        }
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (p.viewer.isAuthor) { Tag("Organiser", TagKind.Organiser); Spacer(Modifier.width(8.dp)) }
            Text(when (p.viewer.membership) {
                "requested" -> "Requested · waiting for ${p.author.firstName}"
                else -> "${p.memberCount} of ${p.spotsTotal ?: p.seats.size}" + (if (p.viewer.isAuthor) "" else " · you're in")
            }, style = Pc.type.small, color = c.ink2)
        }
        Spacer(Modifier.height(10.dp))
        SeatRow(p.seats, maxCell = PcTokens.seatSmall)
        if (onChat != null) {
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth().clickable(onClick = onChat).defaultMinSize(minHeight = 44.dp), verticalAlignment = Alignment.CenterVertically) {
                PcIcon(PcIcons.Chat, null, size = 20.dp)
                Spacer(Modifier.width(10.dp))
                Text("Plan chat", style = Pc.type.bodyStrong, color = c.ink, modifier = Modifier.weight(1f))
                PcIcon(PcIcons.ChevronRight, null, size = 18.dp)
            }
        }
    }
}

@Composable
private fun StoryPrompt(b: Booking, onPost: () -> Unit) {
    val c = Pc.colors
    Row(Modifier.padding(horizontal = Gutter).fillMaxWidth().raisedCard().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.width(44.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(Fmt.dayNum(b.travelDate), style = Pc.type.numLarge, color = c.ink)
            Text(Fmt.monUpper(b.travelDate), style = Pc.type.code, color = c.ink2)
        }
        Spacer(Modifier.width(10.dp))
        ProgressiveImage(b.trip.image, Modifier.size(56.dp).clip(RoundedCornerShape(PcTokens.radiusImage)))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(b.trip.title, style = Pc.type.bodyStrong, color = c.ink, maxLines = 2)
            Text("Share it with your group", style = Pc.type.small, color = c.ink2)
        }
        PcButton("Post story", onPost, height = 44.dp)
    }
}
