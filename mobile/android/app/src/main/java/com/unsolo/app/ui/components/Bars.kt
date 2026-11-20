package com.unsolo.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.unsolo.app.core.model.UserLite
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens

@Immutable
data class HeaderCounts(val messages: Int = 0, val activity: Int = 0)

/** Messages + Activity live in every top bar; AppRoot provides where they go. */
@Immutable
data class HeaderNav(val onMessages: () -> Unit, val onActivity: () -> Unit)

val LocalHeaderNav = staticCompositionLocalOf<HeaderNav?> { null }
val LocalHeaderCountsUi = compositionLocalOf { HeaderCounts() }

/** UN (ink on gold) + SOLO. Gold is reserved for the wordmark, your seat and the HOST tag. */
@Composable
fun Wordmark(modifier: Modifier = Modifier) {
    Row(modifier.semantics { contentDescription = "UnSOLO" }, verticalAlignment = Alignment.CenterVertically) {
        Text("UN", style = Pc.type.title2.copy(fontWeight = FontWeight.Bold, fontSize = 20.sp), color = Pc.colors.onGold,
            modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Pc.colors.gold).padding(horizontal = 5.dp))
        Text("SOLO", style = Pc.type.title2.copy(fontWeight = FontWeight.Bold, fontSize = 20.sp), color = Pc.colors.ink, modifier = Modifier.padding(start = 3.dp))
    }
}

/** Messages + Activity, present in every top bar. */
@Composable
fun HeaderActions(counts: HeaderCounts, onMessages: () -> Unit, onActivity: () -> Unit) {
    IconTap(PcIcons.Mail, "Messages", onMessages, badge = counts.messages > 0)
    IconTap(PcIcons.Bell, "Activity", onActivity, badge = counts.activity > 0)
}

/** Large page title (Tribe, My trips, Activity …) with header actions. */
@Composable
fun PageHeader(
    title: String,
    counts: HeaderCounts,
    onMessages: () -> Unit,
    onActivity: () -> Unit,
    onBack: (() -> Unit)? = null,
    extra: @Composable RowScope.() -> Unit = {},
) {
    Column(Modifier.fillMaxWidth().background(Pc.colors.paper).statusBarsPadding()) {
        if (onBack != null) {
            Row(Modifier.fillMaxWidth().height(PcTokens.topBar).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconTap(PcIcons.Back, "Back", onBack)
                Spacer(Modifier.weight(1f))
                extra()
                HeaderActions(counts, onMessages, onActivity)
            }
            Text(title, style = Pc.type.display, color = Pc.colors.ink, modifier = Modifier.padding(start = Gutter, end = Gutter, bottom = 12.dp))
        } else {
            Row(Modifier.fillMaxWidth().height(68.dp).padding(start = Gutter, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = Pc.type.display, color = Pc.colors.ink, modifier = Modifier.weight(1f))
                extra()
                HeaderActions(counts, onMessages, onActivity)
            }
        }
    }
}

/** Compact bar for detail screens: back · title · actions (no divider). */
@Composable
fun DetailTopBar(title: String?, onBack: () -> Unit, trailing: String? = null, headerActions: Boolean = true, actions: @Composable RowScope.() -> Unit = {}) {
    Column(Modifier.fillMaxWidth().background(Pc.colors.paper).statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().height(PcTokens.topBar).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconTap(PcIcons.Back, "Back", onBack)
            if (title != null) Text(title, style = Pc.type.title3, color = Pc.colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(start = 4.dp))
            else Spacer(Modifier.weight(1f))
            if (trailing != null) Tag(trailing, TagKind.Muted, Modifier.padding(end = 8.dp))
            actions()
            val hn = LocalHeaderNav.current
            if (headerActions && hn != null) HeaderActions(LocalHeaderCountsUi.current, hn.onMessages, hn.onActivity)
        }
    }
}

/** Composer bar: Cancel · title (the primary action lives in the bottom bar). */
@Composable
fun ComposerTopBar(title: String, onCancel: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Pc.colors.paper).statusBarsPadding()) {
        Box(Modifier.fillMaxWidth().height(PcTokens.topBar)) {
            Text("Cancel", style = Pc.type.bodyStrong, color = Pc.colors.ink2, modifier = Modifier.align(Alignment.CenterStart).padding(start = 8.dp).clip(CircleShape)
                .clickable(role = Role.Button, onClick = onCancel).padding(horizontal = 12.dp, vertical = 12.dp))
            Text(title, style = Pc.type.title3, color = Pc.colors.ink, modifier = Modifier.align(Alignment.Center))
        }
    }
}

/** Sticky bottom bar: price/summary on the left, one primary pill on the right. */
@Composable
fun BottomActionBar(
    title: String,
    subtitle: String?,
    action: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
    kind: BtnKind = BtnKind.Primary,
    enabled: Boolean = true,
    titleMono: Boolean = false,
    titleSuffix: String? = null,
) {
    val c = Pc.colors
    Column(modifier.fillMaxWidth().shadow(8.dp, ambientColor = Color.Black.copy(alpha = 0.05f), spotColor = Color.Black.copy(alpha = 0.10f)).background(c.raised).navigationBarsPadding().imePadding()) {
        Hairline(color = c.rule)
        Row(Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).padding(end = 12.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(title, style = if (titleMono) Pc.type.numLarge else Pc.type.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (titleSuffix != null) Text(titleSuffix, style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(start = 6.dp, bottom = 3.dp))
                }
                if (subtitle != null) Text(subtitle, style = Pc.type.small, color = c.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            PcButton(action, onAction, kind = kind, enabled = enabled)
        }
    }
}

@Immutable
data class TabSpec(val route: String, val label: String, val icon: ImageVector, val badge: Int = 0)

/** Explore · Tribe · (+) Post · My trips · You — Material 3 nav-bar feel with a pill indicator. */
@Composable
fun PcBottomBar(selected: String?, tabs: List<TabSpec>, me: UserLite?, onSelect: (String) -> Unit, onPost: () -> Unit) {
    val c = Pc.colors
    Column(Modifier.fillMaxWidth().background(c.raised).navigationBarsPadding()) {
        Hairline(color = c.rule)
        Row(Modifier.fillMaxWidth().height(72.dp), verticalAlignment = Alignment.CenterVertically) {
            tabs.forEachIndexed { i, t ->
                if (i == 2) PostTab(onPost, Modifier.weight(1f))
                val isSel = selected == t.route
                val pill by animateColorAsState(if (isSel) c.ink.copy(alpha = 0.10f) else Color.Transparent, tween(PcTokens.motionStandard), label = "pill")
                Column(
                    Modifier.weight(1f).fillMaxHeight().clickable(role = Role.Tab, onClickLabel = t.label) { onSelect(t.route) }.semantics { this.selected = isSel },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                ) {
                    Box(Modifier.size(width = 60.dp, height = 32.dp).clip(CircleShape).background(pill), contentAlignment = Alignment.Center) {
                        if (t.route == "you" && me != null) Avatar(me, 24.dp)
                        else PcIcon(t.icon, null, tint = if (isSel) c.ink else c.ink2, size = 22.dp)
                        if (t.badge > 0) CountBadge(t.badge, Modifier.align(Alignment.TopEnd).offset((-6).dp, (-4).dp))
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(t.label, style = Pc.type.label.copy(fontWeight = if (isSel) FontWeight.SemiBold else FontWeight.Medium), color = if (isSel) c.ink else c.ink2, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun PostTab(onPost: () -> Unit, modifier: Modifier) {
    val c = Pc.colors
    Box(modifier.fillMaxHeight().clickable(role = Role.Button, onClickLabel = "Post", onClick = onPost), contentAlignment = Alignment.Center) {
        Box(Modifier.size(width = 56.dp, height = 44.dp).clip(RoundedCornerShape(PcTokens.radiusButton)).background(c.ink), contentAlignment = Alignment.Center) {
            PcIcon(PcIcons.Plus, "Post", tint = c.onInk, size = 22.dp)
        }
    }
}

/** Pill filter chips (selected = ink fill): For you / Plans / Stories / Asks; Trips / Stays / … */
@Composable
fun TextTabs(items: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    val c = Pc.colors
    Row(modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Gutter, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        items.forEach { (key, label) ->
            val sel = key == selected
            val bg by animateColorAsState(if (sel) c.ink else tonal(), tween(PcTokens.motionFast), label = "chip")
            Box(Modifier.height(40.dp).clip(CircleShape).background(bg).clickable(role = Role.Tab) { onSelect(key) }.semantics { this.selected = sel }.padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
                Text(label, style = Pc.type.smallStrong.copy(fontSize = 14.sp), color = if (sel) c.onInk else c.ink, maxLines = 1)
            }
        }
        trailing()
    }
}

/** Two- or three-way segmented control: tonal track, ink pill for the selected segment. */
@Composable
fun Segmented(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    val c = Pc.colors
    Row(modifier.fillMaxWidth().padding(horizontal = Gutter).height(48.dp).clip(CircleShape).background(tonal()).padding(4.dp)) {
        options.forEach { (key, label) ->
            val sel = key == selected
            val bg by animateColorAsState(if (sel) c.ink else Color.Transparent, tween(PcTokens.motionFast), label = "seg")
            Box(Modifier.weight(1f).fillMaxHeight().clip(CircleShape).background(bg)
                .clickable(role = Role.Tab) { onSelect(key) }.semantics { this.selected = sel }, contentAlignment = Alignment.Center) {
                Text(label, style = Pc.type.smallStrong.copy(fontSize = 14.sp), color = if (sel) c.onInk else c.ink, maxLines = 1)
            }
        }
    }
}

@Composable
fun PcSheet(onDismiss: () -> Unit, state: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), content: @Composable ColumnScope.() -> Unit) {
    val c = Pc.colors
    ModalBottomSheet(
        onDismissRequest = onDismiss, sheetState = state, containerColor = c.paper, contentColor = c.ink,
        shape = RoundedCornerShape(topStart = PcTokens.radiusSheet, topEnd = PcTokens.radiusSheet), scrimColor = Color.Black.copy(alpha = 0.40f),
        dragHandle = { Box(Modifier.padding(top = 10.dp, bottom = 8.dp).size(width = 36.dp, height = 4.dp).clip(CircleShape).background(c.rule2)) },
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 12.dp), content = content)
    }
}
