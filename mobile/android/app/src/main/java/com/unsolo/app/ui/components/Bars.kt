package com.unsolo.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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

/** UN in brand gold + SOLO in ink, Bricolage 800. Gold is reserved for the wordmark, you and the HOST badge. */
@Composable
fun Wordmark(modifier: Modifier = Modifier) {
    val c = Pc.colors
    // Light mode uses the deeper brand gold so "UN" keeps contrast on the mint base.
    val un = if (Pc.isDark) c.gold else c.full
    Row(modifier.semantics { contentDescription = "UnSOLO" }, verticalAlignment = Alignment.CenterVertically) {
        Text("UN", style = Pc.type.wordmark, color = un)
        Text("SOLO", style = Pc.type.wordmark, color = c.ink)
    }
}

/** Activity + Messages: glance targets in every top bar. */
@Composable
fun HeaderActions(counts: HeaderCounts, onMessages: () -> Unit, onActivity: () -> Unit) {
    IconTap(PcIcons.Bell, "Activity", onActivity, badge = counts.activity > 0)
    IconTap(PcIcons.ChatsCircle, "Messages", onMessages, badge = counts.messages > 0)
}

/** Large page title (Tribe, My trips, Activity …) with header actions. */
@Composable
fun PageHeader(
    title: String,
    counts: HeaderCounts,
    onMessages: () -> Unit,
    onActivity: () -> Unit,
    onBack: (() -> Unit)? = null,
    actions: Boolean = true,
    extra: @Composable RowScope.() -> Unit = {},
) {
    Column(Modifier.fillMaxWidth().background(Pc.colors.paper).statusBarsPadding()) {
        if (onBack != null) {
            Row(Modifier.fillMaxWidth().height(PcTokens.topBar).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconTap(PcIcons.Back, "Back", onBack)
                Spacer(Modifier.weight(1f))
                extra()
                if (actions) HeaderActions(counts, onMessages, onActivity)
            }
            Text(title, style = Pc.type.display, color = Pc.colors.ink, modifier = Modifier.padding(start = Gutter, end = Gutter, bottom = 10.dp))
        } else {
            Row(Modifier.fillMaxWidth().height(64.dp).padding(start = Gutter + 4.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = Pc.type.display.copy(fontSize = 34.sp), color = Pc.colors.ink, modifier = Modifier.weight(1f))
                extra()
                if (actions) HeaderActions(counts, onMessages, onActivity)
            }
        }
    }
}

/** Compact bar for detail screens: back · title · actions. */
@Composable
fun DetailTopBar(title: String?, onBack: () -> Unit, trailing: String? = null, headerActions: Boolean = true, centerTitle: Boolean = false, actions: @Composable RowScope.() -> Unit = {}) {
    Column(Modifier.fillMaxWidth().background(Pc.colors.paper).statusBarsPadding()) {
        Box(Modifier.fillMaxWidth().height(PcTokens.topBar)) {
            Row(Modifier.fillMaxSize().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconTap(PcIcons.Back, "Back", onBack)
                if (title != null && !centerTitle) Text(title, style = Pc.type.title3, color = Pc.colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(start = 4.dp))
                else Spacer(Modifier.weight(1f))
                if (trailing != null) Tag(trailing, TagKind.Muted, Modifier.padding(end = 8.dp))
                actions()
                val hn = LocalHeaderNav.current
                if (headerActions && hn != null) HeaderActions(LocalHeaderCountsUi.current, hn.onMessages, hn.onActivity)
            }
            if (title != null && centerTitle) Text(title, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold, fontSize = 16.sp), color = Pc.colors.ink, maxLines = 1, modifier = Modifier.align(Alignment.Center))
        }
    }
}

/** Composer bar: close · centred title. The primary action (Publish) lives in the bottom bar. */
@Composable
fun ComposerTopBar(title: String, onCancel: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Pc.colors.paper).statusBarsPadding()) {
        Box(Modifier.fillMaxWidth().height(PcTokens.topBar)) {
            IconTap(PcIcons.Close, "Close", onCancel, Modifier.align(Alignment.CenterStart).padding(start = 4.dp))
            Text(title, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold, fontSize = 16.sp), color = Pc.colors.ink, modifier = Modifier.align(Alignment.Center))
        }
    }
}

/**
 * Sticky bottom bar above the safe area (and the keyboard): an optional leading control,
 * the price or summary, and one primary pill.
 */
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
    leading: (@Composable () -> Unit)? = null,
    actionIcon: ImageVector? = null,
) {
    val c = Pc.colors
    Column(modifier.fillMaxWidth().background(c.raised.copy(alpha = 0.97f)).navigationBarsPadding().imePadding()) {
        Hairline(color = c.rule)
        Row(Modifier.fillMaxWidth().padding(start = if (leading != null) 8.dp else Gutter + 2.dp, end = Gutter, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            if (leading != null) { leading(); Spacer(Modifier.width(4.dp)) }
            Column(Modifier.weight(1f).padding(end = 12.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(title, style = if (titleMono) Pc.type.priceLarge else Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (titleSuffix != null) Text(titleSuffix, style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(start = 3.dp, bottom = 2.dp), maxLines = 1)
                }
                if (subtitle != null) Text(subtitle, style = Pc.type.small.copy(fontSize = 12.5.sp), color = c.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            PcButton(action, onAction, kind = kind, enabled = enabled, icon = actionIcon)
        }
    }
}

@Immutable
data class TabSpec(val route: String, val label: String, val icon: ImageVector, val badge: Int = 0, val iconSelected: ImageVector? = null)

/** Explore · Tribe · (+) · My trips · You. 68dp; the centre + is a raised pine circle. */
@Composable
fun PcBottomBar(selected: String?, tabs: List<TabSpec>, me: UserLite?, onSelect: (String) -> Unit, onPost: () -> Unit) {
    val c = Pc.colors
    Box(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().background(c.raised).navigationBarsPadding()) {
            Hairline(color = c.rule)
            Row(Modifier.fillMaxWidth().height(PcTokens.tabBar), verticalAlignment = Alignment.CenterVertically) {
                tabs.forEachIndexed { i, t ->
                    if (i == 2) Spacer(Modifier.weight(1f))
                    val isSel = selected == t.route
                    val pill by animateColorAsState(if (isSel) c.pineSoft else Color.Transparent, tween(PcTokens.motionStandard), label = "pill")
                    Column(
                        Modifier.weight(1f).fillMaxHeight().clickable(role = Role.Tab, onClickLabel = t.label) { onSelect(t.route) }.semantics { this.selected = isSel },
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                    ) {
                        Box(Modifier.size(width = 52.dp, height = 30.dp).clip(CircleShape).background(pill), contentAlignment = Alignment.Center) {
                            if (t.route == "you" && me != null) Avatar(me, 24.dp, border = if (isSel) c.ink else Color.Transparent)
                            else PcIcon(if (isSel) (t.iconSelected ?: t.icon) else t.icon, null, tint = if (isSel) c.accentInk else c.ink3, size = 23.dp)
                            if (t.badge > 0) CountBadge(t.badge, Modifier.align(Alignment.TopEnd).offset(4.dp, (-6).dp))
                        }
                        Spacer(Modifier.height(3.dp))
                        Text(t.label, style = Pc.type.label.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold), color = if (isSel) c.accentInk else c.ink3, maxLines = 1)
                    }
                }
            }
        }
        PostTab(onPost, Modifier.align(Alignment.TopCenter).offset(y = (-14).dp))
    }
}

@Composable
private fun PostTab(onPost: () -> Unit, modifier: Modifier) {
    val c = Pc.colors
    Box(
        modifier.size(64.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Post", onClick = onPost).semantics { contentDescription = "Post" },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(60.dp).clip(CircleShape).background(c.paper), contentAlignment = Alignment.Center) {
            Box(Modifier.size(52.dp).shadow(6.dp, CircleShape, ambientColor = Color.Black.copy(alpha = 0.2f), spotColor = Color.Black.copy(alpha = 0.3f)).clip(CircleShape).background(c.pine), contentAlignment = Alignment.Center) {
                PcIcon(PcIcons.Plus, null, tint = c.onPine, size = 26.dp)
            }
        }
    }
}

/** Filter chips (40dp pill, selected = pine fill): For you / Plans / Stories …; Trips / Stays / … */
@Composable
fun TextTabs(items: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier, icons: Map<String, ImageVector> = emptyMap(), trailing: @Composable RowScope.() -> Unit = {}) {
    val c = Pc.colors
    Row(modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Gutter, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        items.forEach { (key, label) ->
            val sel = key == selected
            val bg by animateColorAsState(if (sel) c.pine else c.raised, tween(PcTokens.motionFast), label = "chip")
            val fg = if (sel) c.onPine else c.ink
            Box(Modifier.height(48.dp).clickable(role = Role.Tab) { onSelect(key) }.semantics { this.selected = sel }, contentAlignment = Alignment.Center) {
                Row(Modifier.height(40.dp).clip(CircleShape).background(bg).then(if (sel) Modifier else Modifier.border(1.dp, c.rule, CircleShape)).padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    icons[key]?.let { PcIcon(it, null, tint = fg, size = 17.dp); Spacer(Modifier.width(6.dp)) }
                    Text(label, style = Pc.type.smallStrong.copy(fontSize = 14.sp), color = fg, maxLines = 1)
                }
            }
        }
        trailing()
    }
}

/** Segments as chips (the mockups' "Circles · 3 / Direct · 2 / Requests"). */
@Composable
fun Segmented(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    TextTabs(options, selected, onSelect, modifier)
}

/** Bottom sheet: surface, 28dp top radius, grab handle, scrim token. */
@Composable
fun PcSheet(onDismiss: () -> Unit, state: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), content: @Composable ColumnScope.() -> Unit) {
    val c = Pc.colors
    ModalBottomSheet(
        onDismissRequest = onDismiss, sheetState = state, containerColor = c.raised, contentColor = c.ink,
        shape = RoundedCornerShape(topStart = PcTokens.radiusSheet, topEnd = PcTokens.radiusSheet), scrimColor = c.scrim,
        dragHandle = { Box(Modifier.padding(top = 10.dp, bottom = 10.dp).size(width = 40.dp, height = 5.dp).clip(CircleShape).background(c.rule)) },
    ) {
        Column(Modifier.fillMaxWidth().verticalScroll(androidx.compose.foundation.rememberScrollState()).navigationBarsPadding().padding(bottom = 12.dp), content = content)
    }
}

/** Sheet title (Bricolage 800 24) + optional subtitle. */
@Composable
fun SheetTitle(title: String, subtitle: String? = null) {
    Column(Modifier.padding(horizontal = Gutter + 4.dp).padding(bottom = 12.dp)) {
        Text(title, style = Pc.type.title1, color = Pc.colors.ink)
        if (subtitle != null) Text(subtitle, style = Pc.type.small.copy(fontSize = 14.sp), color = Pc.colors.ink2, modifier = Modifier.padding(top = 2.dp))
    }
}
