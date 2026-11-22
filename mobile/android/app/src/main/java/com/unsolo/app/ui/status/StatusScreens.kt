package com.unsolo.app.ui.status

import android.app.Activity
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
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
                RailItem(me, "Your story", mine?.items?.size ?: 1, 0, mine = mine == null, plus = true) {
                    if (!nav.requirePhone()) return@RailItem
                    if (mine != null) nav.to(Routes.status(mine.user.id)) else nav.to(Routes.statusNew())
                }
            }
            items(others, key = { it.user.id }) { a ->
                RailItem(a.user, a.user.firstName, a.items.size, a.items.count { it.seen }) { nav.to(Routes.status(a.user.id)) }
            }
        }
    }
}

@Composable
private fun RailItem(user: UserLite?, label: String, segments: Int, seen: Int, mine: Boolean = false, plus: Boolean = false, onClick: () -> Unit) {
    val c = Pc.colors
    Column(Modifier.width(62.dp).clip(RoundedCornerShape(14.dp)).clickable(role = Role.Button, onClickLabel = "Open $label", onClick = onClick).padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        StoryRing(user, segments, seen, mine = mine, plus = plus, size = 58.dp)
        Spacer(Modifier.height(5.dp))
        Text(label, style = Pc.type.label, color = if (plus) c.ink else c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
    LaunchedEffect(authorId) { if (rail.none { it.user.id == authorId }) single = repo.forUser(authorId); loaded = true }
    val authors = remember(rail, single) { if (rail.any { it.user.id == authorId }) rail.filter { it.items.isNotEmpty() } else listOfNotNull(single) }
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
    val drop = remember { androidx.compose.animation.core.Animatable(0f) }
    Box(Modifier.fillMaxSize().background(Color.Black).pointerInput(Unit) {
        detectVerticalDragGestures(
            onDragEnd = { scope.launch { if (drop.value > 260f) nav.back() else drop.animateTo(0f) } },
            onDragCancel = { scope.launch { drop.animateTo(0f) } },
        ) { ch, dy -> if (dy > 0 || drop.value > 0) { ch.consume(); scope.launch { drop.snapTo((drop.value + dy).coerceAtLeast(0f)) } } }
    }) {
        HorizontalPager(pager, Modifier.fillMaxSize().graphicsLayer { translationY = drop.value; val s = 1f - (drop.value / 3000f); scaleX = s; scaleY = s }, key = { authors[it].user.id }) { page ->
            val a = authors[page]
            StatusPlayer(
                author = a, active = pager.currentPage == page, own = a.user.id == meId, nav = nav,
                onDone = { scope.launch { if (page < authors.lastIndex) pager.animateScrollToPage(page + 1) else nav.back() } },
                onBack = { scope.launch { if (page > 0) pager.animateScrollToPage(page - 1) } },
            )
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
    var progress by remember(author.user.id, idx) { mutableFloatStateOf(0f) }
    // The clock starts only once the photo is on screen (text stories start at once).
    var ready by remember(item.id) { mutableStateOf(item.type != "image" || item.media == null) }
    val scope = rememberCoroutineScope()
    fun next() { if (idx < items.lastIndex) idx++ else onDone() }
    fun prev() { if (idx > 0) idx-- else onBack() }
    LaunchedEffect(active, item.id) { if (active && !own) repo.markSeen(author.user.id, item.id) }
    LaunchedEffect(active, item.id, paused, confirmDelete, ready, picker, commentsOpen) {
        if (!active || paused || confirmDelete || !ready || picker || commentsOpen) return@LaunchedEffect
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
                Text(item.caption.orEmpty(), style = Pc.type.display.copy(fontSize = 26.sp), color = Color.White, textAlign = TextAlign.Center)
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
            }
        }
        // Actions sit at the bottom, in thumb reach.
        if (picker) Row(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 78.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.7f)).padding(horizontal = 8.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            StatusReactions.forEach { (k, e) ->
                Text(e, fontSize = 28.sp, modifier = Modifier.clip(CircleShape).background(if (item.myReaction == k) Color.White.copy(alpha = 0.25f) else Color.Transparent)
                    .clickable(onClickLabel = reactionLabel(k)) { picker = false; if (nav.requirePhone()) scope.launch { repo.react(item, k) } }.padding(6.dp))
            }
        }
        Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(horizontal = 6.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            StoryAction(PcIcons.Close, "Close") { nav.back() }
            Spacer(Modifier.weight(1f))
            // Tap: "Take me there" (or take your reaction back). Hold: pick another.
            val mine = item.myReaction
            val total = item.reactions.values.sum()
            Column(Modifier.clip(RoundedCornerShape(14.dp)).combinedClickableCompat(
                onClick = { if (nav.requirePhone()) scope.launch { repo.react(item, mine ?: "wanderlust") } },
                onLongClick = { picker = !picker },
            ).padding(horizontal = 12.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(StatusReactions.toMap()[mine] ?: "🏔️", fontSize = 22.sp, modifier = Modifier.graphicsLayer { alpha = if (mine == null) 0.85f else 1f })
                Text(if (total > 0) "$total" else if (mine == null) "React" else reactionLabel(mine), style = Pc.type.label, color = Color.White.copy(alpha = 0.9f))
            }
            StoryAction(PcIcons.Chat, if (item.commentCount > 0) "${item.commentCount}" else "Comment") { commentsOpen = true }
            if (own) {
                StoryAction(PcIcons.Plus, "Add") { nav.to(Routes.statusNew()) }
                StoryAction(PcIcons.Trash, "Delete") { confirmDelete = true }
            }
            StoryAction(PcIcons.Share, "Share") {
                nav.share(if (own) "My story on UnSOLO: https://unsolo.in/profile/${author.user.username}" else "${author.user.firstName}'s story on UnSOLO: https://unsolo.in/profile/${author.user.username}")
            }
        }
        item.caption?.takeIf { item.type == "image" }?.let {
            Text(it, style = Pc.type.bodyStrong, color = Color.White, textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(start = 20.dp, end = 20.dp, bottom = 84.dp)
                    .clip(RoundedCornerShape(16.dp)).background(Color(0x6B111111)).padding(horizontal = 14.dp, vertical = 10.dp))
        }
        if (own) Text("Disappears ${expiresIn(item.expiresAt)} · saved on this phone", style = Pc.type.label, color = Color.White.copy(alpha = 0.75f),
            modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 64.dp))
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
    var list by remember(item.id) { mutableStateOf<List<StatusComment>?>(null) }
    var text by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(item.id) { list = (repo.comments(item.id) as? com.unsolo.app.core.net.ApiResult.Ok)?.value?.items ?: emptyList() }
    PcSheet(onDismiss) {
        SheetTitle("Comments")
        if (own && item.reactions.isNotEmpty()) Row(Modifier.padding(horizontal = Gutter, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatusReactions.forEach { (k, e) -> item.reactions[k]?.let { n -> Text("$e $n", style = Pc.type.bodyStrong, color = c.ink) } }
        }
        Column(Modifier.padding(horizontal = Gutter).heightIn(max = 360.dp).verticalScrollCompat(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when {
                list == null -> androidx.compose.material3.CircularProgressIndicator(Modifier.size(22.dp), color = c.ink2, strokeWidth = 2.dp)
                list!!.isEmpty() -> Text("No comments yet. Say something kind.", style = Pc.type.body, color = c.ink2)
                else -> list!!.forEach { cm ->
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
                        is com.unsolo.app.core.net.ApiResult.Ok -> { list = (list ?: emptyList()) + r.value; text = "" }
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
    val scope = rememberCoroutineScope()
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
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (photos.isNotEmpty()) Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color(0x99111111)).padding(horizontal = 16.dp, vertical = 12.dp)) {
                if (caption.isEmpty()) Text("Add a caption…", style = Pc.type.body, color = Color.White.copy(alpha = 0.6f))
                BasicTextField(caption, { caption = it.take(500) }, textStyle = Pc.type.body.copy(color = Color.White), cursorBrush = SolidColor(Color.White), modifier = Modifier.fillMaxWidth())
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconTap(PcIcons.Camera, "Add photos", { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, tint = Color.White,
                    modifier = Modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.16f)))
                AudienceChip("Everyone", audience == "all") { audience = "all" }
                AudienceChip("Followers", audience == "followers") { audience = "followers" }
                Spacer(Modifier.weight(1f))
                PcButton("Share", {
                    scope.launch {
                        val err = repo.share(photos.toList(), caption, audience)
                        if (err == null) { nav.graph.events.emit(AppEvent.Message("Shared. It disappears in 24 hours and stays in your archive.")); nav.back() }
                        else nav.graph.events.emit(AppEvent.Message(err))
                    }
                }, kind = BtnKind.Accent, enabled = photos.isNotEmpty() || caption.isNotBlank(), loading = posting)
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
