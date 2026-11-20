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
import com.unsolo.app.ui.explore.SeatCaption
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
            EmptyState("Your circles live here", "Sign in to see bookings, plans you've joined and their group chats.", action = "Sign in", onAction = { nav.to(Routes.AUTH) })
        }
        return
    }
    val vm: MyTripsViewModel = viewModel { MyTripsViewModel(nav.graph) }
    val data by vm.trips.collectAsStateWithLifecycle()
    val chats by vm.chats.collectAsStateWithLifecycle()
    val me by nav.graph.account.me.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf("upcoming") }
    val d = data ?: MyTripsResponse()
    val unreadByRoom = chats.associate { it.id to it.unread }
    LazyColumn(Modifier.fillMaxSize().background(c.paper)) {
        item(key = "h") {
            PageHeader("My trips", counts, { nav.to(Routes.INBOX) }, { nav.to(Routes.ACTIVITY) })
            Segmented(listOf("upcoming" to "Upcoming · ${d.upcoming.size}", "plans" to "Plans · ${d.plans.size + d.requested.size}", "past" to "Past · ${d.past.size}"), tab, { tab = it })
            Spacer(Modifier.height(8.dp))
        }
        when (tab) {
            "upcoming" -> {
                if (d.upcoming.isEmpty()) item { EmptyState("No trips yet", "Take a seat on a departure, or ask to join a plan in Tribe.", action = "Explore departures", onAction = { nav.tab(Routes.EXPLORE) }) }
                items(d.upcoming, key = { "b-" + it.id }, contentType = { "ticket" }) { b ->
                    UpcomingCard(b, me?.user, b.chatRoomId?.let { unreadByRoom[it] } ?: 0, onOpen = { nav.to(Routes.trip(b.trip.slug)) }, onChat = { b.chatRoomId?.let { nav.to(Routes.chat(it)) } }, onPay = { nav.openWeb("/bookings") })
                }
                d.past.firstOrNull { it.storyPrompt }?.let { last ->
                    item(key = "last") {
                        SectionHeader("Last trip", Modifier.padding(top = 8.dp))
                        PastCard(last) { nav.to(Routes.compose(PostKind.STORY)) }
                    }
                }
            }
            "plans" -> {
                if (d.plans.isEmpty() && d.requested.isEmpty()) item { EmptyState("No plans yet", "Plans you organise or join show up here.", action = "Find a plan", onAction = { nav.tab(Routes.TRIBE) }) }
                items(d.plans, key = { "p-" + it.id }, contentType = { "plan" }) { p -> PlanTicket(p, me?.user?.id, onOpen = { nav.to(Routes.post(p.id)) }, onChat = { nav.to(Routes.INBOX) }) }
                items(d.requested, key = { "r-" + it.id }, contentType = { "plan" }) { p -> PlanTicket(p, me?.user?.id, onOpen = { nav.to(Routes.post(p.id)) }, onChat = null) }
            }
            else -> {
                if (d.past.isEmpty()) item { EmptyState("No past trips", "Trips you've been on show up here, with a prompt to share your story.") }
                items(d.past, key = { "past-" + it.id }) { b -> PastCard(b, onOpen = { nav.to(Routes.trip(b.trip.slug)) }) { nav.to(Routes.compose(PostKind.STORY)) } }
            }
        }
        item { Spacer(Modifier.navigationBarsPadding().height(24.dp)) }
    }
}

/** Booked trip: your gold seat in the ring, co-travellers' faces, "Meet the circle". */
@Composable
private fun UpcomingCard(b: Booking, me: UserLite?, unread: Int, onOpen: () -> Unit, onChat: () -> Unit, onPay: () -> Unit) {
    val c = Pc.colors
    val days = Fmt.daysUntil(b.travelDate) ?: 0
    val total = b.trip.seatsTotal ?: 0
    val taken = (total - (b.trip.seatsLeft ?: 0)).coerceAtLeast(1)
    val faces = b.trip.goingFaces
    Column(Modifier.padding(horizontal = 14.dp, vertical = 6.dp).fillMaxWidth().raisedCard().clickable(onClick = onOpen).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (total > 0) SeatRing(total, taken - 1, 132.dp, you = YouSeat.You, people = listOfNotNull(b.trip.host) + faces, showFaces = true, me = me,
                photo = b.trip.image, badge = b.trip.host?.let { RingBadge(it) })
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Tag(when (days) { 0L -> "Today"; 1L -> "Tomorrow"; else -> "In $days days" }, TagKind.Verified, icon = PcIcons.CalendarCheck)
                Spacer(Modifier.height(8.dp))
                Text(b.trip.title, style = Pc.type.title2.copy(fontSize = 19.sp), color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${Fmt.dowDayMonth(b.travelDate)} · ${b.confirmationCode ?: b.status}", style = Pc.type.small, color = c.ink2)
                if (total > 0) SeatCaption(total, taken, Modifier.padding(top = 2.dp))
            }
        }
        if (faces.isNotEmpty()) Row(Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            FaceStack(faces.take(4), size = 28.dp)
            Spacer(Modifier.width(4.dp))
            val names = faces.take(2).joinToString(", ") { it.firstName }
            Text(if (faces.size > 2) "$names, ${faces.size - 2} more and you" else "$names and you", style = Pc.type.small, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (b.balancePaise > 0) {
            Row(Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(RadiusField)).background(c.tonal).clickable(onClick = onPay).padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text("Balance ", style = Pc.type.small, color = c.ink2)
                        Text(MoneyFormat.rupees(b.balancePaise), style = Pc.type.price.copy(fontSize = 15.sp), color = c.ink)
                    }
                    Text("${MoneyFormat.rupees(b.paidPaise)} paid", style = Pc.type.label, color = c.pine)
                }
                Text("Pay on unsolo.in", style = Pc.type.smallStrong.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.pine)
            }
        }
        if (b.chatRoomId != null) {
            Spacer(Modifier.height(12.dp))
            PcButton(if (unread > 0) "Meet the circle · $unread new" else "Meet the circle", onChat, Modifier.fillMaxWidth(), icon = PcIcons.ChatsCircle)
        }
    }
}

/** Past trip: desaturated ring, "Went · date", a prompt to post a story. */
@Composable
private fun PastCard(b: Booking, onOpen: (() -> Unit)? = null, onStory: () -> Unit) {
    val c = Pc.colors
    val total = b.trip.seatsTotal ?: 0
    Column(Modifier.padding(horizontal = 14.dp, vertical = 6.dp).fillMaxWidth().raisedCard().then(if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (total > 0) SeatRing(total, total - 1, 96.dp, you = YouSeat.You, past = true, photo = b.trip.image, dots = false, animate = false)
            else ProgressiveImage(b.trip.image, Modifier.size(96.dp).clip(CircleShape))
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text("Went · ${Fmt.dayMonth(b.travelDate)}", style = Pc.type.smallStrong.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink3)
                Text(b.trip.title, style = Pc.type.title3, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(b.trip.host?.name, if (total > 0) "$total travellers" else null).joinToString(" · "), style = Pc.type.small, color = c.ink2)
            }
        }
        Spacer(Modifier.height(12.dp))
        PcButton("Post a story", onStory, Modifier.fillMaxWidth(), kind = BtnKind.Outline, icon = PcIcons.Camera, height = BtnSmall)
    }
}

/** Plans are pencilled: a dashed card with the plan's loose circle. */
@Composable
private fun PlanTicket(p: Post, meId: String?, onOpen: () -> Unit, onChat: (() -> Unit)?) {
    val c = Pc.colors
    Column(Modifier.padding(horizontal = 14.dp, vertical = 6.dp).fillMaxWidth().pencilledCard().clickable(onClick = onOpen).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            com.unsolo.app.ui.tribe.PlanRing(p, 96.dp, meId)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                if (p.viewer.isAuthor) { Tag("Organiser", TagKind.Organiser, height = 20.dp); Spacer(Modifier.height(6.dp)) }
                else if (p.audience == "women") { Tag("Women only", TagKind.Women, height = 22.dp); Spacer(Modifier.height(6.dp)) }
                Text(p.title ?: "Plan", style = Pc.type.title3, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(Fmt.range(p.startsOn, p.endsOn), style = Pc.type.fact, color = c.ink2)
                Text(when (p.viewer.membership) {
                    "requested" -> "Requested · waiting for ${p.author.firstName}"
                    else -> "${p.memberCount} of ${p.spotsTotal ?: p.seats.size} going" + (if (p.viewer.isAuthor) "" else " · you're in")
                }, style = Pc.type.small, color = c.ink2)
            }
        }
        if (onChat != null) {
            Spacer(Modifier.height(12.dp))
            PcButton("Plan chat", onChat, Modifier.fillMaxWidth(), kind = BtnKind.Outline, icon = PcIcons.ChatsCircle, height = BtnSmall)
        }
    }
}
