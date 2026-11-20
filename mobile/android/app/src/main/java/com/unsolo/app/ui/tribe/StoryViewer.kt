package com.unsolo.app.ui.tribe

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.unsolo.app.AppGraph
import com.unsolo.app.core.model.*
import com.unsolo.app.data.AppEvent
import com.unsolo.app.data.PostItem
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class StoryViewerViewModel(private val g: AppGraph, startId: String) : ViewModel() {
    private val feeds = combine(g.tribe.observeFeed(null), g.tribe.observeFeed(PostKind.STORY)) { a, b ->
        (a.items + b.items).filterIsInstance<PostItem>().map { it.post }.distinctBy { it.id }
    }
    /** Every story in the rail, author by author (the same order as the rail), plus [startId] if it isn't cached in a feed. */
    val stories: StateFlow<List<Post>> = combine(feeds, g.tribe.observePost(startId), g.settings.data.map { it.seenStories }.take(1)) { posts, start, seen ->
        val authors = storyAuthors(posts, seen, meId = null)
        val list = authors.flatMap { it.posts }
        if (list.none { it.id == startId } && start?.post?.kind == PostKind.STORY) listOf(start.post) + list else list
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    /** An author's live plan rides along on their story. */
    val plans: StateFlow<Map<String, Post>> = feeds.map { posts ->
        posts.filter { it.kind == PostKind.PLAN && it.status == "live" }.groupBy { it.author.id }.mapValues { it.value.first() }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())

    fun seen(id: String) = viewModelScope.launch { g.settings.markStorySeen(id) }
    fun react(id: String, kind: String) = viewModelScope.launch { g.tribe.toggleReaction(id, kind) }
    fun reply(id: String, body: String) = viewModelScope.launch {
        g.tribe.addComment(id, body, null)
        g.events.emit(AppEvent.Message("Reply posted as a comment"))
    }
}

/** Full-screen story posts: progress bars, place, author, tap left/right, reply bar + quick reactions. */
@Composable
fun StoryViewerScreen(startId: String, nav: AppNav) {
    val vm: StoryViewerViewModel = viewModel(key = "stories-$startId") { StoryViewerViewModel(nav.graph, startId) }
    val stories by vm.stories.collectAsStateWithLifecycle()
    val plans by vm.plans.collectAsStateWithLifecycle()
    val c = Pc.colors

    // Light status-bar icons over the photo; restored on leave.
    val view = LocalView.current
    val dark = Pc.isDark
    DisposableEffect(Unit) {
        val window = (view.context as? Activity)?.window
        val ctl = window?.let { WindowCompat.getInsetsController(it, view) }
        ctl?.isAppearanceLightStatusBars = false
        ctl?.isAppearanceLightNavigationBars = false
        onDispose { ctl?.isAppearanceLightStatusBars = !dark; ctl?.isAppearanceLightNavigationBars = !dark }
    }

    if (stories.isEmpty()) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            Text("Loading stories…", style = Pc.type.small, color = Color.White)
        }
        return
    }
    var postIdx by rememberSaveable { mutableIntStateOf(-1) }
    if (postIdx < 0) postIdx = stories.indexOfFirst { it.id == startId }.coerceAtLeast(0)
    postIdx = postIdx.coerceIn(0, stories.lastIndex)
    var mediaIdx by rememberSaveable(postIdx) { mutableIntStateOf(0) }
    val post = stories[postIdx]
    val media = post.media
    mediaIdx = mediaIdx.coerceIn(0, (media.size - 1).coerceAtLeast(0))

    var text by rememberSaveable { mutableStateOf("") }
    val src = remember { MutableInteractionSource() }
    val typing by src.collectIsFocusedAsState()

    fun next() {
        if (mediaIdx < media.size - 1) mediaIdx++
        else if (postIdx < stories.lastIndex) { postIdx++; mediaIdx = 0 }
        else nav.back()
    }
    fun prev() {
        if (mediaIdx > 0) mediaIdx--
        else if (postIdx > 0) { postIdx--; mediaIdx = 0 }
    }

    LaunchedEffect(post.id) { vm.seen(post.id) }
    // A plain timer, not an animation: it must keep running when system animations are off.
    var progress by remember(post.id, mediaIdx) { mutableFloatStateOf(0f) }
    LaunchedEffect(post.id, mediaIdx, typing) {
        if (typing) return@LaunchedEffect
        val totalMs = 6000f
        while (progress < 1f) { kotlinx.coroutines.delay(40); progress = (progress + 40f / totalMs).coerceAtMost(1f) }
        next()
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        ProgressiveImage(media.getOrNull(mediaIdx), Modifier.fillMaxSize(), post.title)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.45f), 0.22f to Color.Transparent, 0.6f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.65f))))
        // Tap left third = back, elsewhere = next.
        Box(Modifier.fillMaxSize().pointerInput(postIdx, mediaIdx) {
            detectTapGestures { o -> if (o.x < size.width / 3f) prev() else next() }
        }.semantics { contentDescription = "Story ${postIdx + 1} of ${stories.size}. Tap the left edge for the previous photo, anywhere else for the next." })

        Column(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 8.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                repeat(media.size.coerceAtLeast(1)) { i ->
                    val f = when { i < mediaIdx -> 1f; i == mediaIdx -> progress; else -> 0f }
                    Box(Modifier.weight(1f).height(3.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.35f))) {
                        Box(Modifier.fillMaxHeight().fillMaxWidth(f).background(Color.White))
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable { if (post.author.username.isNotBlank()) nav.to(Routes.profile(post.author.username)) }, verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(38.dp).clip(CircleShape).background(Color.White).padding(2.dp)) { Avatar(post.author, 34.dp) }
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(post.author.firstName, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold, fontSize = 14.sp), color = Color.White)
                            Text("  · ${Fmt.ago(post.createdAt)}", style = Pc.type.small, color = Color.White.copy(alpha = 0.8f))
                        }
                        val place = post.trip?.title ?: post.place?.name
                        if (place != null) Row(verticalAlignment = Alignment.CenterVertically) {
                            PcIcon(PcIcons.PinFilled, null, tint = Color.White, size = 12.dp)
                            Spacer(Modifier.width(3.dp))
                            Text(place, style = Pc.type.small.copy(fontSize = 12.5.sp), color = Color.White.copy(alpha = 0.92f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                IconTap(PcIcons.Close, "Close stories", { nav.back() }, tint = Color.White)
            }
        }

        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding().padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val caption = post.title ?: post.body.take(90)
            if (caption.isNotBlank()) Text(caption, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold, fontSize = 16.sp), color = Color.White,
                modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(Color(0x6B0B1A15)).padding(horizontal = 14.dp, vertical = 10.dp))
            val t = post.trip
            val plan = plans[post.author.id]
            when {
                t != null -> StoryLink(
                    lead = { MiniArc(t.seatsTotal ?: 0, (t.seatsTotal ?: 0) - (t.seatsLeft ?: 0), size = 38.dp) },
                    title = "${t.title} · ${Fmt.dayMonth(t.nextDeparture)}",
                    sub = listOfNotNull(t.seatsLeft?.let { "$it seats left" }, com.unsolo.app.data.MoneyFormat.rupees(t.priceFromPaise)).joinToString(" · "),
                    cta = "Take a seat →", onClick = { nav.to(Routes.trip(t.slug)) },
                )
                plan != null -> StoryLink(
                    lead = { MiniArc(plan.spotsTotal ?: plan.seats.size, plan.memberCount, size = 38.dp, women = plan.audience == "women") },
                    title = plan.title ?: "Plan",
                    sub = "${post.author.firstName}'s next plan · ${((plan.spotsTotal ?: 0) - plan.memberCount).coerceAtLeast(0)} spots",
                    cta = "Join →", onClick = { nav.to(Routes.post(plan.id)) },
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f).height(48.dp).clip(CircleShape).background(Color(0x6B0B1A15)).border(1.dp, Color.White.copy(alpha = 0.35f), CircleShape).padding(horizontal = 16.dp), contentAlignment = Alignment.CenterStart) {
                    if (text.isEmpty()) Text("Reply to ${post.author.firstName}…", style = Pc.type.body.copy(fontSize = 14.sp), color = Color.White.copy(alpha = 0.85f))
                    BasicTextField(text, { text = it.take(1000) }, singleLine = true, textStyle = Pc.type.body.copy(color = Color.White, fontSize = 14.sp), cursorBrush = SolidColor(Color.White),
                        interactionSource = src, modifier = Modifier.fillMaxWidth())
                }
                if (text.isNotBlank()) {
                    Spacer(Modifier.width(6.dp))
                    SendButton(true) { if (nav.requirePhone()) { vm.reply(post.id, text.trim()); text = "" } }
                } else {
                    val loved = ReactionKind.LOVE in post.myReactions
                    val wants = ReactionKind.WANT_TO_GO in post.myReactions
                    QuickReact(if (loved) PcIcons.HeartFilled else PcIcons.Heart, if (loved) "Loved" else "Love", if (loved) c.rose else Color.White) { if (nav.requirePhone()) vm.react(post.id, ReactionKind.LOVE) }
                    QuickReact(if (wants) PcIcons.PinFilled else PcIcons.Pin, if (wants) "You want to go" else "Want to go", if (wants) c.gold else Color.White) { if (nav.requirePhone()) vm.react(post.id, ReactionKind.WANT_TO_GO) }
                }
            }
        }
    }
}

@Composable
private fun StoryLink(lead: @Composable () -> Unit, title: String, sub: String, cta: String, onClick: () -> Unit) {
    val c = Pc.colors
    Row(Modifier.clip(RoundedCornerShape(18.dp)).background(c.raised).clickable(role = Role.Button, onClick = onClick).padding(start = 8.dp, end = 12.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        lead()
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f, fill = false)) {
            Text(title, style = Pc.type.smallStrong.copy(fontWeight = FontWeight.Bold, fontSize = 13.5.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(sub, style = Pc.type.label.copy(fontWeight = FontWeight.Medium), color = c.ink2, maxLines = 1)
        }
        Spacer(Modifier.width(10.dp))
        Text(cta, style = Pc.type.smallStrong.copy(fontWeight = FontWeight.ExtraBold), color = c.pine, maxLines = 1)
    }
}

@Composable
private fun QuickReact(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Box(Modifier.padding(start = 6.dp).size(48.dp).clip(CircleShape).background(Color(0x6B0B1A15)).clickable(role = Role.Button, onClickLabel = label, onClick = onClick), contentAlignment = Alignment.Center) {
        PcIcon(icon, label, tint = tint, size = 24.dp)
    }
}
