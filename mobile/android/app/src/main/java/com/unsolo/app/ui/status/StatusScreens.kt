package com.unsolo.app.ui.status

import android.app.Activity
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.unsolo.app.core.model.*
import com.unsolo.app.data.AppEvent
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import kotlinx.coroutines.launch
import java.io.File
import kotlin.math.abs

// ---------------- Rail ----------------

/**
 * The stories row: "Your story" first (adds one, or plays yours), then people with something new,
 * then the rest. Shown at the top of Tribe and on Explore. Hidden entirely when [hideWhenEmpty] and
 * nobody has a story.
 */
@Composable
fun StatusRail(nav: AppNav, modifier: Modifier = Modifier, hideWhenEmpty: Boolean = false, title: String? = null) {
    val repo = nav.graph.statuses
    val rail by repo.rail.collectAsStateWithLifecycle()
    val upload by repo.upload.collectAsStateWithLifecycle()
    val me = nav.graph.account.me.collectAsStateWithLifecycle().value?.user
    val signedIn by nav.graph.account.isSignedIn.collectAsStateWithLifecycle()
    LaunchedEffect(signedIn) { if (signedIn) repo.refresh() }
    val mine = rail.firstOrNull { it.user.id == me?.id }
    val others = rail.filter { it.user.id != me?.id }
    if (hideWhenEmpty && others.isEmpty() && mine == null) return
    Column(modifier) {
        if (title != null) SectionHeader(title, trailing = if (signedIn) "Archive" else null, trailingLink = { nav.to(Routes.STATUS_ARCHIVE) })
        LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            item(key = "mine") {
                val label = when { upload?.error != null -> "Tap to retry"; upload != null -> "Sharing ${(upload!!.progress * 100).toInt()}%"; else -> "Your story" }
                RailItem(me, label, mine?.items?.size ?: 1, 0, mine = mine == null, plus = true, progress = upload?.progress, failed = upload?.error != null) {
                    openMyStory(nav, me, mine)
                }
            }
            items(others, key = { it.user.id }) { a ->
                RailItem(a.user, a.user.firstName, a.items.size, a.items.count { it.seen }) { nav.to(Routes.status(a.user.id)) }
            }
        }
    }
}

@Composable
private fun RailItem(user: UserLite?, label: String, segments: Int, seen: Int, mine: Boolean = false, plus: Boolean = false,
                     progress: Float? = null, failed: Boolean = false, onClick: () -> Unit) {
    val c = Pc.colors
    Column(Modifier.width(62.dp).clip(RoundedCornerShape(14.dp)).clickable(role = Role.Button, onClickLabel = "Open $label", onClick = onClick).padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        StoryRing(user, segments, seen, mine = mine, plus = plus, size = 58.dp, progress = progress, failed = failed)
        Spacer(Modifier.height(5.dp))
        Text(label, style = Pc.type.label, color = if (failed) c.red else if (plus) c.ink else c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** An avatar with a story ring when [userId] has live stories; tap plays them, otherwise [onClick]. */
@Composable
fun StatusAvatar(nav: AppNav, user: UserLite, size: Dp, onClick: (() -> Unit)? = null) {
    val repo = nav.graph.statuses
    var author by remember(user.id) { mutableStateOf<StatusAuthor?>(null) }
    val rail by repo.rail.collectAsStateWithLifecycle()
    LaunchedEffect(user.id, rail) { author = repo.forUser(user.id) }
    val a = author
    if (a != null && a.items.isNotEmpty()) {
        Box(Modifier.clip(CircleShape).clickable(onClickLabel = "Play ${user.firstName}'s stories") { nav.to(Routes.status(user.id)) }) {
            StoryRing(user, a.items.size, a.items.count { it.seen }, size = size)
        }
    } else Box(Modifier.clip(CircleShape).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)) { Avatar(user, size) }
}

/**
 * Your own avatar on the You page: the upload ring while a story goes up, a retry when it failed,
 * your story ring when you have some (tap to play), otherwise a "+" that opens the composer.
 */
@Composable
fun MyStoryAvatar(nav: AppNav, user: UserLite, size: Dp) {
    val repo = nav.graph.statuses
    val rail by repo.rail.collectAsStateWithLifecycle()
    val upload by repo.upload.collectAsStateWithLifecycle()
    LaunchedEffect(user.id) { if (rail.none { it.user.id == user.id }) repo.refresh() }
    val mine = rail.firstOrNull { it.user.id == user.id }?.takeIf { it.items.isNotEmpty() }
    val u = upload
    val label = when { u?.error != null -> "Retry your story"; u != null -> "Your story is going up"; mine != null -> "Play your stories"; else -> "Add to your story" }
    Box(Modifier.clip(CircleShape).clickable(onClickLabel = label) { openMyStory(nav, user, mine) }) {
        StoryRing(user, mine?.items?.size ?: 1, 0, size = size, mine = mine == null, plus = mine == null, progress = u?.progress, failed = u?.error != null)
    }
}

/** What tapping "Your story" does: retry a failed one, wait for one going up, play yours, or start one. */
fun openMyStory(nav: AppNav, user: UserLite?, mine: StatusAuthor?) {
    val repo = nav.graph.statuses
    val u = repo.upload.value
    if (!nav.requirePhone()) return
    when {
        u?.error != null -> repo.retryUpload()
        u != null -> nav.graph.events.emit(AppEvent.Message("Your story is going up. We'll tell you when it's done."))
        mine != null && user != null -> nav.to(Routes.status(user.id))
        else -> nav.to(Routes.statusNew())
    }
}

// ---------------- Viewer ----------------

/**
 * Full-screen stories, person by person: tap right/left for next/previous, hold to pause, swipe
 * sideways for the next person, swipe down to close. Yours show a delete button.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun StatusViewerScreen(authorId: String, nav: AppNav) {
    val repo = nav.graph.statuses
    val rail by repo.rail.collectAsStateWithLifecycle()
    val meId = nav.graph.account.me.collectAsStateWithLifecycle().value?.user?.id
    // A person outside the rail (opened from their profile) plays on their own.
    var single by remember { mutableStateOf<StatusAuthor?>(null) }
    var loaded by remember { mutableStateOf(false) }
    // Everyone in the stories row plays in order, so swiping sideways moves to the next or previous
    // person, even when you started from someone's profile.
    LaunchedEffect(authorId) {
        if (rail.isEmpty()) repo.refresh()
        if (repo.rail.value.none { it.user.id == authorId }) single = repo.forUser(authorId)
        loaded = true
    }
    val authors = remember(rail, single) {
        val live = rail.filter { it.items.isNotEmpty() }
        if (live.any { it.user.id == authorId }) live else listOfNotNull(single) + live
    }
    DarkBars()
    if (authors.isEmpty()) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            Text(if (loaded) "This story has expired" else "Loading…", style = Pc.type.body, color = Color.White)
        }
        if (loaded) LaunchedEffect(Unit) { kotlinx.coroutines.delay(900); nav.back() }
        return
    }
    val start = authors.indexOfFirst { it.user.id == authorId }.coerceAtLeast(0)
    val pager = rememberPagerState(initialPage = start) { authors.size }
    val scope = rememberCoroutineScope()
    // Down closes; up opens your gallery to add a story.
    val drop = remember { androidx.compose.animation.core.Animatable(0f) }
    val tickUp = rememberTick()
    Box(Modifier.fillMaxSize().background(Color.Black).pointerInput(Unit) {
        detectVerticalDragGestures(
            onDragEnd = {
                scope.launch {
                    when {
                        drop.value > 260f -> nav.back()
                        drop.value < -220f -> { tickUp(); drop.animateTo(0f); if (nav.requirePhone()) nav.to(Routes.statusNew()) }
                        else -> drop.animateTo(0f)
                    }
                }
            },
            onDragCancel = { scope.launch { drop.animateTo(0f) } },
        ) { ch, dy -> ch.consume(); scope.launch { drop.snapTo((drop.value + if (drop.value < 0 || dy < 0 && drop.value <= 0) dy * 0.5f else dy).coerceIn(-400f, 2000f)) } }
    }) {
        HorizontalPager(pager, Modifier.fillMaxSize().graphicsLayer { translationY = drop.value.coerceAtLeast(0f) + drop.value.coerceAtMost(0f) * 0.4f; val s = 1f - (kotlin.math.abs(drop.value) / 3000f); scaleX = s; scaleY = s },
            key = { authors[it].user.id }, beyondViewportPageCount = 1) { page ->
            val a = authors[page]
            // A cube turn between people, like flipping to the next one's stories.
            val offset = (pager.currentPage - page) + pager.currentPageOffsetFraction
            Box(Modifier.fillMaxSize().graphicsLayer {
                cameraDistance = 12f * density
                transformOrigin = androidx.compose.ui.graphics.TransformOrigin(if (offset < 0) 0f else 1f, 0.5f)
                rotationY = (-offset * 75f).coerceIn(-90f, 90f)
            }) {
            StatusPlayer(
                author = a, active = pager.currentPage == page, own = a.user.id == meId, nav = nav,
                onDone = { scope.launch { if (page < authors.lastIndex) pager.animateScrollToPage(page + 1) else nav.back() } },
                onBack = { scope.launch { if (page > 0) pager.animateScrollToPage(page - 1) } },
            )
            }
        }
        // Swipe-up hint while dragging up.
        if (drop.value < -40f) Column(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 120.dp).graphicsLayer { alpha = (-drop.value / 220f).coerceIn(0f, 1f) },
            horizontalAlignment = Alignment.CenterHorizontally) {
            PcIcon(PcIcons.ChevronUp, null, tint = Color.White, size = 28.dp)
            Text(if (drop.value < -220f) "Let go to add a story" else "Swipe up to add a story", style = Pc.type.bodyStrong, color = Color.White)
        }
    }
}

@Composable
private fun StatusPlayer(author: StatusAuthor, active: Boolean, own: Boolean, nav: AppNav, onDone: () -> Unit, onBack: () -> Unit) {
    val repo = nav.graph.statuses
    val items = author.items
    if (items.isEmpty()) return
    // Start at the first one you haven't seen.
    var idx by remember(author.user.id) { mutableIntStateOf(items.indexOfFirst { !it.seen }.takeIf { it >= 0 } ?: 0) }
    idx = idx.coerceIn(0, items.lastIndex)
    val item = items[idx]
    var paused by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var picker by remember { mutableStateOf(false) }
    var commentsOpen by remember { mutableStateOf(false) }
    var typing by remember { mutableStateOf(false) }
    var draft by rememberSaveable(item.id) { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    val bursts = remember { mutableStateListOf<EmojiBurst>() }
    val focus = androidx.compose.ui.platform.LocalFocusManager.current
    val tick = rememberTick(strong = true)
    var progress by remember(author.user.id, idx) { mutableFloatStateOf(0f) }
    // The clock starts only once the photo is on screen (text stories start at once).
    var ready by remember(item.id) { mutableStateOf(item.type != "image" || item.media == null) }
    val scope = rememberCoroutineScope()
    fun next() { if (idx < items.lastIndex) idx++ else onDone() }
    fun prev() { if (idx > 0) idx-- else onBack() }
    LaunchedEffect(active, item.id) { if (active && !own) repo.markSeen(author.user.id, item.id) }
    LaunchedEffect(active, item.id) { if (active) repo.prefetchComments(item) }
    LaunchedEffect(active, item.id, paused, confirmDelete, ready, picker, commentsOpen, typing) {
        if (!active || paused || confirmDelete || !ready || picker || commentsOpen || typing) return@LaunchedEffect
        while (progress < 1f) { kotlinx.coroutines.delay(40); progress = (progress + 40f / 5500f).coerceAtMost(1f) }
        next()
    }
    Box(Modifier.fillMaxSize()) {
        if (item.type == "image" && item.media != null) {
            val url = item.media.url
            coil3.compose.AsyncImage(url, item.caption, Modifier.fillMaxSize(), contentScale = ContentScale.Fit,
                onSuccess = { ready = true }, onError = { ready = true })
            if (!ready) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                // Low-res preview behind the spinner when we have one.
                item.media.thumbUrl?.let { coil3.compose.AsyncImage(it, null, Modifier.fillMaxSize().graphicsLayer { alpha = 0.5f }, contentScale = ContentScale.Fit) }
                androidx.compose.material3.CircularProgressIndicator(Modifier.size(36.dp), color = Color.White, strokeWidth = 3.dp)
            }
        } else {
            Box(Modifier.fillMaxSize().background(Color(0xFF1A1A2E)).padding(32.dp), contentAlignment = Alignment.Center) {
                Text(mentionText(item.caption.orEmpty()) { nav.to(Routes.profile(it)) }, style = Pc.type.display.copy(fontSize = 26.sp), color = Color.White, textAlign = TextAlign.Center)
            }
        }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.5f), 0.18f to Color.Transparent, 0.7f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.55f))))
        Box(Modifier.fillMaxSize().pointerInput(item.id) {
            detectTapGestures(
                onPress = { paused = true; tryAwaitRelease(); paused = false },
                onTap = { o -> if (o.x < size.width / 3f) prev() else next() },
            )
        })
        Column(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 8.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                items.indices.forEach { i ->
                    val f = when { i < idx -> 1f; i == idx -> progress; else -> 0f }
                    Box(Modifier.weight(1f).height(3.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.35f))) {
                        Box(Modifier.fillMaxHeight().fillMaxWidth(f).background(Color.White))
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable { if (author.user.username.isNotBlank()) nav.to(Routes.profile(author.user.username)) }, verticalAlignment = Alignment.CenterVertically) {
                    Avatar(author.user, 36.dp)
                    Spacer(Modifier.width(10.dp))
                    Text(if (own) "Your story" else author.user.firstName, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = Color.White)
                    Text("  · ${Fmt.ago(item.createdAt)}", style = Pc.type.small, color = Color.White.copy(alpha = 0.8f))
                }
                IconTap(PcIcons.Close, "Close", { nav.back() }, tint = Color.White)
            }
        }
        // Instagram-style: actions stacked on the right, a full-width comment bar along the bottom.
        val mine = item.myReaction
        val total = item.reactions.values.sum()
        fun react(k: String) {
            if (!nav.requirePhone()) return
            val adding = mine != k
            tick()
            if (adding) bursts += EmojiBurst(System.nanoTime(), StatusReactions.toMap()[k] ?: "🏔️")
            scope.launch { repo.react(item, k) }
        }
        item.caption?.takeIf { item.type == "image" }?.let {
            Text(mentionText(it) { u -> nav.to(Routes.profile(u)) }, style = Pc.type.bodyStrong, color = Color.White,
                modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().navigationBarsPadding().imePadding().padding(start = 14.dp, end = 76.dp, bottom = 74.dp)
                    .clip(RoundedCornerShape(16.dp)).background(Color(0x6B111111)).padding(horizontal = 14.dp, vertical = 10.dp))
        }
        Column(Modifier.align(Alignment.BottomEnd).navigationBarsPadding().imePadding().padding(end = 6.dp, bottom = 72.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            // Tap: "Take me there" (or take your reaction back). Hold: pick another.
            Column(Modifier.clip(RoundedCornerShape(14.dp)).combinedClickableCompat(onClick = { react(mine ?: "wanderlust") }, onLongClick = { tick(); picker = !picker })
                .padding(horizontal = 10.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                val pop by androidx.compose.animation.core.animateFloatAsState(if (mine != null) 1.15f else 1f, androidx.compose.animation.core.spring(dampingRatio = 0.35f, stiffness = 500f), label = "pop")
                Text(StatusReactions.toMap()[mine] ?: "🏔️", fontSize = 26.sp, modifier = Modifier.graphicsLayer { alpha = if (mine == null) 0.85f else 1f; scaleX = pop; scaleY = pop })
                Text(if (total > 0) "$total" else "React", style = Pc.type.label, color = Color.White.copy(alpha = 0.9f))
            }
            StoryAction(PcIcons.Chat, if (item.commentCount > 0) "${item.commentCount}" else "Comments") { commentsOpen = true }
            if (own) {
                StoryAction(PcIcons.Plus, "Add") { nav.to(Routes.statusNew()) }
                StoryAction(PcIcons.Trash, "Delete") { confirmDelete = true }
            }
            StoryAction(PcIcons.Share, "Share") {
                nav.share(if (own) "My story on UnSOLO: https://unsolo.in/profile/${author.user.username}" else "${author.user.firstName}'s story on UnSOLO: https://unsolo.in/profile/${author.user.username}")
            }
        }
        if (picker) Row(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().imePadding().padding(bottom = 70.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.75f)).padding(horizontal = 8.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            StatusReactions.forEach { (k, e) ->
                Text(e, fontSize = 30.sp, modifier = Modifier.clip(CircleShape).background(if (mine == k) Color.White.copy(alpha = 0.25f) else Color.Transparent)
                    .clickable(onClickLabel = reactionLabel(k)) { picker = false; react(k) }.padding(6.dp))
            }
        }
        // Comment bar
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding().padding(horizontal = 12.dp, vertical = 10.dp)) {
            if (own && !typing) Text("Disappears ${expiresIn(item.expiresAt)} · saved on this phone", style = Pc.type.label, color = Color.White.copy(alpha = 0.7f), modifier = Modifier.padding(start = 6.dp, bottom = 6.dp))
            Row(Modifier.fillMaxWidth().clip(CircleShape).border(1.dp, Color.White.copy(alpha = 0.55f), CircleShape).background(Color.Black.copy(alpha = 0.25f))
                .padding(start = 18.dp, end = 6.dp).heightIn(min = 46.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) {
                    if (draft.isEmpty()) Text(if (own) "Add a comment…" else "Reply to ${author.user.firstName}…", style = Pc.type.body, color = Color.White.copy(alpha = 0.75f))
                    BasicTextField(draft, { draft = it.take(500) }, textStyle = Pc.type.body.copy(color = Color.White), cursorBrush = SolidColor(Color.White), maxLines = 3,
                        modifier = Modifier.fillMaxWidth().onFocusChanged { typing = it.isFocused })
                }
                if (draft.isNotBlank()) {
                    if (sending) androidx.compose.material3.CircularProgressIndicator(Modifier.padding(10.dp).size(20.dp), color = Color.White, strokeWidth = 2.dp)
                    else IconTap(PcIcons.Send, "Send", {
                        if (!nav.requirePhone()) return@IconTap
                        sending = true
                        scope.launch {
                            when (repo.comment(item.id, draft)) {
                                is com.unsolo.app.core.net.ApiResult.Ok -> { tick(); draft = ""; focus.clearFocus(); nav.graph.events.emit(AppEvent.Message("Comment sent")) }
                                else -> nav.graph.events.emit(AppEvent.Message("Couldn't send that. Try again."))
                            }
                            sending = false
                        }
                    }, tint = Color.White)
                } else {
                    Text("🏔️", fontSize = 22.sp, modifier = Modifier.clip(CircleShape).clickable(onClickLabel = "Take me there") { react("wanderlust") }.padding(10.dp))
                }
            }
        }
        FloatingEmojis(bursts, Modifier.fillMaxSize()) { done -> bursts.removeAll { it.id == done } }
    }
    if (commentsOpen) StatusCommentsSheet(item, own, nav) { commentsOpen = false }
    if (confirmDelete) PcSheet({ confirmDelete = false }) {
        SheetTitle("Delete this story?")
        Text("It stops showing right away. Your copy stays in your archive on this phone.", style = Pc.type.body, color = Pc.colors.ink2, modifier = Modifier.padding(horizontal = Gutter))
        Spacer(Modifier.height(16.dp))
        Row(Modifier.padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PcButton("Keep", { confirmDelete = false }, Modifier.weight(1f), kind = BtnKind.Outline)
            PcButton("Delete", {
                scope.launch {
                    val wasLast = items.size == 1
                    if (repo.delete(item.id)) { confirmDelete = false; if (wasLast) nav.back() }
                    else nav.graph.events.emit(AppEvent.Message("Couldn't delete it. Try again."))
                }
            }, Modifier.weight(1f), kind = BtnKind.Danger)
        }
    }
}

/** One reaction's flurry of emojis. */
data class EmojiBurst(val id: Long, val emoji: String)

/**
 * The reaction you tapped floats up the screen: a dozen copies rising from the react button,
 * drifting sideways, growing and fading out.
 */
@Composable
private fun FloatingEmojis(bursts: List<EmojiBurst>, modifier: Modifier, onDone: (Long) -> Unit) {
    Box(modifier) {
        bursts.forEach { b ->
            key(b.id) {
                val rnd = remember { kotlin.random.Random(b.id) }
                val parts = remember { List(12) { Triple(rnd.nextFloat(), rnd.nextFloat(), rnd.nextInt(0, 380)) } }
                val t = remember { androidx.compose.animation.core.Animatable(0f) }
                LaunchedEffect(Unit) { t.animateTo(1f, androidx.compose.animation.core.tween(1900, easing = androidx.compose.animation.core.LinearOutSlowInEasing)); onDone(b.id) }
                androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
                    val w = constraints.maxWidth.toFloat(); val h = constraints.maxHeight.toFloat()
                    parts.forEach { (dx, sz, delay) ->
                        val local = ((t.value * 1900f - delay) / 1500f).coerceIn(0f, 1f)
                        if (local > 0f && local < 1f) Text(b.emoji, fontSize = (24 + sz * 22).sp, modifier = Modifier.graphicsLayer {
                            translationX = w * 0.82f - (dx * w * 0.75f) * local + kotlin.math.sin(local * 9f + dx * 6f) * 24f
                            translationY = h * 0.78f - local * h * (0.55f + sz * 0.3f)
                            alpha = if (local < 0.15f) local / 0.15f else 1f - ((local - 0.6f) / 0.4f).coerceIn(0f, 1f)
                            val sc = 0.6f + local * 0.7f; scaleX = sc; scaleY = sc
                            rotationZ = (dx - 0.5f) * 40f * local
                        })
                    }
                }
            }
        }
    }
}

/** Story reactions: "Take me there" (a traveller's love) first. */
val StatusReactions = listOf("wanderlust" to "🏔️", "love" to "❤️", "wow" to "😮", "haha" to "😂", "clap" to "👏", "fire" to "🔥")
private fun reactionLabel(k: String) = when (k) { "wanderlust" -> "Take me there"; "love" -> "Love"; "wow" -> "Wow"; "haha" -> "Haha"; "clap" -> "Clap"; else -> "Fire" }

@OptIn(ExperimentalFoundationApi::class)
private fun Modifier.combinedClickableCompat(onClick: () -> Unit, onLongClick: () -> Unit) = this.combinedClickable(onClick = onClick, onLongClick = onLongClick)

/** Comments on a story: everyone who can see it sees them. Your own shows the reactions breakdown on top. */
@Composable
private fun StatusCommentsSheet(item: StatusItem, own: Boolean, nav: AppNav, onDismiss: () -> Unit) {
    val repo = nav.graph.statuses
    val c = Pc.colors
    val cached by repo.comments.collectAsStateWithLifecycle()
    var fetched by remember(item.id) { mutableStateOf(false) }
    // The saved copy shows at once; a fresh one replaces it quietly. Nothing to load when there are none.
    val list = cached[item.id] ?: if (fetched || item.commentCount == 0) emptyList() else null
    var text by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(item.id) { repo.loadComments(item.id); fetched = true }
    PcSheet(onDismiss) {
        SheetTitle("Comments")
        if (own && item.reactions.isNotEmpty()) Row(Modifier.padding(horizontal = Gutter, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatusReactions.forEach { (k, e) -> item.reactions[k]?.let { n -> Text("$e $n", style = Pc.type.bodyStrong, color = c.ink) } }
        }
        Column(Modifier.padding(horizontal = Gutter).heightIn(max = 360.dp).verticalScrollCompat(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when {
                list == null -> androidx.compose.material3.CircularProgressIndicator(Modifier.size(22.dp), color = c.ink2, strokeWidth = 2.dp)
                list.isEmpty() -> Text("No comments yet. Say something kind.", style = Pc.type.body, color = c.ink2)
                else -> list.forEach { cm ->
                    Row {
                        Avatar(cm.author, 30.dp); Spacer(Modifier.width(10.dp))
                        Column {
                            Row { Text(cm.author.firstName, style = Pc.type.smallStrong, color = c.ink); Text("  ${Fmt.ago(cm.createdAt)}", style = Pc.type.label, color = c.ink3) }
                            Text(cm.body, style = Pc.type.body, color = c.ink)
                        }
                    }
                }
            }
        }
        Row(Modifier.padding(horizontal = Gutter, vertical = 12.dp).imePadding(), verticalAlignment = Alignment.CenterVertically) {
            BoxedInput(text, { text = it.take(500) }, "Add a comment…", Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            PcButton("Send", {
                if (!nav.requirePhone()) return@PcButton
                sending = true
                scope.launch {
                    when (val r = repo.comment(item.id, text)) {
                        is com.unsolo.app.core.net.ApiResult.Ok -> { text = "" }
                        else -> nav.graph.events.emit(AppEvent.Message("Couldn't post that. Try again."))
                    }
                    sending = false
                }
            }, kind = BtnKind.Accent, height = BtnSmall, enabled = text.isNotBlank(), loading = sending)
        }
    }
}

@Composable
private fun Modifier.verticalScrollCompat() = this.verticalScroll(androidx.compose.foundation.rememberScrollState())

@Composable
private fun StoryAction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Column(Modifier.clip(RoundedCornerShape(14.dp)).clickable(onClickLabel = label, onClick = onClick).padding(horizontal = 12.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        PcIcon(icon, null, size = 22.dp, tint = Color.White)
        Text(label, style = Pc.type.label, color = Color.White.copy(alpha = 0.9f))
    }
}

private fun expiresIn(iso: String): String {
    val ms = runCatching { java.time.Instant.parse(iso).toEpochMilli() - System.currentTimeMillis() }.getOrDefault(0L)
    val h = ms / 3_600_000
    return when { h >= 1 -> "in ${h}h"; ms > 60_000 -> "in ${ms / 60_000}m"; else -> "soon" }
}

@Composable
private fun DarkBars() {
    val view = LocalView.current
    val dark = Pc.isDark
    DisposableEffect(Unit) {
        val ctl = (view.context as? Activity)?.window?.let { WindowCompat.getInsetsController(it, view) }
        ctl?.isAppearanceLightStatusBars = false; ctl?.isAppearanceLightNavigationBars = false
        onDispose { ctl?.isAppearanceLightStatusBars = !dark; ctl?.isAppearanceLightNavigationBars = !dark }
    }
}

// ---------------- Compose ----------------

/**
 * Share a story: up to 10 photos (from the gallery or your archive), an optional caption, who can
 * see it. Opens the photo picker straight away; text-only works too.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun StatusComposeScreen(nav: AppNav, archiveId: String?) {
    val repo = nav.graph.statuses
    val c = Pc.colors
    val posting by repo.posting.collectAsStateWithLifecycle()
    val photos = remember { mutableStateListOf<Uri>() }
    var caption by rememberSaveableString()
    var audience by remember { mutableStateOf("all") }
    var tagging by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        uris.forEach { if (photos.size < 10 && it !in photos) photos += it }
    }
    var asked by remember { mutableStateOf(false) }
    LaunchedEffect(archiveId) {
        if (archiveId != null) {
            repo.loadArchive()
            repo.archive.value.firstOrNull { it.id == archiveId }?.let { a -> photos += Uri.fromFile(File(a.path)); if (caption.isBlank()) caption = a.caption.orEmpty() }
        } else if (!asked) { asked = true; picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    }
    DarkBars()
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (photos.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(28.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                BasicTextField(caption, { caption = it.take(500) }, textStyle = Pc.type.display.copy(fontSize = 26.sp, color = Color.White, textAlign = TextAlign.Center),
                    cursorBrush = SolidColor(Color.White), modifier = Modifier.fillMaxWidth(),
                    decorationBox = { inner -> Box(contentAlignment = Alignment.Center) { if (caption.isEmpty()) Text("Type a story, or add photos", style = Pc.type.display.copy(fontSize = 24.sp), color = Color.White.copy(alpha = 0.5f), textAlign = TextAlign.Center); inner() } })
            }
        } else {
            val pager = rememberPagerState { photos.size }
            HorizontalPager(pager, Modifier.fillMaxSize()) { i ->
                Box(Modifier.fillMaxSize()) {
                    coil3.compose.AsyncImage(photos[i], null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                    IconTap(PcIcons.Close, "Remove this photo", { photos.removeAt(i) }, tint = Color.White,
                        modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 56.dp, end = 8.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.4f)))
                }
            }
            if (photos.size > 1) Text("${pager.currentPage + 1} / ${photos.size}", style = Pc.type.label, color = Color.White,
                modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 18.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 10.dp, vertical = 4.dp))
        }
        Row(Modifier.statusBarsPadding().padding(horizontal = 4.dp, vertical = 4.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconTap(PcIcons.Close, "Cancel", { nav.back() }, tint = Color.White)
            Spacer(Modifier.weight(1f))
            PcButton("Archive", { nav.to(Routes.STATUS_ARCHIVE) }, kind = BtnKind.Ghost, height = BtnSmall)
        }
        if (tagging) PeoplePickerSheet(nav, onDismiss = { tagging = false }) { u ->
            tagging = false
            caption = (caption.trimEnd().let { if (it.isEmpty()) it else "$it " } + "@${u.username} ").take(500)
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // Typing @name suggests people; picking one finishes the mention.
            MentionSuggestions(caption, nav) { start, u -> caption = (caption.substring(0, start) + "@${u.username} ").take(500) }
            if (photos.isNotEmpty()) Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color(0x99111111)).padding(horizontal = 16.dp, vertical = 12.dp)) {
                if (caption.isEmpty()) Text("Add a caption…", style = Pc.type.body, color = Color.White.copy(alpha = 0.6f))
                BasicTextField(caption, { caption = it.take(500) }, textStyle = Pc.type.body.copy(color = Color.White), cursorBrush = SolidColor(Color.White), modifier = Modifier.fillMaxWidth())
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconTap(PcIcons.Camera, "Add photos", { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, tint = Color.White,
                    modifier = Modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.16f)))
                AudienceChip("@ Tag people", false) { tagging = true }
                val tagged = extractMentions(caption).size
                if (tagged > 0) Text("$tagged tagged", style = Pc.type.label, color = Color.White.copy(alpha = 0.75f))
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AudienceChip("Everyone", audience == "all") { audience = "all" }
                AudienceChip("Followers", audience == "followers") { audience = "followers" }
                Spacer(Modifier.weight(1f))
                PcButton("Share", {
                    // Goes up in the background: the ring on "Your story" shows how far, a message says when it's done.
                    if (repo.shareInBackground(photos.toList(), caption, audience)) {
                        nav.graph.events.emit(AppEvent.Message(if (photos.isEmpty()) "Sharing your story…" else "Sharing your story… you can keep using the app."))
                        nav.back()
                    }
                }, kind = BtnKind.Accent, enabled = (photos.isNotEmpty() || caption.isNotBlank()) && !posting)
            }
        }
    }
}

// ---------------- Mentions ----------------

/** `@username` anywhere in a caption (not inside an email). */
private val MENTION_RE = Regex("(^|[^A-Za-z0-9_.@\\-])@([A-Za-z0-9_][A-Za-z0-9_.\\-]{0,39})")
/** An `@name` being typed at the end of the caption. */
private val MENTION_TAIL = Regex("(^|\\s)@([A-Za-z0-9_.\\-]{0,40})$")

private fun extractMentions(text: String) = MENTION_RE.findAll(text).map { it.groupValues[2].trimEnd('.', '-').lowercase() }.filter { it.isNotEmpty() }.toSet()

/** The caption with each @username bold and tappable (opens their profile). */
private fun mentionText(text: String, onMention: (String) -> Unit): androidx.compose.ui.text.AnnotatedString = androidx.compose.ui.text.buildAnnotatedString {
    var last = 0
    for (m in MENTION_RE.findAll(text)) {
        val at = m.range.first + m.groupValues[1].length
        val name = m.groupValues[2].trimEnd('.', '-')
        if (name.isEmpty()) continue
        append(text.substring(last, at))
        withLink(androidx.compose.ui.text.LinkAnnotation.Clickable("m:$name",
            androidx.compose.ui.text.TextLinkStyles(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.Bold, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline))) { onMention(name) }) {
            append("@$name")
        }
        last = at + 1 + name.length
    }
    append(text.substring(last))
}

/** People matching the @name being typed, in a row above the caption. Tapping one finishes it ([onPick] gets where the @ starts). */
@Composable
private fun MentionSuggestions(caption: String, nav: AppNav, onPick: (Int, UserLite) -> Unit) {
    val m = MENTION_TAIL.find(caption)
    val q = m?.groupValues?.get(2).orEmpty()
    var hits by remember { mutableStateOf<List<UserLite>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { nav.graph.statuses.warmPeople() }
    LaunchedEffect(m != null, q) {
        if (m == null || q.isEmpty()) { hits = emptyList(); return@LaunchedEffect }
        // People we already know show at once; the server's answer fills in a moment later.
        hits = nav.graph.statuses.peopleNow(q)
        searching = true
        kotlinx.coroutines.delay(120)
        hits = nav.graph.statuses.people(q)
        searching = false
    }
    if (m == null) return
    val start = m.range.first + m.groupValues[1].length
    when {
        q.isEmpty() -> Text("Type a name or username to mention someone", style = Pc.type.small, color = Color.White.copy(alpha = 0.7f))
        hits.isEmpty() -> Text(if (searching) "Looking for “$q”…" else "No one called “$q” on UnSOLO", style = Pc.type.small, color = Color.White.copy(alpha = 0.7f))
        else -> LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(hits, key = { it.id }) { u -> PersonChip(u) { onPick(start, u) } }
        }
    }
}

@Composable
private fun PersonChip(u: UserLite, onClick: () -> Unit) {
    Row(Modifier.clip(CircleShape).background(Color(0xCC111111)).clickable(onClickLabel = "Mention ${u.name}", onClick = onClick).padding(start = 4.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Avatar(u, 28.dp); Spacer(Modifier.width(8.dp))
        Column {
            Text(u.name, style = Pc.type.smallStrong, color = Color.White, maxLines = 1)
            Text("@${u.username}", style = Pc.type.label, color = Color.White.copy(alpha = 0.7f), maxLines = 1)
        }
    }
}

/** Search people on UnSOLO by name or username and pick one to tag. */
@Composable
private fun PeoplePickerSheet(nav: AppNav, onDismiss: () -> Unit, onPick: (UserLite) -> Unit) {
    val c = Pc.colors
    var q by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<UserLite>?>(emptyList()) }
    LaunchedEffect(Unit) { nav.graph.statuses.warmPeople() }
    LaunchedEffect(q) {
        val t = q.trim().removePrefix("@")
        if (t.isEmpty()) { hits = emptyList(); return@LaunchedEffect }
        hits = nav.graph.statuses.peopleNow(t).ifEmpty { null }
        kotlinx.coroutines.delay(120)
        hits = nav.graph.statuses.people(t)
    }
    PcSheet(onDismiss) {
        SheetTitle("Tag people")
        BoxedInput(q, { q = it.take(40) }, "Search by name or username", Modifier.padding(horizontal = Gutter).fillMaxWidth())
        Column(Modifier.padding(horizontal = Gutter, vertical = 10.dp).heightIn(min = 120.dp, max = 360.dp).verticalScrollCompat(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val list = hits
            when {
                list == null -> androidx.compose.material3.CircularProgressIndicator(Modifier.size(22.dp), color = c.ink2, strokeWidth = 2.dp)
                q.isBlank() -> Text("Find travellers to mention. They'll get a notification if they can see your story.", style = Pc.type.small, color = c.ink2)
                list.isEmpty() -> Text("No one called “${q.trim()}” on UnSOLO", style = Pc.type.body, color = c.ink2)
                else -> list.forEach { u ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClickLabel = "Tag ${u.name}") { onPick(u) }.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Avatar(u, 38.dp); Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(u.name, style = Pc.type.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("@${u.username}", style = Pc.type.small, color = c.ink2, maxLines = 1)
                        }
                        if (u.isIdVerified) VerifiedMark()
                    }
                }
            }
        }
    }
}

@Composable
private fun rememberSaveableString(): MutableState<String> = androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf("") }

@Composable
private fun AudienceChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(label, style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = if (selected) Color.Black else Color.White,
        modifier = Modifier.clip(CircleShape).background(if (selected) Color.White else Color.White.copy(alpha = 0.16f)).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 8.dp))
}

// ---------------- Archive ----------------

/** Stories you've shared from this phone, kept after they disappear. Tap one to share it again. */
@Composable
fun StatusArchiveScreen(nav: AppNav) {
    val repo = nav.graph.statuses
    val list by repo.archive.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { repo.loadArchive() }
    val c = Pc.colors
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Story archive", onBack = { nav.back() }, headerActions = false)
        if (list.isEmpty()) {
            EmptyState("Nothing archived yet", "Stories you share are kept here on your phone after they disappear, so you can share them again.")
            return
        }
        Text("Only on this phone. Tap one to share it again.", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(horizontal = Gutter, vertical = 6.dp))
        LazyVerticalGrid(GridCells.Fixed(3), Modifier.fillMaxSize(), contentPadding = PaddingValues(2.dp)) {
            items(list, key = { it.id }) { a ->
                Box(Modifier.padding(2.dp).aspectRatio(9f / 16f).clip(RoundedCornerShape(8.dp)).clickable(onClickLabel = "Share again") { nav.to(Routes.statusNew(a.id)) }) {
                    coil3.compose.AsyncImage(File(a.path), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    Text(Fmt.ago(java.time.Instant.ofEpochMilli(a.postedAt).toString()), style = Pc.type.label, color = Color.White,
                        modifier = Modifier.align(Alignment.BottomStart).padding(6.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 8.dp, vertical = 2.dp))
                }
            }
        }
    }
}
