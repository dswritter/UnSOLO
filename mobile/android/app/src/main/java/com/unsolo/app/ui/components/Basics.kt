package com.unsolo.app.ui.components

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.unsolo.app.core.model.Media
import com.unsolo.app.core.model.UserLite
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens

val LocalDataSaver = staticCompositionLocalOf { false }

/** Page gutter. */
val Gutter = 16.dp

/** Small pill button height (primary is [PcTokens.buttonTall]). */
val BtnSmall = 40.dp

/** Field / inner-block radius (inputs, inline cards inside a 28dp card). */
val RadiusField = 18.dp

// ---------- Surfaces ----------

/** Kept for callers that still pass an alpha; the tonal fill is now its own token. */
const val tonalAlpha = 0.07f

/** Tonal fill (secondary buttons, unselected segments, avatars, centre discs). */
@Composable
fun tonal(): Color = Pc.colors.tonal

/** Card: surface, 28dp radius, 1dp rule border, no shadow (light and dark). */
@Composable
fun Modifier.raisedCard(radius: Dp = PcTokens.radiusCard): Modifier {
    val c = Pc.colors
    val shape = RoundedCornerShape(radius)
    return this.clip(shape).background(c.raised).border(1.dp, c.rule, shape)
}

/** Plan card: surface, 28dp radius, 1dp dashed rule2. Plans are pencilled in. */
@Composable
fun Modifier.pencilledCard(radius: Dp = PcTokens.radiusCard): Modifier =
    this.clip(RoundedCornerShape(radius)).background(Pc.colors.raised).dashedBorder(Pc.colors.rule2, radius = radius, width = 1.dp, on = 5.dp, off = 4.dp)

@Composable
fun Modifier.tonalFill(shape: Shape = RoundedCornerShape(PcTokens.radiusCard)): Modifier = this.clip(shape).background(tonal())

/**
 * Pulls the content up by [by] without leaving a gap below (the ring overlapping a photo's
 * bottom edge). The layout reports its height minus [by].
 */
fun Modifier.overlapUp(by: Dp): Modifier = layout { measurable, constraints ->
    val p = measurable.measure(constraints)
    val dy = by.roundToPx()
    layout(p.width, (p.height - dy).coerceAtLeast(0)) { p.place(0, -dy) }
}

// ---------- Rules ----------

@Composable
fun Hairline(modifier: Modifier = Modifier, color: Color = Pc.colors.rule) {
    Box(modifier.fillMaxWidth().height(PcTokens.hairline).background(color))
}

/** Divider inside a card or list, inset from the start edge. */
@Composable
fun InsetRule(start: Dp = 16.dp, end: Dp = 0.dp) = Hairline(Modifier.padding(start = start, end = end))

@Composable
fun DashedHairline(modifier: Modifier = Modifier, color: Color = Pc.colors.rule2) {
    Canvas(modifier.fillMaxWidth().height(1.dp)) {
        drawLine(color, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = 1.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())))
    }
}

@Composable
fun VerticalRule(color: Color = Pc.colors.rule, dashed: Boolean = false) {
    Canvas(Modifier.fillMaxHeight().width(1.dp)) {
        drawLine(color, Offset(size.width / 2, 0f), Offset(size.width / 2, size.height), strokeWidth = 1.dp.toPx(),
            pathEffect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())) else null)
    }
}

/** Dashed border: plan cards ("pencilled"). Open seats are never dashed. */
fun Modifier.dashedBorder(color: Color, radius: Dp = PcTokens.radiusM, width: Dp = 1.dp, on: Dp = 4.dp, off: Dp = 3.dp) = drawBehind {
    val w = width.toPx()
    drawRoundRect(
        color = color, topLeft = Offset(w / 2, w / 2),
        size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w),
        cornerRadius = CornerRadius(radius.toPx().coerceAtMost(size.minDimension / 2)),
        style = Stroke(width = w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(on.toPx(), off.toPx()))),
    )
}

/** Solid hairline box. */
fun Modifier.ruledBox(color: Color, radius: Dp = PcTokens.radiusM, width: Dp = 1.dp) =
    border(BorderStroke(width, color), RoundedCornerShape(radius))

// ---------- Icons, text ----------

@Composable
fun PcIcon(icon: ImageVector, contentDescription: String?, modifier: Modifier = Modifier, tint: Color = Pc.colors.ink, size: Dp = 22.dp) {
    Icon(icon, contentDescription, modifier.size(size), tint = tint)
}

/** 48dp round icon button. Badges: a count (pine) or a rose dot. */
@Composable
fun IconTap(icon: ImageVector, contentDescription: String, onClick: () -> Unit, modifier: Modifier = Modifier, tint: Color = Pc.colors.ink, badge: Boolean = false, badgeCount: Int = 0, iconSize: Dp = 22.dp) {
    Box(
        modifier.size(PcTokens.touch).clip(CircleShape).clickable(role = Role.Button, onClickLabel = contentDescription, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        PcIcon(icon, contentDescription, tint = tint, size = iconSize)
        if (badgeCount > 0) CountBadge(badgeCount, Modifier.align(Alignment.TopEnd).offset((-2).dp, 6.dp))
        else if (badge) Box(Modifier.align(Alignment.TopEnd).offset((-11).dp, 11.dp).size(10.dp).clip(CircleShape).background(Pc.colors.paper).padding(1.5.dp).clip(CircleShape).background(Pc.colors.rose))
    }
}

/** Round translucent button that sits on photos (back, share, save). 40dp visual, 48dp touch. */
@Composable
fun GlassButton(icon: ImageVector, contentDescription: String, onClick: () -> Unit, modifier: Modifier = Modifier, tint: Color = Pc.colors.ink) {
    Box(modifier.size(PcTokens.touch).clip(CircleShape).clickable(role = Role.Button, onClickLabel = contentDescription, onClick = onClick), contentAlignment = Alignment.Center) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(Pc.colors.raised.copy(alpha = 0.86f)), contentAlignment = Alignment.Center) {
            PcIcon(icon, contentDescription, tint = tint, size = 20.dp)
        }
    }
}

@Composable
fun CountBadge(count: Int, modifier: Modifier = Modifier) {
    Box(
        modifier.defaultMinSize(minWidth = 20.dp, minHeight = 20.dp).clip(CircleShape).background(Pc.colors.pine).padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(if (count > 99) "99+" else "$count", style = Pc.type.label.copy(fontSize = 11.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold), color = Pc.colors.onPine)
    }
}

@Composable
fun LinkText(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, style: TextStyle = Pc.type.bodyStrong) {
    Text(text, style = style.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Pc.colors.pine,
        modifier = modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button, onClick = onClick).defaultMinSize(minHeight = 44.dp).wrapContentHeight())
}

/** Section head: Bricolage 800 title with an optional pine link on the right. */
@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, trailing: String? = null, trailingLink: (() -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(horizontal = Gutter), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = Pc.type.title1.copy(fontSize = 22.sp), color = Pc.colors.ink, modifier = Modifier.weight(1f).padding(vertical = 10.dp))
        if (trailing != null) {
            if (trailingLink != null) LinkText(trailing, trailingLink, style = Pc.type.smallStrong.copy(fontSize = 14.sp))
            else Text(trailing, style = Pc.type.smallStrong, color = Pc.colors.ink2)
        }
    }
}

/** Small uppercase overline (settings section names). */
@Composable
fun Overline(text: String, modifier: Modifier = Modifier, color: Color = Pc.colors.ink2) {
    Text(text.uppercase(), style = Pc.type.code, color = color, modifier = modifier, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

// ---------- Buttons ----------

/**
 * Primary = pine pill · Outline = quiet tonal pill (secondary) · Line = 1.5dp outline ·
 * Ghost = text · Danger = red text.
 */
enum class BtnKind { Primary, Outline, Line, Ghost, Danger }

/**
 * Pill button. [height] is the visual height (52 primary, [BtnSmall] = 40 small); the touch
 * target never drops below 48dp. Press scales to 0.97 (fade only under reduced motion).
 */
@Composable
fun PcButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: BtnKind = BtnKind.Primary,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    height: Dp = PcTokens.buttonTall,
    dashed: Boolean = false,
    leading: (@Composable () -> Unit)? = null,
) {
    val c = Pc.colors
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val reduce = Pc.reduceMotion
    val scale by animateFloatAsState(if (pressed && !reduce) 0.97f else 1f, tween(PcTokens.motionFast), label = "press")
    val bg = when (kind) {
        BtnKind.Primary -> if (enabled) (if (pressed) c.pine.copy(alpha = 0.88f) else c.pine) else c.tonal
        BtnKind.Outline -> if (dashed) Color.Transparent else if (pressed) c.pineSoft else c.tonal
        BtnKind.Line -> if (pressed) c.tonal else Color.Transparent
        BtnKind.Ghost -> if (pressed) c.tonal else Color.Transparent
        BtnKind.Danger -> if (pressed) c.red.copy(alpha = 0.08f) else Color.Transparent
    }
    val fg = when (kind) {
        BtnKind.Primary -> if (enabled) c.onPine else c.ink3
        BtnKind.Danger -> c.red
        BtnKind.Ghost -> if (enabled) c.ink2 else c.ink3
        else -> if (enabled) c.ink else c.ink3
    }
    val shape = RoundedCornerShape(PcTokens.radiusPill)
    val small = height < PcTokens.buttonTall
    Box(
        modifier
            .defaultMinSize(minHeight = PcTokens.touch)
            .clickable(interactionSource = src, indication = null, enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
        propagateMinConstraints = true,
    ) {
        Row(
            Modifier
                .requiredHeight(height)
                .scale(scale)
                .clip(shape)
                .background(bg)
                .then(if (kind == BtnKind.Line) Modifier.border(1.5.dp, if (enabled) c.rule2 else c.rule, shape) else Modifier)
                .then(if (dashed) Modifier.dashedBorder(c.rule2, radius = height / 2, width = 1.5.dp, on = 5.dp, off = 4.dp) else Modifier)
                .padding(horizontal = if (kind == BtnKind.Ghost) 12.dp else if (small) 18.dp else 24.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (leading != null) { leading(); Spacer(Modifier.width(10.dp)) }
            else if (icon != null) { PcIcon(icon, null, tint = fg, size = if (small) 16.dp else 18.dp); Spacer(Modifier.width(8.dp)) }
            Text(text, style = Pc.type.button.copy(fontSize = if (small) 14.sp else 16.sp), color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ---------- Tags ----------

/**
 * Host = gold badge with ink stroke (HOST) · Organiser = surface with ink stroke ·
 * Women = rose + female icon · Verified = pine on tonal + seal · Full = gold on goldBg ·
 * Kind / Author / Muted = quiet tonal.
 */
enum class TagKind { Host, Organiser, Author, Kind, KindDashed, Muted, Women, Verified, Full }

@Composable
fun Tag(text: String, kind: TagKind, modifier: Modifier = Modifier, icon: ImageVector? = null, height: Dp = 24.dp) {
    val c = Pc.colors
    val shape = RoundedCornerShape(PcTokens.radiusPill)
    val badge = kind == TagKind.Host || kind == TagKind.Organiser
    val (bg, fg) = when (kind) {
        TagKind.Host -> c.gold to c.onGold
        TagKind.Organiser -> c.raised to c.ink
        TagKind.Women -> c.roseSoft to c.rose
        TagKind.Verified -> c.tonal to c.pine
        TagKind.Full -> c.goldBg to (if (Pc.isDark) c.full else c.goldInk)
        TagKind.Muted -> c.tonal to c.ink2
        else -> c.tonal to c.ink2
    }
    val stroke = when (kind) {
        TagKind.Host -> c.onGold
        TagKind.Organiser -> c.ink
        TagKind.Full -> c.full
        TagKind.KindDashed -> null
        else -> null
    }
    val ic = icon ?: when (kind) { TagKind.Women -> PcIcons.GenderFemale; TagKind.Verified -> PcIcons.SealCheck; else -> null }
    Row(
        modifier.height(height).clip(shape).background(bg)
            .then(if (stroke != null) Modifier.border(if (badge) 1.5.dp else 1.dp, stroke, shape) else Modifier)
            .padding(horizontal = if (badge) 8.dp else 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (ic != null) { PcIcon(ic, null, tint = fg, size = 14.dp); Spacer(Modifier.width(4.dp)) }
        Text(if (badge) text.uppercase() else text, style = if (badge) Pc.type.code.copy(fontSize = 10.sp) else Pc.type.label.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold),
            color = fg, maxLines = 1, softWrap = false)
    }
}

@Composable
fun VerifiedMark(modifier: Modifier = Modifier) {
    PcIcon(PcIcons.SealCheck, "Verified", modifier, tint = Pc.colors.pine, size = 16.dp)
}

// ---------- Facts row (calendar · clock · wallet) ----------

@Immutable
data class Fact(val icon: ImageVector, val text: String)

@Composable
fun Facts(facts: List<Fact>, modifier: Modifier = Modifier, color: Color = Pc.colors.ink2) {
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        facts.filter { it.text.isNotBlank() }.forEach { f ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                PcIcon(f.icon, null, size = 15.dp, tint = Pc.colors.ink)
                Spacer(Modifier.width(5.dp))
                Text(f.text, style = Pc.type.fact, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** Legacy label/value cells → one facts row (icon chosen from the label). */
@Composable
fun ChartCells(cells: List<Pair<String, String>>, modifier: Modifier = Modifier, dashed: Boolean = false, monoValues: Set<Int> = emptySet(), topRule: Boolean = true) {
    val facts = cells.map { (label, value) ->
        val icon = when (label.lowercase()) {
            "when", "departs", "back" -> PcIcons.Calendar
            "where" -> PcIcons.Pin
            "group", "seats" -> PcIcons.Users
            "length" -> PcIcons.Clock
            "rating" -> PcIcons.Star
            "price", "your estimate" -> PcIcons.Wallet
            else -> PcIcons.ChevronRight
        }
        Fact(icon, if (label.equals("back", true)) "back $value" else value)
    }
    Facts(facts, modifier)
}

// ---------- Avatars and images ----------

@Composable
fun Avatar(user: UserLite?, size: Dp = 40.dp, modifier: Modifier = Modifier, square: Boolean = false, border: Color = Color.Transparent) {
    val c = Pc.colors
    val shape = if (square) RoundedCornerShape(PcTokens.radiusImage) else CircleShape
    Box(modifier.size(size).clip(shape).background(c.pineSoft).then(if (border != Color.Transparent) Modifier.border(1.5.dp, border, shape) else Modifier), contentAlignment = Alignment.Center) {
        val url = user?.avatarUrl
        if (url != null) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current).data(url).crossfade(true).build(),
                contentDescription = user.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(),
            )
        } else if (user != null) {
            Text(user.initials, style = Pc.type.smallStrong.copy(fontSize = (size.value * 0.36f).coerceIn(11f, 24f).sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.pine)
        } else {
            PcIcon(PcIcons.User, "Guest", tint = c.ink2, size = size * 0.5f)
        }
    }
}

@Composable
fun FaceStack(users: List<UserLite>, extra: Int = 0, size: Dp = 28.dp) {
    val c = Pc.colors
    Row(horizontalArrangement = Arrangement.spacedBy((-8).dp)) {
        users.take(4).forEach { u ->
            Box(Modifier.size(size + 4.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) { Avatar(u, size) }
        }
        if (extra > 0) Box(Modifier.size(size + 4.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) {
            Box(Modifier.size(size).clip(CircleShape).background(tonal()), contentAlignment = Alignment.Center) { Text("+$extra", style = Pc.type.label, color = c.ink) }
        }
    }
}

private fun decodeLqip(data: String?): androidx.compose.ui.graphics.ImageBitmap? {
    if (data == null || !data.startsWith("data:image/")) return null
    return runCatching {
        val bytes = Base64.decode(data.substringAfter("base64,"), Base64.DEFAULT)
        if (bytes.size > 4096) null else BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    }.getOrNull()
}

/**
 * Progressive image: LQIP (inline base64) or thumbUrl paints first, then the full url crossfades in.
 * In data-saver mode only thumbUrl is loaded. Coil sizes requests to the layout constraints.
 */
@Composable
fun ProgressiveImage(
    media: Media?,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    contentScale: ContentScale = ContentScale.Crop,
    colorFilter: androidx.compose.ui.graphics.ColorFilter? = null,
) {
    val c = Pc.colors
    val saver = LocalDataSaver.current
    val ctx = LocalContext.current
    Box(modifier.background(c.tonal)) {
        if (media == null) return@Box
        val lqip = remember(media.lqip) { decodeLqip(media.lqip) }
        if (lqip != null) Image(lqip, null, Modifier.matchParentSize(), contentScale = ContentScale.Crop, colorFilter = colorFilter)
        val thumb = media.thumbUrl
        if (thumb != null && (saver || lqip == null)) {
            AsyncImage(ImageRequest.Builder(ctx).data(thumb).crossfade(PcTokens.motionStandard).build(), contentDescription, Modifier.matchParentSize(), contentScale = contentScale, colorFilter = colorFilter)
        }
        if (!saver || thumb == null) {
            AsyncImage(ImageRequest.Builder(ctx).data(media.url).crossfade(PcTokens.motionStandard).build(), contentDescription, Modifier.matchParentSize(), contentScale = contentScale, colorFilter = colorFilter)
        }
    }
}

// ---------- Inputs ----------

@Composable
fun PcSwitch(checked: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier, contentDescription: String? = null, onColor: Color = Pc.colors.pine) {
    val c = Pc.colors
    val x by animateDpAsState(if (checked) 21.dp else 3.dp, tween(PcTokens.motionFast), label = "knob")
    val track by animateColorAsState(if (checked) onColor else c.rule, tween(PcTokens.motionFast), label = "track")
    Box(
        modifier.size(width = 52.dp, height = 48.dp).clickable(role = Role.Switch, onClickLabel = contentDescription) { onChange(!checked) },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(width = 46.dp, height = 28.dp).clip(CircleShape).background(track)) {
            Box(Modifier.offset(x = x, y = 3.dp).size(22.dp).clip(CircleShape).background(Color.White))
        }
    }
}

/** 40dp pill chip. Selected = pine fill. */
@Composable
fun PcChip(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, solidSelected: Boolean = true) {
    val c = Pc.colors
    val shape = RoundedCornerShape(PcTokens.radiusPill)
    val fg = if (selected) c.onPine else c.ink
    val bg by animateColorAsState(if (selected) c.pine else c.raised, tween(PcTokens.motionFast), label = "chip")
    Box(modifier.defaultMinSize(minHeight = PcTokens.touch).clickable(role = Role.Checkbox, onClick = onClick), contentAlignment = Alignment.Center) {
        Row(
            Modifier
                .height(40.dp)
                .clip(shape)
                .background(bg)
                .then(if (selected) Modifier else Modifier.border(1.dp, c.rule, shape))
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) { PcIcon(icon, null, tint = fg, size = 16.dp); Spacer(Modifier.width(6.dp)) }
            else if (selected && !solidSelected) { PcIcon(PcIcons.Check, null, tint = fg, size = 16.dp); Spacer(Modifier.width(6.dp)) }
            Text(text, style = Pc.type.smallStrong.copy(fontSize = 14.sp), color = fg, maxLines = 1)
        }
    }
}

/** Form row inside a FormCard: small label, borderless input. */
@Composable
fun FieldRow(
    label: String,
    value: String,
    onValue: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    icon: ImageVector? = null,
    singleLine: Boolean = true,
    style: TextStyle = Pc.type.body.copy(fontSize = 16.sp),
    keyboardType: KeyboardType = KeyboardType.Text,
    helper: String? = null,
    error: String? = null,
    maxLength: Int = 2000,
    labelColor: Color = Pc.colors.ink2,
) {
    val c = Pc.colors
    Column(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(label, style = Pc.type.label.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = labelColor)
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) { PcIcon(icon, null, size = 18.dp, tint = c.pine); Spacer(Modifier.width(8.dp)) }
            Box(Modifier.weight(1f).defaultMinSize(minHeight = 28.dp), contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty()) Text(placeholder, style = style, color = c.ink3)
                BasicTextField(
                    value = value, onValueChange = { if (it.length <= maxLength) onValue(it) }, singleLine = singleLine,
                    textStyle = style.copy(color = c.ink), cursorBrush = SolidColor(c.pine),
                    keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (error != null) Text(error, style = Pc.type.small, color = c.red, modifier = Modifier.padding(top = 4.dp))
        else if (helper != null) Text(helper, style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(top = 4.dp))
    }
}

/** Grouped form/settings block: a card (surface, 28dp, rule border) with inset dividers between rows. */
@Composable
fun FormCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.padding(horizontal = Gutter).fillMaxWidth().raisedCard(), content = content)
}

/** One field block (the mockups' `.field`): surface, 18dp radius, 1dp rule. */
@Composable
fun Modifier.fieldBox(): Modifier {
    val shape = RoundedCornerShape(RadiusField)
    return this.clip(shape).background(Pc.colors.raised).border(1.dp, Pc.colors.rule, shape)
}

@Composable
fun BoxedInput(value: String, onValue: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, singleLine: Boolean = true, keyboardType: KeyboardType = KeyboardType.Text, style: TextStyle = Pc.type.body, minLines: Int = 1, leadingIcon: ImageVector? = null) {
    val c = Pc.colors
    val src = remember { MutableInteractionSource() }
    val focused by src.collectIsFocusedAsState()
    val shape = RoundedCornerShape(if (singleLine && minLines <= 1) PcTokens.radiusPill else RadiusField)
    Row(modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp).clip(shape).background(c.raised)
        .border(if (focused) 1.5.dp else 1.dp, if (focused) c.pine else c.rule, shape).padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        if (leadingIcon != null) { PcIcon(leadingIcon, null, size = 18.dp, tint = c.ink2); Spacer(Modifier.width(10.dp)) }
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (value.isEmpty()) Text(placeholder, style = style, color = c.ink3, maxLines = if (singleLine) 1 else Int.MAX_VALUE, overflow = TextOverflow.Ellipsis)
            BasicTextField(value, onValue, singleLine = singleLine, minLines = minLines, textStyle = style.copy(color = c.ink), cursorBrush = SolidColor(c.pine),
                keyboardOptions = KeyboardOptions(keyboardType = keyboardType), interactionSource = src, modifier = Modifier.fillMaxWidth())
        }
    }
}

/** − n + with two 36dp outlined circles (48dp touch each). */
@Composable
fun Stepper(value: Int, onValue: (Int) -> Unit, min: Int, max: Int) {
    val c = Pc.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        StepBtn(PcIcons.Minus, "Fewer", value > min) { onValue(value - 1) }
        Text("$value", style = Pc.type.num.copy(fontSize = 17.sp), color = c.ink, modifier = Modifier.width(30.dp), textAlign = TextAlign.Center)
        StepBtn(PcIcons.Plus, "More", value < max) { onValue(value + 1) }
    }
}

@Composable
private fun StepBtn(icon: ImageVector, label: String, enabled: Boolean, onClick: () -> Unit) {
    val c = Pc.colors
    Box(Modifier.size(PcTokens.touch).clip(CircleShape).clickable(enabled = enabled, role = Role.Button, onClickLabel = label, onClick = onClick), contentAlignment = Alignment.Center) {
        Box(Modifier.size(36.dp).clip(CircleShape).border(1.5.dp, c.rule, CircleShape), contentAlignment = Alignment.Center) {
            PcIcon(icon, label, tint = if (enabled) c.ink else c.ink3, size = 16.dp)
        }
    }
}

@Composable
fun SwitchRow(title: String, subtitle: String?, checked: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier, onColor: Color = Pc.colors.pine, titleColor: Color = Pc.colors.ink, titleIcon: ImageVector? = null) {
    Row(modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (titleIcon != null) { PcIcon(titleIcon, null, tint = titleColor, size = 16.dp); Spacer(Modifier.width(4.dp)) }
                Text(title, style = Pc.type.bodyStrong, color = titleColor)
            }
            if (subtitle != null) Text(subtitle, style = Pc.type.small, color = Pc.colors.ink2)
        }
        Spacer(Modifier.width(12.dp))
        PcSwitch(checked, onChange, contentDescription = title, onColor = onColor)
    }
}

@Composable
fun NavRow(title: String, subtitle: String? = null, icon: ImageVector? = null, onClick: () -> Unit, trailing: String? = null, danger: Boolean = false) {
    val c = Pc.colors
    Row(Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).defaultMinSize(minHeight = 56.dp).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(if (danger) c.red.copy(alpha = 0.08f) else c.tonal), contentAlignment = Alignment.Center) {
                PcIcon(icon, null, tint = if (danger) c.red else c.pine, size = 20.dp)
            }
            Spacer(Modifier.width(14.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = Pc.type.bodyStrong, color = if (danger) c.red else c.ink)
            if (subtitle != null) Text(subtitle, style = Pc.type.small, color = c.ink2)
        }
        if (trailing != null) Text(trailing, style = Pc.type.smallStrong, color = c.pine, modifier = Modifier.padding(end = 6.dp))
        if (!danger) PcIcon(PcIcons.ChevronRight, null, tint = c.ink3, size = 18.dp)
    }
}

@Composable
fun EmptyState(title: String, body: String, modifier: Modifier = Modifier, action: String? = null, onAction: () -> Unit = {}) {
    Column(modifier.fillMaxWidth().padding(Gutter).pencilledCard().padding(20.dp), horizontalAlignment = Alignment.Start) {
        Text(title, style = Pc.type.title2, color = Pc.colors.ink)
        Spacer(Modifier.height(4.dp))
        Text(body, style = Pc.type.small, color = Pc.colors.ink2)
        if (action != null) { Spacer(Modifier.height(14.dp)); PcButton(action, onAction, height = BtnSmall) }
    }
}

@Composable
fun OfflineBanner(visible: Boolean, demo: Boolean = false) {
    if (!visible && !demo) return
    val c = Pc.colors
    Row(Modifier.fillMaxWidth().background(c.paper).padding(horizontal = Gutter, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.clip(CircleShape).background(c.tonal).padding(horizontal = 10.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(if (visible) c.red else c.full))
            Spacer(Modifier.width(8.dp))
            Text(if (visible) "Offline · showing saved" else "Demo data · server not connected", style = Pc.type.label, color = c.ink2)
        }
    }
}

@Composable
fun ClickableRow(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    Row(modifier.clickable(role = Role.Button, onClick = onClick), verticalAlignment = Alignment.CenterVertically, content = content)
}
