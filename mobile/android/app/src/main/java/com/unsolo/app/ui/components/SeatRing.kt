package com.unsolo.app.ui.components

import com.unsolo.app.core.util.SeatStage
import com.unsolo.app.core.util.SeatCopy
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.unsolo.app.core.model.Media
import com.unsolo.app.core.model.Seat
import com.unsolo.app.core.model.SeatState
import com.unsolo.app.core.model.UserLite
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/*
 * The seat ring: N arc segments around a circular centre (trip photo, organiser face or a tinted
 * disc). Geometry follows `ring()` in .oil-ui/full-circle/mockups.html and
 * docs/revamp/design-system.md exactly. Angles: degrees, 0 = 3 o'clock, clockwise.
 */

enum class YouSeat { None, You, Held }

/** Badge pill on top of the ring: the host (gold "HOST") or a plan's organiser (ink "ORGANISER"). */
@Immutable
data class RingBadge(val user: UserLite?, val organiser: Boolean = false)

/** Pure ring geometry in dp. Unit-tested in SeatRingGeometryTest. */
@Immutable
data class RingGeometry(val size: Float, val n: Int, val badge: Boolean) {
    val pad: Float = if (size < 90f) max(3f, size * 0.06f) else max(14f, size * 0.085f)
    val r: Float = size / 2f - pad
    val wT: Float = max(4f, size * 0.05f)
    val wO: Float = max(2f, size * 0.016f)
    private val segLen0: Float = (2f * PI.toFloat() * r) / n.coerceAtLeast(1)
    private val d0: Float = max(12f, min(size * 0.14f, segLen0 * 0.6f))
    val hostGap: Float = if (badge) min(150f, Math.toDegrees(2.0 * asin(min(1.0, ((36f + d0 / 2f + 4f) / r).toDouble()))).toFloat()) else 0f
    val span: Float = 360f - hostGap
    val seg: Float = span / n.coerceAtLeast(1)
    val gap: Float = min(6f, seg * 0.24f)
    val start: Float = -90f + hostGap / 2f
    val segLen: Float = 2f * PI.toFloat() * r * seg / 360f
    /** Seat-dot diameter; dots are drawn only when this is ≥ 14. */
    val d: Float = max(12f, min(size * 0.12f, segLen * 0.5f))
    val showDots: Boolean get() = d >= 14f
    /** Centre disc radius. */
    val r0: Float = max(2f, r - wT / 2f - (if (size < 90f) max(2f, size * 0.05f) else max(6f, size * 0.045f)))
    /** Top of the badge pill. */
    val badgeTop: Float = pad - 13f

    fun a0(i: Int) = start + i * seg + gap / 2f
    fun a1(i: Int) = a0(i) + seg - gap
    fun mid(i: Int) = (a0(i) + a1(i)) / 2f
    val trackStart get() = start + gap / 2f
    val trackSweep get() = span - gap

    /** Point on a circle of radius [rad] around the centre, in dp. */
    fun point(angle: Float, rad: Float = r): Pair<Float, Float> {
        val a = Math.toRadians(angle.toDouble())
        return (size / 2f + rad * cos(a).toFloat()) to (size / 2f + rad * sin(a).toFloat())
    }
}

/** "8 of 12 spots open" / "Full, 12 of 12 spots taken". */
fun ringA11y(total: Int, filled: Int, plan: Boolean = false): String {
    val unit = "spots"
    return if (total > 0 && filled >= total) "Full, $total of $total $unit taken" else "${(total - filled).coerceAtLeast(0)} of $total $unit open"
}

/** The text line every ring is paired with. */
fun ringCaption(total: Int, filled: Int): AnnotatedString = buildAnnotatedString {
    val b = SpanStyle(fontWeight = FontWeight.Bold)
    val left = (total - filled).coerceAtLeast(0)
    // Group size only once half the spots are gone (SeatCopy).
    when (SeatCopy.stage(total, left)) {
        SeatStage.Open -> { withStyle(b) { append("Be first in the circle") }; append(" · ${SeatCopy.short(total, left)}") }
        SeatStage.Full -> withStyle(b) { append("Full") }
        SeatStage.Going -> withStyle(b) { append("$filled going") }
        SeatStage.Filling -> { withStyle(b) { append(SeatCopy.short(total, left)) }; append(" · $filled going") }
    }
}

/** Plans: "2 going · 3 spots". */
fun planCaption(total: Int, going: Int): AnnotatedString = buildAnnotatedString {
    val open = (total - going).coerceAtLeast(0)
    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(SeatCopy.short(total, open)) }
}

/** What a ring needs from a seat list. */
@Immutable
data class RingData(
    val total: Int,
    val taken: Int,
    val you: YouSeat,
    val people: List<UserLite?>,
    val waiting: UserLite?,
    val me: UserLite?,
    /** You hold a seat, so you may see co-travellers' faces. */
    val coTraveller: Boolean,
) {
    val filled get() = taken + if (you != YouSeat.None) 1 else 0
    val full get() = total in 1..filled
}

/**
 * Seats → ring. Host / organiser / members are taken (host first); YOU becomes the gold arc,
 * HELD the dashed one. A request from [meId] waits outside the ring; other people's requests
 * still count as open seats.
 */
fun ringFromSeats(seats: List<Seat>, meId: String? = null, seatsTotal: Int? = null): RingData {
    // Hosted trips: /trips/{slug} lists the host as an extra seat (seatsTotal + 1). The host is the badge,
    // not a seat, so drop that entry only when the list is longer than the trip's seat count.
    @Suppress("NAME_SHADOWING")
    val seats = if (seatsTotal != null && seats.size > seatsTotal) seats.filter { it.state != SeatState.HOST } else seats
    val taken = seats.filter { it.state == SeatState.HOST || it.state == SeatState.ORGANISER }.map { it.user } +
        seats.filter { it.state == SeatState.MEMBER }.map { it.user }
    val youSeat = seats.firstOrNull { it.state == SeatState.YOU }
    val held = seats.any { it.state == SeatState.HELD }
    val waiting = seats.firstOrNull { it.state == SeatState.REQUESTED && it.user != null && it.user.id == meId }?.user
    return RingData(
        total = seats.size, taken = taken.size,
        you = if (youSeat != null) YouSeat.You else if (held) YouSeat.Held else YouSeat.None,
        people = taken, waiting = waiting, me = youSeat?.user, coTraveller = youSeat != null,
    )
}

fun ringFromCounts(total: Int?, left: Int?): RingData {
    val t = (total ?: 0).coerceAtLeast(0)
    val l = (left ?: 0).coerceIn(0, t)
    return RingData(t, t - l, YouSeat.None, emptyList(), null, null, false)
}

/** Seat list from counts only (TripLite gives seatsLeft/seatsTotal, not seats). */
fun seatsFromCounts(total: Int?, left: Int?, hostFirst: Boolean = true): List<Seat> {
    val t = (total ?: 0).coerceIn(0, 40)
    val l = (left ?: 0).coerceIn(0, t)
    val taken = t - l
    return List(t) { i ->
        when {
            i == 0 && hostFirst && taken > 0 -> Seat(SeatState.HOST)
            i < taken -> Seat(SeatState.MEMBER)
            else -> Seat(SeatState.OPEN)
        }
    }
}

private fun Color.desaturated(): Color {
    val l = luminance()
    val g = l * 0.85f
    return Color(red * 0.15f + g, green * 0.15f + g, blue * 0.15f + g, alpha)
}

private val grayscale: ColorFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0.15f) })

/**
 * The seat ring. [taken] counts other people's seats; [you] adds your seat after them.
 * Always pair it with [ringCaption] (or [planCaption]) in text next to it.
 */
@Composable
fun SeatRing(
    total: Int,
    taken: Int,
    size: Dp,
    modifier: Modifier = Modifier,
    you: YouSeat = YouSeat.None,
    plan: Boolean = false,
    women: Boolean = false,
    past: Boolean = false,
    people: List<UserLite?> = emptyList(),
    showFaces: Boolean = false,
    me: UserLite? = null,
    photo: Media? = null,
    centerUser: UserLite? = null,
    centerLabel: Pair<String, String>? = null,
    centerLabelSize: Dp? = null,
    centerIcon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    /** Shared centre label: big open count, tiny "/N", and "spots left" / "spot left" / "full". */
    spotsLabel: Boolean = false,
    badge: RingBadge? = null,
    waiting: UserLite? = null,
    dots: Boolean = true,
    animate: Boolean = true,
    spinOnAppear: Boolean = false,
    contentDescription: String? = null,
    onClick: (() -> Unit)? = null,
) {
    val c = Pc.colors
    val reduce = Pc.reduceMotion
    val n = total.coerceAtLeast(1)
    val k = taken.coerceIn(0, n)
    val youOn = you != YouSeat.None && k < n
    val filled = k + if (youOn) 1 else 0
    val full = filled >= n && total > 0
    val g = remember(size, n, badge != null) { RingGeometry(size.value, n, badge != null) }

    val takenCol = when { full -> c.full; women -> c.rose; else -> c.taken }.let { if (past) it.desaturated() else it }
    val openCol = (if (women) c.roseOpen else c.seatOpen).let { if (past) it.desaturated() else it }
    val goldCol = if (past) c.gold.desaturated() else c.gold
    val strokeCol = c.ink

    // Take a seat: your arc draws in (420ms). Reduced motion: it fades in instead.
    val youDraw = remember(you) { Animatable(if (animate && youOn && !reduce) 0f else 1f) }
    val youFade = remember(you) { Animatable(if (animate && youOn && reduce) 0f else 1f) }
    LaunchedEffect(you) {
        if (youOn && youDraw.value < 1f) youDraw.animateTo(1f, tween(420, delayMillis = 120, easing = FastOutSlowInEasing))
        if (youOn && youFade.value < 1f) youFade.animateTo(1f, tween(PcTokens.motionStandard))
    }
    // Full circle: one spin (700ms) when the last seat fills (or on appear when asked).
    var wasFull by remember { mutableStateOf(full && !spinOnAppear) }
    val spin = remember { Animatable(0f) }
    LaunchedEffect(full) {
        if (full && !wasFull && animate && !reduce) {
            spin.snapTo(-180f)
            spin.animateTo(0f, tween(700, easing = FastOutSlowInEasing))
        }
        wasFull = full
    }
    val heldAlpha = if (you == YouSeat.Held && !reduce) {
        val t = rememberInfiniteTransition(label = "held")
        t.animateFloat(0.55f, 1f, infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "pulse").value
    } else 1f

    val a11y = contentDescription ?: ringA11y(total, filled, plan)
    Box(
        modifier
            .size(size)
            .semantics(mergeDescendants = true) { this.contentDescription = a11y }
            .then(if (onClick != null) Modifier.clip(CircleShape).clickable(role = Role.Button, onClickLabel = "See who's going", onClick = onClick) else Modifier)
            .then(if (past) Modifier.alpha(0.75f) else Modifier),
    ) {
        // Centre: photo, organiser face, or a tinted disc.
        val discSize = (g.r0 * 2f).dp
        Box(Modifier.align(Alignment.Center).size(discSize).clip(CircleShape).background(if (full) c.goldBg else c.tonal)) {
            when {
                photo != null -> ProgressiveImage(photo, Modifier.fillMaxSize(), colorFilter = if (past) grayscale else null)
                centerUser?.avatarUrl != null -> AsyncImage(ImageRequest.Builder(LocalContext.current).data(centerUser.avatarUrl).build(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, colorFilter = if (past) grayscale else null)
                centerUser != null && centerLabel == null -> Text(centerUser.initials, style = Pc.type.numLarge.copy(fontSize = (g.r0 * 0.6f).coerceIn(10f, 40f).sp), color = c.ink2, modifier = Modifier.align(Alignment.Center))
            }
        }

        // Arcs, seat circles and dots spin together.
        Box(Modifier.fillMaxSize().graphicsLayer { rotationZ = spin.value }) {
            Canvas(Modifier.fillMaxSize()) {
                val px = density
                fun arc(color: Color, a0: Float, sweep: Float, width: Float, dashed: Boolean = false, alpha: Float = 1f) {
                    if (sweep <= 0f) return
                    val rr = g.r * px
                    drawArc(
                        color = color, startAngle = a0, sweepAngle = sweep, useCenter = false, alpha = alpha,
                        topLeft = Offset(center.x - rr, center.y - rr), size = Size(rr * 2, rr * 2),
                        style = Stroke(width * px, cap = StrokeCap.Round, pathEffect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(6f * px, 6f * px)) else null),
                    )
                }
                if (!plan) arc(openCol, g.trackStart, g.trackSweep, g.wO)
                for (i in 0 until n) {
                    val st = when { i < k -> 1; i == k && youOn -> 2; else -> 0 }
                    val a0 = g.a0(i); val sweep = g.a1(i) - a0
                    when (st) {
                        0 -> if (plan) {
                            val (x, y) = g.point(g.mid(i))
                            val rad = max(6f, g.d * 0.34f) * px
                            drawCircle(c.raised, rad, Offset(x * px, y * px))
                            drawCircle(openCol, rad, Offset(x * px, y * px), style = Stroke(2.5f * px))
                        }
                        // Trips: consecutive taken spots are one continuous arc (drawn once, at the run's first segment).
                        1 -> if (!plan) { if (i == 0) arc(takenCol, g.a0(0), g.a1(k - 1) - g.a0(0), g.wT) }
                            else if (!(dots && g.showDots && people.getOrNull(i) != null)) {
                                // Plans are dots, not arcs. Below dot size a filled circle keeps taken seats visible.
                                val (x, y) = g.point(g.mid(i))
                                drawCircle(takenCol, max(4.5f, g.d * 0.34f) * px, Offset(x * px, y * px))
                            }
                        else -> {
                            val sw = sweep * youDraw.value
                            val al = youFade.value * heldAlpha
                            arc(strokeCol, a0, sw, g.wT + 3f, dashed = you == YouSeat.Held, alpha = al)
                            arc(goldCol, a0, sw, g.wT, dashed = you == YouSeat.Held, alpha = al)
                        }
                    }
                }
            }
            // Seat dots: faces for co-travellers, initials for signed-in viewers, nothing when anonymous.
            if (dots && g.showDots) {
                for (i in 0 until n) {
                    val isYou = i == k && youOn
                    val person = if (isYou) me else if (i < k) people.getOrNull(i) else null
                    if (!isYou && person == null) continue
                    if (i > k || (i == k && !youOn)) continue
                    val (x, y) = g.point(g.mid(i))
                    val dd = g.d
                    Box(
                        Modifier
                            .offset((x - dd / 2f - 2f).dp, (y - dd / 2f - 2f).dp)
                            .size((dd + 4f).dp)
                            .alpha(if (isYou) youDraw.value * youFade.value else 1f)
                            .clip(CircleShape)
                            .background(if (isYou) strokeCol else c.raised)
                            .padding(2.dp)
                            .clip(CircleShape)
                            .background(if (isYou) goldCol else takenCol),
                        contentAlignment = Alignment.Center,
                    ) {
                        val url = person?.avatarUrl
                        if (url != null && (showFaces || isYou)) {
                            AsyncImage(ImageRequest.Builder(LocalContext.current).data(url).build(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, colorFilter = if (past) grayscale else null)
                        } else {
                            val label = if (isYou) "You" else person?.initials.orEmpty()
                            Text(label, style = Pc.type.label.copy(fontSize = max(8f, dd * (if (isYou) 0.3f else 0.36f)).sp, fontWeight = FontWeight.Bold),
                                color = if (isYou) c.onGold else if (full || women) Color.White else c.raised, maxLines = 1, softWrap = false)
                        }
                    }
                }
            }
        }

        // Centre label: big number + small word, on a pill scrim when it sits over a photo.
        if (centerLabel != null) {
            val fs = (centerLabelSize?.value ?: (size.value * 0.2f))
            val onPhoto = photo != null || centerUser?.avatarUrl != null
            Column(
                Modifier.align(Alignment.Center)
                    .then(if (onPhoto) Modifier.clip(RoundedCornerShape(28.dp)).background(c.raised.copy(alpha = 0.9f)).padding(horizontal = if (size.value >= 120f) 18.dp else 12.dp, vertical = 8.dp) else Modifier),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (centerIcon != null) PcIcon(centerIcon, null, tint = c.ink2, size = (if (size.value < 120f) 13f else 20f).dp)
                Text(centerLabel.first, style = Pc.type.numLarge.copy(fontSize = fs.sp, lineHeight = (fs * 0.98f).sp), color = c.ink, textAlign = TextAlign.Center, maxLines = 1)
                if (centerLabel.second.isNotBlank()) Text(centerLabel.second, style = Pc.type.smallStrong.copy(fontSize = (if (size.value < 120f) 11f else 13f).sp, lineHeight = 14.sp), color = c.ink2, textAlign = TextAlign.Center, maxLines = 1)
            }
        }

        if (spotsLabel) SpotsCount(open = (n - filled).coerceAtLeast(0), total = total, full = full, discDp = g.r0 * 2f,
            onPhoto = photo != null || centerUser?.avatarUrl != null, modifier = Modifier.align(Alignment.Center))

        // Host / organiser badge at the top.
        if (badge != null) {
            Row(
                Modifier.align(Alignment.TopCenter).offset(y = g.badgeTop.dp).height(26.dp).clip(CircleShape)
                    .background(if (badge.organiser) c.raised else c.gold).border(1.5.dp, if (badge.organiser) c.ink else c.onGold, CircleShape)
                    .padding(start = 3.dp, end = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Avatar(badge.user, 20.dp)
                Spacer(Modifier.width(5.dp))
                Text(if (badge.organiser) "ORGANISER" else "HOST", style = Pc.type.code, color = if (badge.organiser) c.ink else c.onGold, maxLines = 1, softWrap = false)
            }
        }

        // Requested: your face waits outside the ring at -28°, radius R+30, with a clock badge.
        if (waiting != null) {
            val slide = remember { Animatable(if (animate && !reduce) 1f else 0f) }
            LaunchedEffect(Unit) { slide.animateTo(0f, tween(PcTokens.motionStamp, easing = FastOutSlowInEasing)) }
            val bob = if (!reduce) rememberInfiniteTransition(label = "bob").animateFloat(0f, -3f, infiniteRepeatable(tween(1200), RepeatMode.Reverse), label = "y").value else 0f
            val (wx, wy) = g.point(-28f, g.r + 30f + 24f * slide.value)
            Box(Modifier.offset((wx - 20f).dp, (wy - 20f + bob).dp).size(40.dp).alpha(1f - slide.value)) {
                Box(Modifier.fillMaxSize().clip(CircleShape).background(strokeCol).padding(1.5.dp).clip(CircleShape).background(c.paper).padding(2.5.dp)) { Avatar(waiting, 33.dp) }
                Box(Modifier.align(Alignment.BottomEnd).offset(6.dp, 6.dp).size(22.dp).clip(CircleShape).background(c.paper).padding(2.dp).clip(CircleShape).background(c.gold), contentAlignment = Alignment.Center) {
                    PcIcon(PcIcons.Clock, null, tint = c.onGold, size = 12.dp)
                }
            }
        }
    }
}

/** Convenience: draw a ring from [RingData]. */
@Composable
fun SeatRing(
    data: RingData,
    size: Dp,
    modifier: Modifier = Modifier,
    plan: Boolean = false,
    women: Boolean = false,
    past: Boolean = false,
    photo: Media? = null,
    centerUser: UserLite? = null,
    centerLabel: Pair<String, String>? = null,
    centerLabelSize: Dp? = null,
    centerIcon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    spotsLabel: Boolean = false,
    badge: RingBadge? = null,
    dots: Boolean = true,
    animate: Boolean = true,
    spinOnAppear: Boolean = false,
    onClick: (() -> Unit)? = null,
) = SeatRing(
    total = data.total, taken = data.taken, size = size, modifier = modifier, you = data.you, plan = plan, women = women, past = past,
    people = data.people, showFaces = data.coTraveller, me = data.me, photo = photo, centerUser = centerUser, centerLabel = centerLabel,
    centerLabelSize = centerLabelSize, centerIcon = centerIcon, spotsLabel = spotsLabel, badge = badge, waiting = data.waiting, dots = dots, animate = animate, spinOnAppear = spinOnAppear, onClick = onClick,
)

/** A ring sitting on a surface-coloured disc (for overlapping photos). */
@Composable
fun RingMount(modifier: Modifier = Modifier, pad: Dp = 5.dp, color: Color = Pc.colors.raised, content: @Composable () -> Unit) {
    Box(modifier.clip(CircleShape).background(color).padding(pad), contentAlignment = Alignment.Center) { content() }
}

/**
 * Mini arc for lists (44dp): a thin open circle with a 5dp progress arc from 12 o'clock and
 * "k/n" in the centre.
 */
@Composable
fun MiniArc(total: Int, taken: Int, modifier: Modifier = Modifier, size: Dp = PcTokens.ringMini, women: Boolean = false, past: Boolean = false) {
    val c = Pc.colors
    val n = total.coerceAtLeast(1)
    val k = taken.coerceIn(0, n)
    val full = k >= n && total > 0
    val prog = when { full -> c.full; women -> c.rose; else -> c.taken }.let { if (past) it.desaturated() else it }
    val open = (if (women) c.roseOpen else c.seatOpen).let { if (past) it.desaturated() else it }
    Box(modifier.size(size).semantics { contentDescription = "$k of $total spots taken" }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 5.dp.toPx()
            val rr = size.toPx() / 2f - 4.dp.toPx()
            val tl = Offset(this.size.width / 2f - rr, this.size.height / 2f - rr)
            drawCircle(open, rr, center, style = Stroke(2.dp.toPx()))
            if (k > 0) drawArc(prog, -90f, 360f * k / n, false, tl, Size(rr * 2, rr * 2), style = Stroke(stroke, cap = StrokeCap.Round))
        }
        Text(if (past) "$k" else "$k/$total", style = Pc.type.label.copy(fontSize = (if (size < 40.dp) 10f else 11f).sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.02).sp, fontFeatureSettings = "tnum"), color = c.ink, maxLines = 1, softWrap = false)
    }
}

/**
 * Story ring: one arc per story, ink for unseen and rule for seen; yours is a quiet rule2 ring with the yellow +. The avatar
 * sits 6dp inside.
 */
@Composable
fun StoryRing(user: UserLite?, segments: Int, seen: Int, modifier: Modifier = Modifier, size: Dp = 54.dp, mine: Boolean = false, plus: Boolean = false,
              progress: Float? = null, failed: Boolean = false) {
    val c = Pc.colors
    val segs = segments.coerceAtLeast(1)
    if (progress != null || failed) {
        // A story going up: a faint track with the sent part filling clockwise (red when it failed).
        val shown by androidx.compose.animation.core.animateFloatAsState((progress ?: 0f).coerceIn(0.02f, 1f), label = "upload")
        val spin = androidx.compose.animation.core.rememberInfiniteTransition(label = "uploadSpin")
        val pulse by spin.animateFloat(0.55f, 1f, androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(700), androidx.compose.animation.core.RepeatMode.Reverse), label = "pulse")
        Box(modifier.size(size)) {
            Canvas(Modifier.fillMaxSize()) {
                val rr = this.size.width / 2f - 2.5.dp.toPx()
                val tl = Offset(this.size.width / 2f - rr, this.size.height / 2f - rr)
                drawCircle(c.rule, rr, center, style = Stroke(3.dp.toPx()))
                if (failed) drawCircle(c.red, rr, center, style = Stroke(3.dp.toPx()))
                else drawArc(c.pine.copy(alpha = pulse), -90f, 360f * shown, false, tl, Size(rr * 2, rr * 2), style = Stroke(3.dp.toPx(), cap = StrokeCap.Round))
            }
            Avatar(user, size - 12.dp, Modifier.align(Alignment.Center).graphicsLayer { alpha = if (failed) 0.6f else 0.75f })
            Box(Modifier.align(Alignment.BottomEnd).size(21.dp).clip(CircleShape).background(c.paper).padding(2.dp).clip(CircleShape).background(if (failed) c.red else c.pine), contentAlignment = Alignment.Center) {
                if (failed) Text("!", style = Pc.type.label.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Color.White)
                else Text("${((progress ?: 0f) * 100).toInt().coerceIn(0, 99)}", style = Pc.type.label.copy(fontSize = 8.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.onPine)
            }
        }
        return
    }
    Box(modifier.size(size)) {
        Canvas(Modifier.fillMaxSize()) {
            val rr = this.size.width / 2f - 2.5.dp.toPx()
            val tl = Offset(this.size.width / 2f - rr, this.size.height / 2f - rr)
            val gapDeg = if (segs > 1) 9f else 0f
            val span = 360f / segs
            for (i in 0 until segs) {
                val isSeen = !mine && i < seen
                val col = if (mine) c.rule2 else if (isSeen) c.rule else c.ink
                val w = (if (isSeen) 2f else 3f).dp.toPx()
                if (segs == 1) drawCircle(col, rr, center, style = Stroke(w))
                else drawArc(col, -90f + i * span + gapDeg / 2f, span - gapDeg, false, tl, Size(rr * 2, rr * 2), style = Stroke(w, cap = StrokeCap.Round))
            }
        }
        Avatar(user, size - 12.dp, Modifier.align(Alignment.Center))
        if (plus) Box(Modifier.align(Alignment.BottomEnd).size(21.dp).clip(CircleShape).background(c.paper).padding(2.dp).clip(CircleShape).background(c.pine), contentAlignment = Alignment.Center) {
            PcIcon(PcIcons.Plus, null, tint = c.onPine, size = 14.dp)
        }
    }
}



/** "spots left" / "spot left" / "full". */
fun spotsWord(open: Int, full: Boolean) = when { full -> "full"; open == 1 -> "spot left"; else -> "spots left" }

/** The ring's centre words for a trip or plan, as one pair ("4/12", "spots left"; "3", "going"). */
fun spotsPair(total: Int, open: Int): Pair<String, String> = SeatCopy.center(total, open).let { (it.big + (it.of ?: "")) to it.small }

/**
 * The one centre label for trip rings: a big number with a tiny "/N" beside it (0.36×, 60%),
 * and "spots left" / "spot left" / "full" under it. Sized from the disc so it always fits.
 */
@Composable
fun SpotsCount(open: Int, total: Int, full: Boolean, discDp: Float, onPhoto: Boolean, modifier: Modifier = Modifier) {
    val c = Pc.colors
    val big = (discDp * 0.34f).coerceIn(16f, 52f)
    val small = (big * 0.36f).coerceAtLeast(8f)
    val word = (discDp * 0.095f).coerceIn(9f, 14f)
    Column(
        modifier.widthIn(max = (discDp * 0.86f).dp)
            .then(if (onPhoto) Modifier.clip(RoundedCornerShape(22.dp)).background(c.raised.copy(alpha = 0.9f)).padding(horizontal = (discDp * 0.07f).coerceIn(6f, 16f).dp, vertical = (discDp * 0.04f).coerceIn(3f, 8f).dp) else Modifier),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // "12 spots open" → "3 going" → "4/12 spots left" (SeatCopy): the total only once half booked.
        val label = SeatCopy.center(total, if (full) 0 else open)
        Row(verticalAlignment = Alignment.Bottom) {
            Text(label.big, style = Pc.type.numLarge.copy(fontSize = big.sp, lineHeight = (big * 0.98f).sp), color = c.ink, maxLines = 1)
            label.of?.let { Text(it, style = Pc.type.numLarge.copy(fontSize = small.sp, lineHeight = small.sp), color = c.ink.copy(alpha = 0.6f), maxLines = 1,
                modifier = Modifier.padding(start = 1.dp, bottom = (big * 0.12f).dp)) }
        }
        Text(label.small, style = Pc.type.smallStrong.copy(fontSize = word.sp, lineHeight = (word * 1.15f).sp), color = c.ink2, maxLines = 1, softWrap = false)
    }
}
