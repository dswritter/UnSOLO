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
import androidx.compose.ui.draw.shadow
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

/** Page gutter (refined Passenger Chart). */
val Gutter = 20.dp

// ---------- Surfaces ----------

/** Ink at ~7%: the tonal fill for secondary buttons, chips, avatars and seats. */
const val tonalAlpha = 0.07f

@Composable
fun tonal(): Color = Pc.colors.ink.copy(alpha = tonalAlpha)

/**
 * Printed (hosted, bookable): raised paper with a soft shadow in light mode, a 1dp rule in dark
 * (shadows don't read on dark paper).
 */
@Composable
fun Modifier.raisedCard(radius: Dp = PcTokens.radiusCard): Modifier {
    val c = Pc.colors
    val shape = RoundedCornerShape(radius)
    return if (Pc.isDark) this.clip(shape).background(c.raised).border(1.dp, c.rule, shape)
    else this.shadow(2.dp, shape, ambientColor = Color.Black.copy(alpha = 0.06f), spotColor = Color.Black.copy(alpha = 0.12f)).clip(shape).background(c.raised)
}

/** Pencilled (community plan): paper with a single 1.5dp dashed outline in rule2. */
@Composable
fun Modifier.pencilledCard(radius: Dp = PcTokens.radiusCard): Modifier =
    this.clip(RoundedCornerShape(radius)).background(Pc.colors.paper).dashedBorder(Pc.colors.rule2, radius = radius, width = 1.5.dp, on = 5.dp, off = 4.dp)

@Composable
fun Modifier.tonalFill(shape: Shape = RoundedCornerShape(PcTokens.radiusCard)): Modifier = this.clip(shape).background(tonal())

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

/** "Pencilled" border: dashed rule used by community plans and open seats. */
fun Modifier.dashedBorder(color: Color, radius: Dp = PcTokens.radiusM, width: Dp = 1.dp, on: Dp = 4.dp, off: Dp = 3.dp) = drawBehind {
    val w = width.toPx()
    drawRoundRect(
        color = color, topLeft = Offset(w / 2, w / 2),
        size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w),
        cornerRadius = CornerRadius(radius.toPx()),
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

@Composable
fun IconTap(icon: ImageVector, contentDescription: String, onClick: () -> Unit, modifier: Modifier = Modifier, tint: Color = Pc.colors.ink, badge: Boolean = false, badgeCount: Int = 0) {
    Box(
        modifier.size(PcTokens.touch).clip(CircleShape).clickable(role = Role.Button, onClickLabel = contentDescription, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        PcIcon(icon, contentDescription, tint = tint)
        if (badgeCount > 0) CountBadge(badgeCount, Modifier.align(Alignment.TopEnd).offset((-2).dp, 6.dp))
        else if (badge) Box(Modifier.align(Alignment.TopEnd).offset((-10).dp, 10.dp).size(8.dp).clip(CircleShape).background(Pc.colors.red))
    }
}

@Composable
fun CountBadge(count: Int, modifier: Modifier = Modifier) {
    Box(
        modifier.defaultMinSize(minWidth = 18.dp, minHeight = 18.dp).clip(CircleShape).background(Pc.colors.ink).padding(horizontal = 5.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(if (count > 99) "99+" else "$count", style = Pc.type.label.copy(fontSize = 11.sp), color = Pc.colors.onInk)
    }
}

@Composable
fun LinkText(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, style: TextStyle = Pc.type.bodyStrong) {
    Text(text, style = style, color = Pc.colors.blue,
        modifier = modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button, onClick = onClick).defaultMinSize(minHeight = 44.dp).wrapContentHeight())
}

@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, trailing: String? = null, trailingLink: (() -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(horizontal = Gutter), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = Pc.type.title2, color = Pc.colors.ink, modifier = Modifier.weight(1f).padding(vertical = 10.dp))
        if (trailing != null) {
            if (trailingLink != null) LinkText(trailing, trailingLink, style = Pc.type.smallStrong)
            else Text(trailing, style = Pc.type.small, color = Pc.colors.ink2)
        }
    }
}

/** Small uppercase overline ("HOSTED TRIP · BOOKABLE", settings section names). */
@Composable
fun Overline(text: String, modifier: Modifier = Modifier, color: Color = Pc.colors.ink2) {
    Text(text.uppercase(), style = Pc.type.code, color = color, modifier = modifier, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

// ---------- Buttons ----------

/** Primary = filled ink pill · Outline = tonal pill (secondary) · Ghost = text · Danger = red text. */
enum class BtnKind { Primary, Outline, Ghost, Danger }

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
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, tween(PcTokens.motionFast), label = "press")
    val bg = when (kind) {
        BtnKind.Primary -> if (enabled) c.ink else c.ink.copy(alpha = 0.18f)
        BtnKind.Outline -> if (dashed) Color.Transparent else c.ink.copy(alpha = if (pressed) 0.12f else tonalAlpha)
        BtnKind.Ghost -> if (pressed) c.ink.copy(alpha = 0.06f) else Color.Transparent
        BtnKind.Danger -> if (pressed) c.red.copy(alpha = 0.08f) else Color.Transparent
    }
    val fg = when (kind) {
        BtnKind.Primary -> if (enabled) c.onInk else c.ink.copy(alpha = 0.45f)
        BtnKind.Danger -> c.red
        else -> if (enabled) c.ink else c.ink.copy(alpha = 0.4f)
    }
    val shape = RoundedCornerShape(PcTokens.radiusPill)
    Row(
        modifier
            .scale(scale)
            .defaultMinSize(minHeight = maxOf(height, PcTokens.touch))
            .clip(shape)
            .background(bg)
            .then(if (dashed) Modifier.dashedBorder(c.rule2, radius = height / 2, width = 1.5.dp, on = 5.dp, off = 4.dp) else Modifier)
            .clickable(interactionSource = src, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = if (kind == BtnKind.Ghost) 12.dp else 22.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) { leading(); Spacer(Modifier.width(10.dp)) }
        else if (icon != null) { PcIcon(icon, null, tint = fg, size = 18.dp); Spacer(Modifier.width(8.dp)) }
        Text(text, style = Pc.type.bodyStrong, color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ---------- Tags ----------

enum class TagKind { Host, Organiser, Author, Kind, KindDashed, Muted }

/** Soft tinted pill: ink at ~8% (gold tint for HOST only), 11sp semibold, no boxes. */
@Composable
fun Tag(text: String, kind: TagKind, modifier: Modifier = Modifier) {
    val c = Pc.colors
    val (bg, fg) = when (kind) {
        TagKind.Host -> c.goldBg to c.goldInk
        TagKind.Organiser -> c.ink.copy(alpha = 0.10f) to c.ink
        TagKind.Muted -> c.ink.copy(alpha = 0.05f) to c.ink2
        else -> c.ink.copy(alpha = 0.07f) to c.ink2
    }
    Text(text.uppercase(), style = Pc.type.code, color = fg, maxLines = 1, softWrap = false,
        modifier = modifier.clip(RoundedCornerShape(PcTokens.radiusPill)).background(bg).padding(horizontal = 8.dp, vertical = 3.dp))
}

@Composable
fun VerifiedMark(modifier: Modifier = Modifier) {
    PcIcon(PcIcons.Shield, "Verified", modifier, tint = Pc.colors.blue, size = 16.dp)
}

// ---------- Facts row (calendar · pin · people) ----------

@Immutable
data class Fact(val icon: ImageVector, val text: String)

@Composable
fun Facts(facts: List<Fact>, modifier: Modifier = Modifier, color: Color = Pc.colors.ink) {
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        facts.filter { it.text.isNotBlank() }.forEach { f ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                PcIcon(f.icon, null, size = 16.dp, tint = Pc.colors.ink2)
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
            "price", "your estimate" -> PcIcons.Ticket
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
    Box(modifier.size(size).clip(shape).background(tonal()).then(if (border != Color.Transparent) Modifier.border(1.5.dp, border, shape) else Modifier), contentAlignment = Alignment.Center) {
        val url = user?.avatarUrl
        if (url != null) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current).data(url).crossfade(true).build(),
                contentDescription = user.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(),
            )
        } else if (user != null) {
            Text(user.initials, style = Pc.type.smallStrong.copy(fontSize = (size.value * 0.36f).coerceIn(12f, 24f).sp), color = c.ink)
        } else {
            PcIcon(PcIcons.User, "Guest", tint = c.ink2, size = size * 0.5f)
        }
    }
}

@Composable
fun FaceStack(users: List<UserLite>, extra: Int = 0, size: Dp = 28.dp) {
    val c = Pc.colors
    Row {
        users.take(4).forEachIndexed { i, u ->
            Box(Modifier.offset(x = (-8 * i).dp).size(size + 4.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) { Avatar(u, size) }
        }
        if (extra > 0) Box(Modifier.offset(x = (-8 * users.take(4).size).dp).size(size + 4.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) {
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
fun ProgressiveImage(media: Media?, modifier: Modifier = Modifier, contentDescription: String? = null, contentScale: ContentScale = ContentScale.Crop) {
    val c = Pc.colors
    val saver = LocalDataSaver.current
    val ctx = LocalContext.current
    Box(modifier.background(c.rule.copy(alpha = 0.5f))) {
        if (media == null) return@Box
        val lqip = remember(media.lqip) { decodeLqip(media.lqip) }
        if (lqip != null) Image(lqip, null, Modifier.matchParentSize(), contentScale = ContentScale.Crop)
        val thumb = media.thumbUrl
        if (thumb != null && (saver || lqip == null)) {
            AsyncImage(ImageRequest.Builder(ctx).data(thumb).crossfade(PcTokens.motionStandard).build(), contentDescription, Modifier.matchParentSize(), contentScale = contentScale)
        }
        if (!saver || thumb == null) {
            AsyncImage(ImageRequest.Builder(ctx).data(media.url).crossfade(PcTokens.motionStandard).build(), contentDescription, Modifier.matchParentSize(), contentScale = contentScale)
        }
    }
}

// ---------- Inputs ----------

@Composable
fun PcSwitch(checked: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier, contentDescription: String? = null) {
    val c = Pc.colors
    val x by animateDpAsState(if (checked) 24.dp else 4.dp, tween(PcTokens.motionFast), label = "knob")
    val track by animateColorAsState(if (checked) c.ink else c.ink.copy(alpha = 0.16f), tween(PcTokens.motionFast), label = "track")
    Box(
        modifier.size(width = 52.dp, height = 44.dp).clickable(role = Role.Switch, onClickLabel = contentDescription) { onChange(!checked) },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(width = 48.dp, height = 28.dp).clip(CircleShape).background(track)) {
            Box(Modifier.offset(x = x, y = 4.dp).size(20.dp).clip(CircleShape).background(if (checked) c.onInk else c.raised))
        }
    }
}

@Composable
fun PcChip(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, solidSelected: Boolean = true) {
    val c = Pc.colors
    val shape = RoundedCornerShape(PcTokens.radiusPill)
    val fg = if (selected) c.onInk else c.ink
    Row(
        modifier
            .defaultMinSize(minHeight = 40.dp)
            .clip(shape)
            .background(if (selected) c.ink else tonal())
            .clickable(role = Role.Checkbox, onClick = onClick)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) { PcIcon(icon, null, tint = fg, size = 16.dp); Spacer(Modifier.width(6.dp)) }
        else if (selected && !solidSelected) { PcIcon(PcIcons.Check, null, tint = fg, size = 16.dp); Spacer(Modifier.width(6.dp)) }
        Text(text, style = Pc.type.smallStrong, color = fg)
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
) {
    val c = Pc.colors
    Column(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(label, style = Pc.type.small, color = c.ink2)
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) { PcIcon(icon, null, size = 18.dp, tint = c.ink2); Spacer(Modifier.width(8.dp)) }
            Box(Modifier.weight(1f).defaultMinSize(minHeight = 28.dp), contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty()) Text(placeholder, style = style, color = c.ink3)
                BasicTextField(
                    value = value, onValueChange = { if (it.length <= maxLength) onValue(it) }, singleLine = singleLine,
                    textStyle = style.copy(color = c.ink), cursorBrush = SolidColor(c.ink),
                    keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (error != null) Text(error, style = Pc.type.small, color = c.red, modifier = Modifier.padding(top = 4.dp))
        else if (helper != null) Text(helper, style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(top = 4.dp))
    }
}

/** Grouped form/settings block: raised, 16dp corners, inset dividers between rows. */
@Composable
fun FormCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.padding(horizontal = Gutter).fillMaxWidth().raisedCard(), content = content)
}

@Composable
fun BoxedInput(value: String, onValue: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, singleLine: Boolean = true, keyboardType: KeyboardType = KeyboardType.Text, style: TextStyle = Pc.type.body, minLines: Int = 1) {
    val c = Pc.colors
    val src = remember { MutableInteractionSource() }
    val focused by src.collectIsFocusedAsState()
    val shape = RoundedCornerShape(PcTokens.radiusButton)
    Box(modifier.fillMaxWidth().defaultMinSize(minHeight = 52.dp).clip(shape).background(tonal())
        .border(1.5.dp, if (focused) c.ink else Color.Transparent, shape).padding(horizontal = 16.dp, vertical = 14.dp), contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Text(placeholder, style = style, color = c.ink3)
        BasicTextField(value, onValue, singleLine = singleLine, minLines = minLines, textStyle = style.copy(color = c.ink), cursorBrush = SolidColor(c.ink),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType), interactionSource = src, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
fun Stepper(value: Int, onValue: (Int) -> Unit, min: Int, max: Int) {
    val c = Pc.colors
    Row(Modifier.clip(CircleShape).background(tonal()), verticalAlignment = Alignment.CenterVertically) {
        IconTap(PcIcons.Minus, "Fewer", { if (value > min) onValue(value - 1) }, tint = if (value > min) c.ink else c.ink3)
        Text("$value", style = Pc.type.num, color = c.ink, modifier = Modifier.width(28.dp), textAlign = TextAlign.Center)
        IconTap(PcIcons.Plus, "More", { if (value < max) onValue(value + 1) }, tint = if (value < max) c.ink else c.ink3)
    }
}

@Composable
fun SwitchRow(title: String, subtitle: String?, checked: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = Pc.type.bodyStrong, color = Pc.colors.ink)
            if (subtitle != null) Text(subtitle, style = Pc.type.small, color = Pc.colors.ink2)
        }
        Spacer(Modifier.width(12.dp))
        PcSwitch(checked, onChange, contentDescription = title)
    }
}

@Composable
fun NavRow(title: String, subtitle: String? = null, icon: ImageVector? = null, onClick: () -> Unit, trailing: String? = null, danger: Boolean = false) {
    val c = Pc.colors
    Row(Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).defaultMinSize(minHeight = 56.dp).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) {
            Box(Modifier.size(36.dp).clip(CircleShape).background(if (danger) c.red.copy(alpha = 0.08f) else tonal()), contentAlignment = Alignment.Center) {
                PcIcon(icon, null, tint = if (danger) c.red else c.ink, size = 18.dp)
            }
            Spacer(Modifier.width(14.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = Pc.type.bodyStrong, color = if (danger) c.red else c.ink)
            if (subtitle != null) Text(subtitle, style = Pc.type.small, color = c.ink2)
        }
        if (trailing != null) Text(trailing, style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(end = 6.dp))
        if (!danger) PcIcon(PcIcons.ChevronRight, null, tint = c.ink3, size = 18.dp)
    }
}

@Composable
fun EmptyState(title: String, body: String, modifier: Modifier = Modifier, action: String? = null, onAction: () -> Unit = {}) {
    Column(modifier.fillMaxWidth().padding(Gutter).pencilledCard().padding(20.dp), horizontalAlignment = Alignment.Start) {
        Text(title, style = Pc.type.title3, color = Pc.colors.ink)
        Spacer(Modifier.height(4.dp))
        Text(body, style = Pc.type.small, color = Pc.colors.ink2)
        if (action != null) { Spacer(Modifier.height(14.dp)); PcButton(action, onAction, kind = BtnKind.Outline, height = 44.dp) }
    }
}

@Composable
fun OfflineBanner(visible: Boolean, demo: Boolean = false) {
    if (!visible && !demo) return
    val c = Pc.colors
    Row(Modifier.fillMaxWidth().background(c.paper).padding(horizontal = Gutter, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.clip(CircleShape).background(tonal()).padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(if (visible) c.red else c.goldInk))
            Spacer(Modifier.width(8.dp))
            Text(if (visible) "Offline · showing saved" else "Demo data · server not connected", style = Pc.type.label, color = c.ink2)
        }
    }
}

@Composable
fun ClickableRow(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    Row(modifier.clickable(role = Role.Button, onClick = onClick), verticalAlignment = Alignment.CenterVertically, content = content)
}
