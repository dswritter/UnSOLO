package com.unsolo.app.ui.tribe

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.unsolo.app.AppGraph
import com.unsolo.app.core.db.LocalState
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.userMessage
import com.unsolo.app.data.*
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.explore.DepartureRow
import com.unsolo.app.ui.explore.HostedTripCard
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.LocalHeaderCounts
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.spotsLine
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

private val Filters = listOf("foryou" to "For you", "plan" to "Plans", "story" to "Stories", "ask" to "Asks")

@OptIn(ExperimentalCoroutinesApi::class)
class FeedViewModel(private val g: AppGraph) : ViewModel() {
    val filter = MutableStateFlow("foryou")
    val place = MutableStateFlow<String?>(null)
    private val kind get() = filter.value.takeIf { it != "foryou" }
    val feed: StateFlow<FeedState?> = filter.flatMapLatest { f -> g.tribe.observeFeed(f.takeIf { it != "foryou" }) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    /** owner clientId → average upload progress, for the optimistic progress ring. */
    val uploads: StateFlow<Map<String, Float>> = g.db.media().observeActive().map { rows ->
        rows.groupBy { it.ownerClientId }.mapValues { (_, l) -> l.map { it.progress }.average().toFloat() }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())
    val refreshing = MutableStateFlow(false)
    val flags = g.config.config

    init { viewModelScope.launch { filter.collect { refresh() } } }

    fun refresh() = viewModelScope.launch {
        refreshing.value = true
        val loc = if (g.settings.current().nearMe) g.location.last else null
        g.tribe.refreshFeed(kind, loc?.lat, loc?.lng)
        refreshing.value = false
    }

    fun loadMore() = viewModelScope.launch { g.tribe.loadMore(kind) }
    fun react(p: Post, k: String) = viewModelScope.launch { g.tribe.toggleReaction(p.id, k) }
    fun save(p: Post) = viewModelScope.launch { g.tribe.toggleSave(p.id) }
    fun vote(p: Post, o: PollOption) = viewModelScope.launch { g.tribe.vote(p.id, o) }
    fun retry(p: Post) = viewModelScope.launch {
        val clientId = p.id.removePrefix("local:")
        g.db.media().forOwner(clientId).filter { it.state == "failed" }.forEach { g.db.media().progress(it.id, 0f, "queued") }
        g.db.outbox().byClientId(clientId)?.let { g.db.outbox().update(it.copy(state = "pending", attempts = 0, nextAttemptAt = 0)) }
        g.tribe.markLocalPostState(clientId, LocalState.SENDING)
        com.unsolo.app.core.sync.Outbox.scheduleUpload(g.app, clientId)
        g.outbox.kick()
    }
    fun discard(p: Post) = viewModelScope.launch { g.tribe.deleteLocalOrRemote(p.id) }
}

fun cardActions(nav: AppNav, vm: FeedViewModel) = CardActions(
    open = { nav.to(Routes.post(it.id)) },
    author = { if (it.username.isNotBlank()) nav.to(Routes.profile(it.username)) },
    join = { nav.to(Routes.post(it.id)) },
    react = { p, k -> if (nav.requirePhone()) vm.react(p, k) },
    save = { if (nav.requireSignIn()) vm.save(it) },
    openTrip = { nav.to(Routes.trip(it.slug)) },
    takeSeat = { t -> nav.graph.analytics.track("trip.take_seat", "tribe", mapOf("slug" to t.slug, "date" to t.nextDeparture)); nav.openWeb("/packages/${t.slug}?book=1") },
    vote = { p, o -> if (nav.requirePhone()) vm.vote(p, o) },
    retry = { vm.retry(it) },
    discard = { vm.discard(it) },
)

@Composable
fun TribeScreen(nav: AppNav) {
    val vm: FeedViewModel = viewModel { FeedViewModel(nav.graph) }
    val filter by vm.filter.collectAsStateWithLifecycle()
    val feed by vm.feed.collectAsStateWithLifecycle()
    val uploads by vm.uploads.collectAsStateWithLifecycle()
    val flags by vm.flags.collectAsStateWithLifecycle()
    val counts = LocalHeaderCounts.current
    val actions = remember(vm) { cardActions(nav, vm) }
    val c = Pc.colors

    if (!flags.flags.tribeEnabled) {
        Column(Modifier.fillMaxSize().background(c.paper)) {
            PageHeader("Tribe", counts, { if (nav.requireSignIn()) nav.to(Routes.INBOX) }, { if (nav.requireSignIn()) nav.to(Routes.ACTIVITY) })
            EmptyState("Tribe is taking a short break", "Explore and your trips work as usual. Check back soon.")
        }
        return
    }
    val items = feed?.items.orEmpty()
    val people = remember(items) { items.filterIsInstance<PostItem>().map { it.post.author }.distinctBy { it.id }.take(8) }
    LazyColumn(Modifier.fillMaxSize().background(c.paper)) {
        item(key = "header", contentType = "header") {
            PageHeader("Tribe", counts, { if (nav.requireSignIn()) nav.to(Routes.INBOX) }, { if (nav.requireSignIn()) nav.to(Routes.ACTIVITY) })
        }
        if (people.isNotEmpty()) item(key = "people", contentType = "people") {
            LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(bottom = 4.dp)) {
                items(people, key = { it.id }) { u ->
                    Column(Modifier.width(64.dp).clickable { if (u.username.isNotBlank()) nav.to(Routes.profile(u.username)) }, horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(Modifier.size(64.dp).border(2.dp, c.rule2, androidx.compose.foundation.shape.CircleShape).padding(4.dp)) {
                            Avatar(u, 56.dp)
                        }
                        Text(u.firstName, style = Pc.type.label, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        item(key = "filters", contentType = "filters") {
            TextTabs(Filters, filter, { vm.filter.value = it })
            Spacer(Modifier.height(6.dp))
        }
        if (feed == null) item(key = "loading") { Text("Loading the feed…", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(16.dp)) }
        else if (items.isEmpty()) item(key = "empty") {
            EmptyState("Nothing here yet", "Be the first: post a plan, a story or a question.", action = "Post", onAction = { nav.openPostSheet() })
        }
        items(items, key = { it.key }, contentType = { (it as? PostItem)?.post?.kind ?: "placed" }) { item ->
            when (item) {
                is PlacedTripItem -> PlacedTripCard(item.trip, actions)
                is PostItem -> {
                    val progress = if (item.post.id.startsWith("local:")) uploads[item.post.id.removePrefix("local:")] else null
                    when (item.post.kind) {
                        PostKind.PLAN -> PlanCard(item, progress, actions)
                        PostKind.STORY -> StoryCard(item, progress, actions)
                        else -> AskCard(item, progress, actions)
                    }
                }
            }
        }
        val f = feed
        if (f != null && items.isNotEmpty()) {
            if (f.caughtUp) {
                item(key = "caught", contentType = "end") {
                    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(Modifier.size(44.dp).clip(androidx.compose.foundation.shape.CircleShape).background(tonal()), contentAlignment = Alignment.Center) { PcIcon(PcIcons.Check, null) }
                        Spacer(Modifier.height(6.dp))
                        Spacer(Modifier.height(6.dp))
                        Text("You're caught up", style = Pc.type.title3, color = c.ink)
                        Text("New plans and stories show up here. Meanwhile, the next departures:", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(horizontal = 32.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                }
                items(f.nextDepartures.take(3), key = { "nd-" + it.slug }, contentType = { "departure" }) { t -> DepartureRow(t) { nav.to(Routes.trip(t.slug)) } }
            } else {
                item(key = "more") { LaunchedEffect(items.size) { vm.loadMore() }; Spacer(Modifier.height(48.dp)) }
            }
        }
        item(key = "pad") { Spacer(Modifier.height(24.dp)) }
    }
}

// ---------------- Post detail ----------------

class PostViewModel(private val g: AppGraph, val id: String) : ViewModel() {
    val post = g.tribe.observePost(id).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    val comments = g.tribe.observeComments(id).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val offers = g.tribe.observeOffers(id).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val requests = g.tribe.observeRequests(id).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val notFound = MutableStateFlow(false)
    val me = g.account.me

    init {
        g.analytics.screen("post_detail")
        if (!id.startsWith("local:")) viewModelScope.launch {
            val r = g.tribe.refreshPost(id)
            notFound.value = r is ApiResult.Err && r.status == 404
            val p = (r as? ApiResult.Ok)?.value?.post
            if (p?.viewer?.isAuthor == true && p.kind == PostKind.PLAN) g.tribe.refreshRequests(id)
        }
    }

    fun react(k: String) = viewModelScope.launch { g.tribe.toggleReaction(id, k) }
    fun save() = viewModelScope.launch { g.tribe.toggleSave(id) }
    fun comment(body: String, parent: String?) = viewModelScope.launch { g.tribe.addComment(id, body, parent) }
    fun vote(o: PollOption) = viewModelScope.launch { g.tribe.vote(id, o) }
    fun join(intro: String) = viewModelScope.launch { g.tribe.requestJoin(id, intro) }
    fun withdraw() = viewModelScope.launch { g.tribe.withdraw(id) }
    fun decide(userId: String, approve: Boolean) = viewModelScope.launch { g.tribe.decide(id, userId, approve) }
    fun deleteComment(cid: String) = viewModelScope.launch { g.tribe.deleteComment(cid) }

    fun report(targetType: String, targetId: String, reason: String, details: String?, done: (String) -> Unit) = viewModelScope.launch {
        done(when (val r = g.tribe.report(targetType, targetId, reason, details)) {
            is ApiResult.Ok -> "Thanks. Our team will review this."
            is ApiResult.Err -> r.userMessage()
            ApiResult.Offline -> "You're offline. Try again when you're back."
        })
    }

    fun block(userId: String, done: (String) -> Unit) = viewModelScope.launch {
        done(if (g.tribe.block(userId) is ApiResult.Ok) "Blocked. You won't see their posts or messages." else "Couldn't block right now.")
    }

    fun cancelPlan(done: (String) -> Unit) = viewModelScope.launch {
        done(if (g.tribe.cancelPlan(id) is ApiResult.Ok) "Plan cancelled. Members are told." else "Couldn't cancel right now.")
    }

    fun message(userId: String, onRoom: (String) -> Unit) = viewModelScope.launch {
        (g.tribe.openDirectChat(userId) as? ApiResult.Ok)?.let { onRoom(it.value.roomId) }
    }

    fun share(p: Post) = g.analytics.track("share.plan", "post_detail", mapOf("channel" to "system"))

    fun editHeld(text: String, cost: String?, done: (String) -> Unit) = viewModelScope.launch {
        val p = post.value?.post ?: return@launch
        val asTitle = p.title != null && p.body.isBlank()
        done(when (val r = g.tribe.editHeldPost(id, if (asTitle) text else null, if (asTitle) null else text, cost)) {
            is ApiResult.Ok -> if (g.db.posts().get(id)?.localState == LocalState.HELD) "Still held: remove the price or payment details." else "Thanks, your post is live."
            is ApiResult.Err -> r.userMessage()
            ApiResult.Offline -> "You're offline. Edits to held posts need a connection."
        })
    }
}

@Composable
fun PostDetailScreen(id: String, nav: AppNav) {
    val vm: PostViewModel = viewModel(key = "post-$id") { PostViewModel(nav.graph, id) }
    val item by vm.post.collectAsStateWithLifecycle()
    val comments by vm.comments.collectAsStateWithLifecycle()
    val offers by vm.offers.collectAsStateWithLifecycle()
    val requests by vm.requests.collectAsStateWithLifecycle()
    val notFound by vm.notFound.collectAsStateWithLifecycle()
    val me by vm.me.collectAsStateWithLifecycle()
    var joinSheet by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var reportTarget by remember { mutableStateOf<Triple<String, String, UserLite?>?>(null) }
    var replyTo by remember { mutableStateOf<Comment?>(null) }
    var toast by remember { mutableStateOf<String?>(null) }
    var editHeld by remember { mutableStateOf(false) }
    val c = Pc.colors

    val p = item?.post
    if (p == null) {
        Column(Modifier.fillMaxSize().background(c.paper)) {
            DetailTopBar(null, onBack = { nav.back() })
            if (notFound) EmptyState("This post isn't available", "It may have been removed by its author or our moderators.")
            else Text("Loading…", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(16.dp))
        }
        return
    }
    val isPlan = p.kind == PostKind.PLAN
    Column(Modifier.fillMaxSize().background(c.paper)) {
        if (p.kind != PostKind.STORY || p.media.isEmpty()) {
            DetailTopBar(null, onBack = { nav.back() }) {
                IconTap(PcIcons.Share, "Share", { vm.share(p); nav.share("${p.title ?: "A plan"} on UnSOLO Tribe: https://unsolo.in/tribe/p/${p.id}") })
                IconTap(PcIcons.Flag, "Report or block", { menu = true })
            }
        }
        LazyColumn(Modifier.weight(1f)) {
            if (p.kind == PostKind.STORY && p.media.isNotEmpty()) item(key = "pager") { StoryPhotos(p, onBack = { nav.back() }, onSave = { if (nav.requireSignIn()) vm.save() }, onMenu = { menu = true }) }
            item(key = "state") {
                LocalStateLine(item!!, null, CardActions({}, {}, {}, { _, _ -> }, {}, {}, {}, { _, _ -> }, {}, {}))
                if (item!!.localState == LocalState.HELD && p.viewer.isAuthor) Row(Modifier.padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PcButton("Edit post", { editHeld = true }, Modifier.weight(1f), kind = BtnKind.Outline, height = 44.dp)
                    PcButton("List as hosted trip", { nav.openWeb("/host") }, Modifier.weight(1f), height = 44.dp)
                }
            }
            item(key = "head") { PostHead(p, nav, onMessage = { u -> if (nav.requireSignIn()) vm.message(u.id) { nav.to(Routes.chat(it)) } }) }
            if (isPlan) item(key = "plan") { PlanBody(p) }
            else item(key = "body") {
                Column(Modifier.padding(horizontal = Gutter)) {
                    if (p.kind == PostKind.ASK && p.title != null && p.body.isNotBlank()) Text(p.body, style = Pc.type.body, color = c.ink)
                    if (p.kind == PostKind.STORY && p.body.isNotBlank()) Text(p.body, style = Pc.type.body, color = c.ink)
                }
                if (p.kind == PostKind.ASK && p.poll != null) { Spacer(Modifier.height(12.dp)); PollView(p, { if (nav.requirePhone()) vm.vote(it) }) }
                Spacer(Modifier.height(16.dp))
                Reactions(p) { k -> if (nav.requirePhone()) vm.react(k) }
                p.trip?.let { t ->
                    Box(Modifier.padding(horizontal = Gutter, vertical = 16.dp)) { HostedTripCard(t, { nav.to(Routes.trip(t.slug)) }, { nav.graph.analytics.track("trip.take_seat", "post_detail", mapOf("slug" to t.slug, "date" to t.nextDeparture)); nav.openWeb("/packages/${t.slug}?book=1") }) }
                }
            }
            if (isPlan && p.viewer.isAuthor && requests.isNotEmpty()) item(key = "requests") {
                RequestsBlock(requests, onDecide = { u, a -> vm.decide(u, a) }, onProfile = { nav.to(Routes.profile(it)) })
            }
            if (isPlan && offers.isNotEmpty() && nav.graph.config.config.value.flags.hostOffersEnabled) item(key = "offers") {
                Row(Modifier.padding(horizontal = Gutter, vertical = 8.dp).fillMaxWidth().raisedCard().clickable { nav.to(Routes.offers(p.id)) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${offers.size} host offer${if (offers.size > 1) "s" else ""}", style = Pc.type.bodyStrong, color = c.ink)
                        Text("A host can run this as a booked trip. Only members see offers.", style = Pc.type.small, color = c.ink2)
                    }
                    PcIcon(PcIcons.ChevronRight, null)
                }
            }
            item(key = "c-h") {
                Spacer(Modifier.height(12.dp))
                SectionHeader(if (p.kind == PostKind.ASK) "Answers" else "Comments", trailing = "${p.commentCount}")
            }
            if (comments.isEmpty()) item(key = "c-empty") { Text(if (p.kind == PostKind.ASK) "No answers yet. Know the place? Help out." else "No comments yet.", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(16.dp)) }
            items(comments, key = { it.comment.id }, contentType = { "thread" }) { th ->
                CommentThreadView(th, p, me?.user?.id, onReply = { if (nav.requirePhone()) replyTo = it }, onReport = { reportTarget = Triple("comment", it.id, it.author) }, onDelete = { vm.deleteComment(it.id) }, onAuthor = { nav.to(Routes.profile(it.username)) })
            }
            item(key = "end") { Spacer(Modifier.height(24.dp)) }
        }
        when {
            isPlan -> PlanBottomBar(p, requests.count { it.state == "requested" }, onJoin = { if (nav.requirePhone()) joinSheet = true }, onWithdraw = { vm.withdraw() },
                onShare = { vm.share(p); nav.share("Join my plan on UnSOLO: https://unsolo.in/tribe/p/${p.id}") }, onChat = { nav.tab(Routes.TRIPS) })
            else -> CommentBar(me?.user, replyTo, onCancelReply = { replyTo = null }, placeholder = if (p.kind == PostKind.ASK) "Write an answer" else "Add a comment") { body ->
                if (nav.requirePhone()) { vm.comment(body, replyTo?.id); replyTo = null }
            }
        }
    }

    if (joinSheet) JoinSheet(p, onDismiss = { joinSheet = false }) { intro -> joinSheet = false; vm.join(intro) }
    if (menu) PostMenuSheet(p, onDismiss = { menu = false },
        onReport = { menu = false; reportTarget = Triple("post", p.id, p.author) },
        onBlock = { menu = false; if (nav.requireSignIn()) vm.block(p.author.id) { toast = it; nav.back() } },
        onCancel = { menu = false; vm.cancelPlan { toast = it } },
        onShare = { menu = false; nav.share("https://unsolo.in/tribe/p/${p.id}") })
    reportTarget?.let { (type, tid, user) ->
        ReportSheet(user, onDismiss = { reportTarget = null }, onSubmit = { reason, details ->
            reportTarget = null
            if (nav.requireSignIn()) vm.report(type, tid, reason, details) { toast = it }
        }, onBlock = user?.let { u -> { reportTarget = null; if (nav.requireSignIn()) vm.block(u.id) { toast = it } } })
    }
    if (editHeld) EditHeldSheet(p, onDismiss = { editHeld = false }) { body, cost -> editHeld = false; vm.editHeld(body, cost) { toast = it } }
    toast?.let { msg -> LaunchedEffect(msg) { nav.graph.events.emit(AppEvent.Message(msg)); toast = null } }
}

@Composable
private fun StoryPhotos(p: Post, onBack: () -> Unit, onSave: () -> Unit, onMenu: () -> Unit) {
    val c = Pc.colors
    val pager = rememberPagerState { p.media.size }
    Box(Modifier.fillMaxWidth().height(280.dp)) {
        HorizontalPager(pager, Modifier.fillMaxSize(), key = { it }) { i -> ProgressiveImage(p.media[i], Modifier.fillMaxSize()) }
        Row(Modifier.statusBarsPadding().padding(12.dp).fillMaxWidth()) {
            SquareButton(PcIcons.Back, "Back", onBack)
            Spacer(Modifier.weight(1f))
            SquareButton(PcIcons.Flag, "Report", onMenu)
            Spacer(Modifier.width(8.dp))
            SquareButton(if (p.viewer.saved) PcIcons.BookmarkFilled else PcIcons.Bookmark, "Save", onSave)
        }
        Text("${pager.currentPage + 1} / ${p.media.size}", style = Pc.type.label, color = androidx.compose.ui.graphics.Color.White,
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp).clip(androidx.compose.foundation.shape.CircleShape).background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.45f)).padding(horizontal = 10.dp, vertical = 4.dp))
    }
}

@Composable
private fun SquareButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    Box(Modifier.size(44.dp).clip(androidx.compose.foundation.shape.CircleShape).background(Pc.colors.raised.copy(alpha = 0.92f)).clickable(role = Role.Button, onClickLabel = label, onClick = onClick), contentAlignment = Alignment.Center) {
        PcIcon(icon, label)
    }
}

@Composable
private fun PostHead(p: Post, nav: AppNav, onMessage: (UserLite) -> Unit) {
    val c = Pc.colors
    Column(Modifier.padding(horizontal = Gutter, vertical = 14.dp)) {
        if (p.kind == PostKind.PLAN) { CommunityPlanLine(); Spacer(Modifier.height(4.dp)) }
        if (p.kind != PostKind.STORY) {
            Text(p.title ?: p.body, style = Pc.type.display.copy(fontSize = 28.sp), color = c.ink)
            Spacer(Modifier.height(12.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f).clickable { if (p.author.username.isNotBlank()) nav.to(Routes.profile(p.author.username)) }, verticalAlignment = Alignment.CenterVertically) {
                Avatar(p.author, 44.dp)
                Spacer(Modifier.width(10.dp))
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(p.author.name, style = Pc.type.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        if (p.author.isIdVerified) { Spacer(Modifier.width(4.dp)); VerifiedMark() }
                        Spacer(Modifier.width(6.dp))
                        when {
                            p.kind == PostKind.PLAN -> Tag("Organiser", TagKind.Organiser)
                            p.kind == PostKind.STORY -> Tag("Story", TagKind.Kind)
                            else -> Tag("Ask", TagKind.Kind)
                        }
                    }
                    Text(listOfNotNull(p.trip?.title, p.place?.name.takeIf { p.trip == null }, Fmt.ago(p.createdAt)).joinToString(" · "), style = Pc.type.small, color = c.ink2, maxLines = 1)
                }
            }
            if (!p.viewer.isAuthor) PcButton("Message", { onMessage(p.author) }, kind = BtnKind.Outline, height = 44.dp)
        }
        if (p.kind == PostKind.STORY) {
            Spacer(Modifier.height(12.dp))
            Text(p.title ?: "", style = Pc.type.title1, color = c.ink)
        }
    }
}

@Composable
private fun PlanBody(p: Post) {
    val c = Pc.colors
    Column {
        Facts(planFacts(p), Modifier.padding(horizontal = Gutter))
        Column(Modifier.padding(horizontal = Gutter, vertical = 16.dp).fillMaxWidth().pencilledCard().padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Who's in", style = Pc.type.title3, color = c.ink)
                Text(" · ${p.memberCount} of ${p.spotsTotal ?: p.seats.size}", style = Pc.type.small, color = c.ink2, modifier = Modifier.weight(1f))
                val open = ((p.spotsTotal ?: p.seats.size) - p.memberCount).coerceAtLeast(0)
                Text("$open spots open", style = Pc.type.small, color = c.ink2)
            }
            Spacer(Modifier.height(12.dp))
            SeatRow(p.seats, maxCell = PcTokens.seat)
            if (p.seats.any { it.state == SeatState.REQUESTED }) {
                Text("Clock = request waiting for the organiser", style = Pc.type.label, color = c.ink2, modifier = Modifier.padding(top = 10.dp))
            }
        }
        if (p.body.isNotBlank()) Text(p.body, style = Pc.type.body, color = c.ink, modifier = Modifier.padding(horizontal = Gutter))
        val audience = when (p.audience) { "women" -> " Women travellers only; joiners need to be verified."; "verified" -> " Verified travellers only."; else -> "" }
        Text(
            (p.estCostText ?: "Costs are split among yourselves.") + "." .takeIf { p.estCostText?.endsWith(".") == false }.orEmpty() +
                (p.meetingPoint?.let { " Meeting point: $it." } ?: " Meeting point is shared once you're approved.") + audience,
            style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(horizontal = Gutter, vertical = 8.dp),
        )
        Row(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().tonalFill().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            PcIcon(PcIcons.Shield, null, size = 18.dp)
            Spacer(Modifier.width(10.dp))
            Text("Meet first in a public place. Share the plan with someone you trust.", style = Pc.type.small, color = c.ink)
        }
    }
}

@Composable
private fun Reactions(p: Post, onReact: (String) -> Unit) {
    val c = Pc.colors
    Row(Modifier.padding(horizontal = Gutter).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(
            Triple(ReactionKind.WANT_TO_GO, "Want to go", PcIcons.Pin) to p.reactions.wantToGo,
            Triple(ReactionKind.HELPFUL, "Helpful", PcIcons.Bulb) to p.reactions.helpful,
            Triple(ReactionKind.LOVE, "Love", PcIcons.Heart) to p.reactions.love,
        ).forEach { (spec, count) ->
            val (k, label, icon) = spec
            val on = k in p.myReactions
            val fg = if (on) c.onInk else c.ink
            Row(Modifier.height(44.dp).clip(androidx.compose.foundation.shape.CircleShape).background(if (on) c.ink else tonal())
                .clickable(role = Role.Checkbox, onClickLabel = label) { onReact(k) }.padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically) {
                PcIcon(if (k == ReactionKind.LOVE && on) PcIcons.HeartFilled else icon, null, size = 16.dp, tint = fg)
                Spacer(Modifier.width(6.dp))
                Text(label, style = Pc.type.smallStrong, color = fg, maxLines = 1, softWrap = false)
                Spacer(Modifier.width(6.dp))
                Text("$count", style = Pc.type.num.copy(fontSize = 13.sp), color = fg, maxLines = 1, softWrap = false)
            }
        }
    }
}

@Composable
private fun CommentThreadView(th: CommentThread, p: Post, meId: String?, onReply: (Comment) -> Unit, onReport: (Comment) -> Unit, onDelete: (Comment) -> Unit, onAuthor: (UserLite) -> Unit) {
    val c = Pc.colors
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        CommentRow(th.comment, p, meId, th.comment.id in th.pending, onReply, onReport, onDelete, onAuthor, reply = false)
        if (th.replies.isNotEmpty()) Row(Modifier.padding(start = 62.dp, end = Gutter).height(IntrinsicSize.Min)) {
            Box(Modifier.width(2.dp).fillMaxHeight().clip(androidx.compose.foundation.shape.CircleShape).background(c.rule))
            Column(Modifier.weight(1f)) {
                th.replies.forEach { r -> CommentRow(r, p, meId, r.id in th.pending, onReply = { onReply(th.comment) }, onReport, onDelete, onAuthor, reply = true) }
            }
        }
    }
}

@Composable
private fun CommentRow(cm: Comment, p: Post, meId: String?, pending: Boolean, onReply: (Comment) -> Unit, onReport: (Comment) -> Unit, onDelete: (Comment) -> Unit, onAuthor: (UserLite) -> Unit, reply: Boolean) {
    val c = Pc.colors
    Row(Modifier.fillMaxWidth().padding(start = if (reply) 12.dp else Gutter, end = 8.dp, top = 12.dp)) {
        Box(Modifier.clickable { onAuthor(cm.author) }) { Avatar(cm.author, if (reply) 30.dp else 34.dp) }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(cm.author.firstName, style = Pc.type.smallStrong, color = c.ink)
                if (cm.author.id == p.author.id) { Spacer(Modifier.width(6.dp)); Tag(if (p.kind == PostKind.PLAN) "Organiser" else "Author", if (p.kind == PostKind.PLAN) TagKind.Organiser else TagKind.Author) }
                if (cm.author.isHost) { Spacer(Modifier.width(6.dp)); Tag("Host", TagKind.Host) }
                Spacer(Modifier.width(6.dp))
                Text(if (pending) "sending…" else Fmt.ago(cm.createdAt), style = Pc.type.label, color = c.ink2)
            }
            Text(cm.body, style = Pc.type.body, color = c.ink)
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (!reply) Text("Reply", style = Pc.type.smallStrong, color = c.ink2, modifier = Modifier.clip(RoundedCornerShape(4.dp)).clickable { onReply(cm) }.padding(vertical = 12.dp).padding(end = 16.dp))
                if (cm.author.id == meId) Text("Delete", style = Pc.type.smallStrong, color = c.ink2, modifier = Modifier.clip(RoundedCornerShape(4.dp)).clickable { onDelete(cm) }.padding(vertical = 12.dp).padding(end = 16.dp))
                else Text("Report", style = Pc.type.smallStrong, color = c.ink2, modifier = Modifier.clip(RoundedCornerShape(4.dp)).clickable { onReport(cm) }.padding(vertical = 12.dp))
            }
        }
    }
}

@Composable
private fun RequestsBlock(reqs: List<JoinRequestItem>, onDecide: (String, Boolean) -> Unit, onProfile: (String) -> Unit) {
    Column(Modifier.padding(top = 12.dp)) {
        SectionHeader("Requests", trailing = "${reqs.count { it.state == "requested" }} waiting")
        reqs.forEach { r -> RequestRow(r, onDecide, onProfile) }
    }
}

@Composable
fun RequestRow(r: JoinRequestItem, onDecide: (String, Boolean) -> Unit, onProfile: (String) -> Unit) {
    val c = Pc.colors
    Column(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().raisedCard().padding(16.dp)) {
        Row(Modifier.clickable { onProfile(r.user.username) }, verticalAlignment = Alignment.CenterVertically) {
            Avatar(r.user, 44.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(r.user.name, style = Pc.type.bodyStrong, color = c.ink)
                    if (r.user.isIdVerified) { Spacer(Modifier.width(4.dp)); VerifiedMark() }
                }
                Text(listOfNotNull(r.user.tripsCount?.let { "$it trips" }, r.user.reviewsAvg?.let { "★ %.1f".format(it) }, r.user.mutuals?.takeIf { it > 0 }?.let { "$it mutual" }).joinToString(" · ").ifEmpty { "New to UnSOLO" }, style = Pc.type.small, color = c.ink2)
            }
        }
        if (r.intro.isNotBlank()) Text("“${r.intro}”", style = Pc.type.body, color = c.ink, modifier = Modifier.padding(top = 10.dp))
        Spacer(Modifier.height(12.dp))
        when (r.state) {
            "requested" -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PcButton("Decline", { onDecide(r.user.id, false) }, Modifier.weight(1f), kind = BtnKind.Outline, height = 44.dp)
                PcButton("Approve", { onDecide(r.user.id, true) }, Modifier.weight(1f), height = 44.dp)
            }
            "approved" -> Text("Approved · they can see the meeting point and plan chat", style = Pc.type.smallStrong, color = c.green)
            else -> Text(r.state.replaceFirstChar { it.uppercase() }, style = Pc.type.smallStrong, color = c.ink2)
        }
    }
}

@Composable
private fun PlanBottomBar(p: Post, waiting: Int, onJoin: () -> Unit, onWithdraw: () -> Unit, onShare: () -> Unit, onChat: () -> Unit) {
    val names = p.seats.filter { it.state == SeatState.ORGANISER || it.state == SeatState.MEMBER || it.state == SeatState.YOU }.mapNotNull { it.user?.firstName }.take(2)
    when {
        p.viewer.isAuthor -> BottomActionBar("Your plan · ${p.spotsLine()}", if (waiting > 0) "$waiting requests waiting for you" else "Share it to fill the open seats", "Share plan", onShare)
        p.viewer.membership == "requested" -> BottomActionBar("Request sent", "${p.author.firstName} has 72 hours to reply. Your seat shows as requested.", "Withdraw", onWithdraw, kind = BtnKind.Outline)
        p.viewer.membership == "approved" -> BottomActionBar("You're in", p.meetingPoint?.let { "Meet at $it" } ?: "The plan chat is open", "Plan chat", onChat)
        p.status == "cancelled" -> BottomActionBar("Plan cancelled", "The organiser called it off.", "OK", {}, enabled = false)
        !p.viewer.canJoin && p.viewer.joinBlockedReason != null && p.viewer.joinBlockedReason != "phone_required" -> BottomActionBar(
            when (p.viewer.joinBlockedReason) { "full" -> "This plan is full"; "women_only" -> "Women-only plan"; "verified_only" -> "Verified travellers only"; else -> "Can't join" },
            when (p.viewer.joinBlockedReason) { "women_only" -> "Joiners must be women with a verified ID."; "verified_only" -> "Verify your ID in Settings to join."; else -> "Save it and watch for open seats." },
            "Ask to join", {}, kind = BtnKind.Outline, enabled = false)
        else -> BottomActionBar("Join ${names.joinToString(" and ").ifEmpty { p.author.firstName }}", "${p.author.firstName} approves each request · intro needed", "Ask to join", onJoin, kind = BtnKind.Outline)
    }
}

@Composable
private fun CommentBar(me: UserLite?, replyTo: Comment?, onCancelReply: () -> Unit, placeholder: String, onSend: (String) -> Unit) {
    val c = Pc.colors
    var text by rememberSaveable { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().background(c.raised).navigationBarsPadding().imePadding()) {
        Hairline()
        if (replyTo != null) Row(Modifier.padding(horizontal = Gutter, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Replying to ${replyTo.author.firstName}", style = Pc.type.label, color = c.ink2, modifier = Modifier.weight(1f))
            IconTap(PcIcons.Close, "Cancel reply", onCancelReply)
        }
        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(me, 36.dp)
            Spacer(Modifier.width(10.dp))
            BoxedInput(text, { text = it.take(2000) }, placeholder, Modifier.weight(1f), singleLine = false)
            if (text.isNotBlank()) {
                Spacer(Modifier.width(6.dp))
                Box(Modifier.size(44.dp).clip(androidx.compose.foundation.shape.CircleShape).background(c.ink).clickable(onClickLabel = "Send") { onSend(text); text = "" }, contentAlignment = Alignment.Center) {
                    PcIcon(PcIcons.Send, "Send", tint = c.onInk, size = 20.dp)
                }
            }
        }
    }
}

// ---------------- Sheets ----------------

@Composable
fun JoinSheet(p: Post, onDismiss: () -> Unit, onSend: (String) -> Unit) {
    val c = Pc.colors
    var intro by rememberSaveable { mutableStateOf("") }
    val ok = intro.trim().length in 10..500
    PcSheet(onDismiss) {
        Column(Modifier.padding(horizontal = Gutter)) {
            Text("Ask to join ${p.author.firstName}'s plan", style = Pc.type.title2, color = c.ink)
            Text("Say who you are and why this plan. ${p.author.firstName} sees your trips, reviews and mutual friends.", style = Pc.type.small, color = c.ink2)
            Spacer(Modifier.height(12.dp))
            BoxedInput(intro, { intro = it.take(500) }, "Hi! I'm… I've done… I'm keen on…", singleLine = false, minLines = 4)
            Text("${intro.trim().length}/500 · at least 10 characters", style = Pc.type.label, color = if (ok || intro.isEmpty()) c.ink2 else c.red, modifier = Modifier.padding(top = 6.dp))
            Spacer(Modifier.height(12.dp))
            PcButton("Send request", { onSend(intro.trim()) }, Modifier.fillMaxWidth(), enabled = ok)
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun PostMenuSheet(p: Post, onDismiss: () -> Unit, onReport: () -> Unit, onBlock: () -> Unit, onCancel: () -> Unit, onShare: () -> Unit) {
    PcSheet(onDismiss) {
        NavRow("Share", icon = PcIcons.Share, onClick = onShare)
        if (p.viewer.isAuthor) {
            if (p.kind == PostKind.PLAN && p.status == "live") NavRow("Cancel this plan", "Members get a notification", PcIcons.Close, onClick = onCancel, danger = true)
        } else {
            NavRow("Report post", "Spam, scam, unsafe meetup…", PcIcons.Flag, onClick = onReport)
            NavRow("Block ${p.author.firstName}", "You won't see each other's posts or messages", PcIcons.Lock, onClick = onBlock, danger = true)
        }
    }
}

private val reasons = listOf(
    "spam" to "Spam", "scam_money" to "Scam or asking for money", "harassment" to "Harassment", "unsafe_meetup" to "Unsafe meetup",
    "fake_profile" to "Fake profile", "hate" to "Hate", "sexual" to "Sexual content", "other" to "Something else",
)

@Composable
fun ReportSheet(user: UserLite?, onDismiss: () -> Unit, onSubmit: (String, String?) -> Unit, onBlock: (() -> Unit)?) {
    val c = Pc.colors
    var reason by remember { mutableStateOf<String?>(null) }
    var details by remember { mutableStateOf("") }
    PcSheet(onDismiss) {
        Column(Modifier.padding(horizontal = Gutter)) {
            Text("Report", style = Pc.type.title2, color = c.ink)
            Text("Reports are private. Safety reports get a first look within 2 hours.", style = Pc.type.small, color = c.ink2)
            Spacer(Modifier.height(10.dp))
        }
        FlowRow(Modifier.padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            reasons.forEach { (k, label) -> PcChip(label, reason == k, { reason = k }) }
        }
        Column(Modifier.padding(Gutter)) {
            BoxedInput(details, { details = it.take(500) }, "Anything else we should know? (optional)", singleLine = false)
            Spacer(Modifier.height(12.dp))
            PcButton("Send report", { reason?.let { onSubmit(it, details.ifBlank { null }) } }, Modifier.fillMaxWidth(), enabled = reason != null)
            if (onBlock != null && user != null) { Spacer(Modifier.height(4.dp)); PcButton("Block ${user.firstName}", onBlock, Modifier.fillMaxWidth(), kind = BtnKind.Danger) }
        }
    }
}

@Composable
private fun EditHeldSheet(p: Post, onDismiss: () -> Unit, onSave: (String, String?) -> Unit) {
    var body by rememberSaveable { mutableStateOf(p.title?.let { t -> if (p.body.isBlank()) t else p.body } ?: p.body) }
    var cost by rememberSaveable { mutableStateOf(p.estCostText.orEmpty()) }
    PcSheet(onDismiss) {
        Column(Modifier.padding(horizontal = Gutter)) {
            Text("Edit and resubmit", style = Pc.type.title2, color = Pc.colors.ink)
            Text("Plans split costs among yourselves. Take out per-person prices, advances and payment IDs.", style = Pc.type.small, color = Pc.colors.ink2)
            Spacer(Modifier.height(12.dp))
            BoxedInput(body, { body = it.take(1500) }, "What's the plan?", singleLine = false, minLines = 4)
            if (p.kind == PostKind.PLAN) { Spacer(Modifier.height(8.dp)); BoxedInput(cost, { cost = it.take(60) }, "Rough cost each, e.g. Est. ₹4,500 split") }
            Spacer(Modifier.height(12.dp))
            PcButton("Resubmit", { onSave(body.trim(), cost.trim().ifBlank { null }) }, Modifier.fillMaxWidth(), enabled = body.isNotBlank())
        }
    }
}

@Composable
fun HeldPromptSheet(prompts: List<String>, onDismiss: () -> Unit, onOpen: () -> Unit, onHost: () -> Unit) {
    val c = Pc.colors
    val money = "money" in prompts
    PcSheet(onDismiss) {
        Column(Modifier.padding(horizontal = Gutter)) {
            if (money) Tag("Host", TagKind.Host)
            Spacer(Modifier.height(8.dp))
            Text(if (money) "Charging for this? List it as a hosted trip." else "Posted, with a small change", style = Pc.type.title2, color = c.ink)
            Spacer(Modifier.height(6.dp))
            Text(
                if (money) "Plans are for splitting costs among yourselves, so this one is held until you edit out the price. Selling trips? Hosted trips get bookings, payments and the HOST tag."
                else heldCopy(prompts),
                style = Pc.type.body, color = c.ink2,
            )
            Spacer(Modifier.height(16.dp))
            if (money) {
                PcButton("List it as a hosted trip", onHost, Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                PcButton("Edit my post", onOpen, Modifier.fillMaxWidth(), kind = BtnKind.Outline)
            } else PcButton("OK", onDismiss, Modifier.fillMaxWidth())
        }
    }
}

@Suppress("unused") private val keepEllipsis = TextOverflow.Ellipsis
