package com.unsolo.app.ui.activity

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.unsolo.app.AppGraph
import com.unsolo.app.core.db.LocalState
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.data.ChatRepository
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.DeepLinks
import com.unsolo.app.ui.nav.LocalHeaderCounts
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens
import com.unsolo.app.ui.tribe.RequestRow
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

// ---------------- Activity ----------------

@OptIn(ExperimentalCoroutinesApi::class)
class ActivityViewModel(private val g: AppGraph) : ViewModel() {
    val notifications = g.activity.observe().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    private val organised = g.explore.observeMyTrips().map { it?.plans.orEmpty().filter { p -> p.viewer.isAuthor && p.kind == PostKind.PLAN } }
    val requests: StateFlow<List<Pair<Post, List<JoinRequestItem>>>> = organised.flatMapLatest { plans ->
        if (plans.isEmpty()) flowOf(emptyList())
        else combine(plans.map { p -> g.tribe.observeRequests(p.id).map { p to it } }) { it.toList().filter { (_, r) -> r.isNotEmpty() } }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        viewModelScope.launch {
            g.activity.refresh()
            (g.explore.refreshMyTrips() as? ApiResult.Ok)?.value?.plans?.filter { it.viewer.isAuthor }?.forEach { g.tribe.refreshRequests(it.id) }
        }
    }

    fun open(n: AppNotification) = viewModelScope.launch { if (!n.isRead) g.activity.markRead(listOf(n.id)) }
    /** Inline decision from a tribe_join_request notification: POST /posts/{postId}/requests/{actorId}. */
    val decided = MutableStateFlow<Map<String, Boolean>>(emptyMap())
    fun decideFrom(n: AppNotification, approve: Boolean) = viewModelScope.launch {
        val postId = n.postId ?: return@launch
        val actorId = n.actorId ?: return@launch
        decided.value = decided.value + (n.id to approve)
        g.tribe.decide(postId, actorId, approve)
        if (!n.isRead) g.activity.markRead(listOf(n.id))
    }
    fun markAll() = viewModelScope.launch { g.activity.markAllRead() }
    fun decide(postId: String, userId: String, approve: Boolean) = viewModelScope.launch { g.tribe.decide(postId, userId, approve) }
    fun approveAll(postId: String) = viewModelScope.launch {
        requests.value.firstOrNull { it.first.id == postId }?.second?.filter { it.state == "requested" }?.forEach { g.tribe.decide(postId, it.user.id, true) }
    }
}

@Composable
fun ActivityScreen(nav: AppNav) {
    if (!nav.graph.account.isSignedIn.collectAsStateWithLifecycle().value) { SignedOutState(nav, "Activity"); return }
    val vm: ActivityViewModel = viewModel { ActivityViewModel(nav.graph) }
    val list by vm.notifications.collectAsStateWithLifecycle()
    val reqs by vm.requests.collectAsStateWithLifecycle()
    val decided by vm.decided.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf("all") }
    val waiting = reqs.sumOf { (_, r) -> r.count { it.state == "requested" } }
    val c = Pc.colors
    LazyColumn(Modifier.fillMaxSize().background(c.paper)) {
        item(key = "h") {
            PageHeader("Activity", LocalHeaderCounts.current, { nav.to(Routes.INBOX) }, { }, onBack = { nav.back() }) {
                if (list.any { !it.isRead }) LinkText("Mark all read", { vm.markAll() }, Modifier.padding(end = 4.dp), Pc.type.smallStrong)
            }
            Segmented(listOf("all" to "All", "requests" to "Requests · $waiting"), tab, { tab = it })
            Spacer(Modifier.height(12.dp))
            Spacer(Modifier.height(4.dp))
        }
        if (tab == "all") {
            if (list.isEmpty()) item { EmptyState("All quiet", "Join requests, replies and offers will show up here.") }
            items(list, key = { it.id }, contentType = { "n" }) { n ->
                val postId = n.postId ?: DeepLinks.routeForPath(n.link)?.takeIf { it.startsWith("post/") }?.removePrefix("post/")
                val pending = postId?.let { id -> reqs.firstOrNull { it.first.id == id }?.second?.count { r -> r.state == "requested" } } ?: 0
                NotificationRow(n,
                    onOpen = { vm.open(n); nav.link(n.link) },
                    actions = {
                        val actorState = n.actorId?.let { a -> reqs.firstOrNull { it.first.id == postId }?.second?.firstOrNull { it.user.id == a }?.state }
                        when {
                            n.type in JoinTypes && n.postId != null && n.actorId != null -> when {
                                decided[n.id] != null || (actorState != null && actorState != "requested") -> {
                                    val ok = decided[n.id] ?: (actorState == "approved")
                                    Text(if (ok) "Approved · they can see the meeting point" else "Declined", style = Pc.type.smallStrong, color = if (ok) Pc.colors.green else Pc.colors.ink2)
                                }
                                else -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    PcButton("Decline", { vm.decideFrom(n, false) }, Modifier.weight(1f), kind = BtnKind.Outline, height = 44.dp)
                                    PcButton("Approve", { vm.decideFrom(n, true) }, Modifier.weight(1f), height = 44.dp)
                                }
                            }
                            n.type in JoinTypes && postId != null && pending > 0 -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                PcButton("Review", { vm.open(n); tab = "requests" }, Modifier.weight(1f), kind = BtnKind.Outline, height = 44.dp)
                                PcButton(if (pending > 1) "Approve all $pending" else "Approve", { vm.open(n); vm.approveAll(postId) }, Modifier.weight(1f), height = 44.dp)
                            }
                            n.type == "plan.host_offer" && postId != null -> PcButton("See offer", { vm.open(n); nav.to(Routes.offers(postId)) }, Modifier.fillMaxWidth(), kind = BtnKind.Outline, height = 44.dp)
                        }
                    })
            }
        } else {
            if (reqs.isEmpty()) item { EmptyState("No requests", "When someone asks to join your plan, you'll approve them here.") }
            reqs.forEach { (plan, rs) ->
                item(key = "p-" + plan.id) {
                    Row(Modifier.fillMaxWidth().clickable { nav.to(Routes.post(plan.id)) }.padding(horizontal = Gutter, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(plan.title ?: "Your plan", style = Pc.type.title3, color = c.ink)
                            Text("${Fmt.range(plan.startsOn, plan.endsOn)} · ${plan.memberCount} of ${plan.spotsTotal ?: plan.seats.size} in", style = Pc.type.small, color = c.ink2)
                        }
                        SeatStrip(plan.seats, cell = 14.dp)
                    }
                    Hairline()
                }
                items(rs, key = { "r-" + plan.id + it.user.id }) { r -> RequestRow(r, { u, a -> vm.decide(plan.id, u, a) }, { nav.to(Routes.profile(it)) }) }
            }
        }
        item { Spacer(Modifier.navigationBarsPadding().height(24.dp)) }
    }
}

/** Contract type is tribe_join_request; plan.join_request is accepted for older payloads. */
private val JoinTypes = setOf("tribe_join_request", "plan.join_request")

@Composable
private fun NotificationRow(n: AppNotification, onOpen: () -> Unit, actions: @Composable () -> Unit) {
    val c = Pc.colors
    Column(Modifier.padding(horizontal = Gutter, vertical = 5.dp).fillMaxWidth()
        .then(if (n.isRead) Modifier.clip(RoundedCornerShape(PcTokens.radiusCard)) else Modifier.raisedCard())
        .clickable(onClick = onOpen).padding(14.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Box {
                Box(Modifier.size(44.dp).clip(CircleShape).background(tonal()), contentAlignment = Alignment.Center) {
                    PcIcon(when (n.category) { "plans" -> PcIcons.Users; "replies" -> PcIcons.Chat; "messages" -> PcIcons.Mail; "trips" -> PcIcons.Ticket; "tags" -> PcIcons.Image; else -> PcIcons.Bell }, null, size = 20.dp)
                }
                if (!n.isRead) Box(Modifier.align(Alignment.TopEnd).size(10.dp).clip(CircleShape).background(c.red))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(n.title, style = if (n.isRead) Pc.type.body else Pc.type.bodyStrong, color = c.ink)
                Text(listOfNotNull(n.body, Fmt.ago(n.createdAt)).joinToString(" · "), style = Pc.type.small, color = c.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        Box(Modifier.padding(start = 56.dp, top = 10.dp)) { actions() }
    }
}

@Composable
fun SignedOutState(nav: AppNav, title: String) {
    Column(Modifier.fillMaxSize().background(Pc.colors.paper)) {
        DetailTopBar(title, onBack = { nav.back() })
        EmptyState("Sign in to see this", "Browsing is open to everyone. Messages, activity and your trips need an account.", action = "Sign in", onAction = { nav.to(Routes.AUTH) })
    }
}

// ---------------- Inbox ----------------

class InboxViewModel(private val g: AppGraph) : ViewModel() {
    val chats = g.chat.observeChats().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val me = g.account.me
    init { viewModelScope.launch { g.chat.refreshChats() } }
}

@Composable
fun InboxScreen(nav: AppNav) {
    if (!nav.graph.account.isSignedIn.collectAsStateWithLifecycle().value) { SignedOutState(nav, "Messages"); return }
    val vm: InboxViewModel = viewModel { InboxViewModel(nav.graph) }
    val chats by vm.chats.collectAsStateWithLifecycle()
    val me by vm.me.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf("chats") }
    val c = Pc.colors
    val (requests, normal) = chats.partition { it.isRequest }
    LazyColumn(Modifier.fillMaxSize().background(c.paper)) {
        item(key = "h") {
            PageHeader("Messages", LocalHeaderCounts.current, { }, { nav.to(Routes.ACTIVITY) }, onBack = { nav.back() })
            Segmented(listOf("chats" to "Chats", "requests" to "Requests · ${requests.size}"), tab, { tab = it })
            Spacer(Modifier.height(12.dp))
            Spacer(Modifier.height(4.dp))
        }
        val shown = if (tab == "chats") normal else requests
        if (shown.isEmpty()) item { EmptyState(if (tab == "chats") "No chats yet" else "No requests", if (tab == "chats") "Trip and plan chats open when you book or get approved." else "Messages from people you don't follow land here.") }
        items(shown, key = { it.id }, contentType = { "chat" }) { ch -> ChatRow(ch, me?.user?.firstName) { nav.to(Routes.chat(ch.id)) } }
        if (tab == "chats" && requests.isNotEmpty()) {
            item(key = "rq-h") { SectionHeader("Requests", Modifier.padding(top = 12.dp), trailing = "${requests.size}") }
            items(requests, key = { "rq-" + it.id }) { ch -> ChatRow(ch, me?.user?.firstName) { nav.to(Routes.chat(ch.id)) } }
        }
        item(key = "note") {
            Text("Requests come from people you don't follow. They won't know you've read them until you reply. You can also report or block.",
                style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(16.dp))
        }
    }
}

@Composable
private fun ChatRow(ch: ChatSummary, myFirstName: String?, onClick: () -> Unit) {
    val c = Pc.colors
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Gutter, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        val group = ch.type != "direct"
        if (ch.image != null) ProgressiveImage(ch.image, Modifier.size(52.dp).clip(if (group) RoundedCornerShape(PcTokens.radiusButton) else CircleShape))
        else Avatar(UserLite("x", name = ch.name), 52.dp, square = group)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(ch.name, style = Pc.type.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val last = ch.lastMessage
            if (last != null) {
                val who = last.authorName?.let { if (it == myFirstName) "You: " else if (group) "$it: " else "" }.orEmpty()
                Text(who + last.body, style = if (ch.unread > 0) Pc.type.smallStrong else Pc.type.small, color = if (ch.unread > 0) c.ink else c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text(Fmt.ago(ch.lastMessage?.at), style = Pc.type.label, color = c.ink2)
            Spacer(Modifier.height(4.dp))
            if (ch.unread > 0) CountBadge(ch.unread)
        }
    }
    InsetRule(start = Gutter + 64.dp)
}

// ---------------- Chat room ----------------

class ChatViewModel(private val g: AppGraph, val roomId: String) : ViewModel() {
    val chat = g.chat.observeChat(roomId).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    val messages = g.chat.observeMessages(roomId).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val me = g.account.me

    init {
        viewModelScope.launch {
            g.chat.fetch(roomId, poll = false)
            g.chat.markRead(roomId)
        }
    }

    /** Polls ?after= every 4s, backing off to 15s after a minute without new messages (contract). */
    suspend fun pollLoop() {
        var lastNew = System.currentTimeMillis()
        while (true) {
            val quiet = System.currentTimeMillis() - lastNew > 60_000
            delay(if (quiet) 15_000 else 4_000)
            val r = g.chat.fetch(roomId, poll = true)
            if (r is ApiResult.Ok && r.value > 0) { lastNew = System.currentTimeMillis(); g.chat.markRead(roomId) }
        }
    }

    fun send(text: String) = viewModelScope.launch { g.chat.send(roomId, text) }
    fun report(type: String, id: String, reason: String, details: String?) = viewModelScope.launch {
        val r = g.tribe.report(type, id, reason, details)
        g.events.emit(com.unsolo.app.data.AppEvent.Message(if (r is ApiResult.Ok) "Thanks. Our team will review this." else "Couldn't send the report."))
    }
    fun block(userId: String) = viewModelScope.launch { g.tribe.block(userId) }
    fun retry(clientId: String) = viewModelScope.launch { g.chat.retry(clientId) }
}

@Composable
fun ChatScreen(roomId: String, nav: AppNav) {
    if (!nav.graph.account.isSignedIn.collectAsStateWithLifecycle().value) { SignedOutState(nav, "Chat"); return }
    val vm: ChatViewModel = viewModel(key = "chat-$roomId") { ChatViewModel(nav.graph, roomId) }
    val chat by vm.chat.collectAsStateWithLifecycle()
    val msgs by vm.messages.collectAsStateWithLifecycle()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(vm) { lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) { vm.pollLoop() } }
    val listState = rememberLazyListState()
    LaunchedEffect(msgs.size) { if (msgs.isNotEmpty()) listState.animateScrollToItem(0) }
    var text by rememberSaveable { mutableStateOf("") }
    var report by remember { mutableStateOf(false) }
    var reportMsg by remember { mutableStateOf<ChatMessage?>(null) }
    val other = msgs.firstOrNull { !it.mine && it.message.type != "system" }?.message?.author
    val c = Pc.colors
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar(chat?.name ?: "Chat", onBack = { nav.back() }, trailing = chat?.type?.let { if (it == "trip") "GROUP" else null }) {
            IconTap(PcIcons.Flag, "Report or block", { reportMsg = null; report = true })
        }
        if (chat?.isRequest == true) Text("Message request · they won't know you've read it until you reply.", style = Pc.type.small, color = c.ink2, modifier = Modifier.fillMaxWidth().background(c.raised).padding(12.dp))
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState, reverseLayout = true, contentPadding = PaddingValues(vertical = 12.dp)) {
            val ordered = msgs.asReversed()
            items(ordered.size, key = { i -> ordered[i].message.clientId?.let { cid -> "c:$cid" } ?: ordered[i].message.id }, contentType = { i -> ordered[i].message.type }) { i ->
                val m = ordered[i]
                // reverseLayout: the chronologically previous message is at i + 1.
                val first = ordered.getOrNull(i + 1)?.message?.author?.id != m.message.author.id
                val last = ordered.getOrNull(i - 1)?.message?.author?.id != m.message.author.id
                Bubble(m, first, last, onRetry = { m.message.clientId?.let(vm::retry) }, onReport = { reportMsg = m.message; report = true })
            }
        }
        Column(Modifier.fillMaxWidth().background(c.raised).navigationBarsPadding().imePadding()) {
            Spacer(Modifier.height(4.dp))
            Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                BoxedInput(text, { text = it.take(4000) }, "Message", Modifier.weight(1f), singleLine = false)
                Spacer(Modifier.width(8.dp))
                Box(Modifier.size(48.dp).clip(CircleShape).background(if (text.isBlank()) tonal() else c.ink).clickable(onClickLabel = "Send") { if (text.isNotBlank()) { vm.send(text); text = "" } }, contentAlignment = Alignment.Center) {
                    PcIcon(PcIcons.Send, "Send", tint = if (text.isBlank()) c.ink3 else c.onInk, size = 20.dp)
                }
            }
        }
    }
    if (report) {
        val target = reportMsg
        val who = target?.author ?: other
        com.unsolo.app.ui.tribe.ReportSheet(who, onDismiss = { report = false }, onSubmit = { reason, details ->
            report = false
            vm.report(if (target != null) "message" else "user", target?.id ?: who?.id ?: roomId, reason, details)
        }, onBlock = who?.let { u -> { report = false; vm.block(u.id); nav.back() } })
    }
}

@Composable
private fun Bubble(m: ChatRepository.UiMessage, first: Boolean, last: Boolean, onRetry: () -> Unit, onReport: () -> Unit) {
    val c = Pc.colors
    val msg = m.message
    if (msg.type == "system") {
        Text(msg.body, style = Pc.type.label, color = c.ink2, modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 8.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        return
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 3.dp), horizontalArrangement = if (m.mine) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Bottom) {
        if (!m.mine) { if (last) Avatar(msg.author, 28.dp) else Spacer(Modifier.width(28.dp)); Spacer(Modifier.width(8.dp)) }
        Column(horizontalAlignment = if (m.mine) Alignment.End else Alignment.Start, modifier = Modifier.widthIn(max = 290.dp)) {
            if (!m.mine && first) Row(verticalAlignment = Alignment.CenterVertically) {
                Text(msg.author.firstName, style = Pc.type.label, color = c.ink2)
                if (msg.author.isHost) { Spacer(Modifier.width(4.dp)); Tag("Host", TagKind.Host) }
            }
            val shape = RoundedCornerShape(18.dp)
            Text(msg.body, style = Pc.type.body, color = if (m.mine) c.onInk else c.ink,
                modifier = Modifier.clip(shape).then(if (m.mine) Modifier else Modifier.combinedClickable(onClick = {}, onLongClick = onReport, onLongClickLabel = "Report message")).background(if (m.mine) c.ink.copy(alpha = if (m.state == LocalState.SENDING) 0.7f else 1f) else tonal())
                    .padding(horizontal = 14.dp, vertical = 9.dp))
            when (m.state) {
                LocalState.SENDING -> Text("Sending…", style = Pc.type.label, color = c.ink3)
                LocalState.FAILED -> Text("Not sent · Tap to retry", style = Pc.type.label, color = c.red, modifier = Modifier.clickable(onClick = onRetry).padding(vertical = 6.dp))
                else -> if (last) Text(Fmt.clock(msg.createdAt), style = Pc.type.label, color = c.ink3)
            }
        }
    }
}
