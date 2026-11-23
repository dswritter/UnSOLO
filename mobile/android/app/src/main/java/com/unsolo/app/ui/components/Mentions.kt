package com.unsolo.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import com.unsolo.app.core.model.UserLite
import com.unsolo.app.data.StatusRepository
import com.unsolo.app.ui.theme.Pc
import kotlinx.coroutines.delay

/** `@username` anywhere (not inside an email). */
private val MENTION = Regex("(^|[^A-Za-z0-9_.@\\-])@([A-Za-z0-9_][A-Za-z0-9_.\\-]{0,39})")
/** An `@name` being typed at the end of the text. */
private val TYPING = Regex("(^|\\s)@([A-Za-z0-9_.\\-]{0,40})$")

/** [text] with each @username bold and tappable ([onMention] gets the username). */
fun mentionAnnotated(text: String, color: Color? = null, onMention: (String) -> Unit): AnnotatedString = buildAnnotatedString {
    var last = 0
    for (m in MENTION.findAll(text)) {
        val at = m.range.first + m.groupValues[1].length
        val name = m.groupValues[2].trimEnd('.', '-')
        if (name.isEmpty()) continue
        append(text.substring(last, at))
        withLink(LinkAnnotation.Clickable("m:$name", TextLinkStyles(SpanStyle(fontWeight = FontWeight.Bold, color = color ?: Color.Unspecified))) { onMention(name) }) { append("@$name") }
        last = at + 1 + name.length
    }
    append(text.substring(last))
}

/** What's being typed after `@` at the end of a text, and who it could be (best match first). */
@Immutable
class MentionAssist(val start: Int, val query: String, val hits: List<UserLite>) {
    val best: UserLite? get() = hits.firstOrNull()
    /** The rest, for the row above the box. */
    val others: List<UserLite> get() = hits.drop(1)
    /** [text] with the typed `@na` replaced by the best match's `@username `. */
    fun complete(text: String, max: Int = 2000): String = best?.let { (text.substring(0, start) + "@${it.username} ").take(max) } ?: text
}

private fun rank(q: String, hits: List<UserLite>): List<UserLite> {
    val t = q.lowercase()
    return hits.sortedBy { u ->
        val un = u.username.lowercase(); val n = u.name.lowercase()
        when { un == t -> 0; un.startsWith(t) -> 1; n.split(' ').any { it.startsWith(t) } -> 2; else -> 3 }
    }
}

/** Live mention help for [text]: null when no `@name` is being typed. */
@Composable
fun rememberMentionAssist(text: String, statuses: StatusRepository): MentionAssist? {
    val m = TYPING.find(text)
    val q = m?.groupValues?.get(2).orEmpty()
    var hits by remember { mutableStateOf<List<UserLite>>(emptyList()) }
    LaunchedEffect(Unit) { statuses.warmPeople() }
    LaunchedEffect(m != null, q) {
        if (m == null || q.isEmpty()) { hits = emptyList(); return@LaunchedEffect }
        // People we already know show at once; the server's answer fills in a moment later.
        hits = rank(q, statuses.peopleNow(q))
        delay(120)
        hits = rank(q, statuses.people(q))
    }
    if (m == null) return null
    return MentionAssist(m.range.first + m.groupValues[1].length, q, if (q.isEmpty()) emptyList() else hits)
}

/**
 * Typing a space right after `@na` takes the best match ("@ananya "). Use as the field's
 * onValueChange filter: `onChange(mentionTyped(old, new, assist))`.
 */
fun mentionTyped(old: String, new: String, assist: MentionAssist?): String {
    if (assist == null || assist.query.isEmpty() || new != "$old ") return new
    val best = assist.best ?: return new
    if (best.username.equals(assist.query, ignoreCase = true)) return new
    return assist.complete(old)
}

/** The best match, ticked, inside the input box: tap to take it. */
@Composable
fun MentionBadge(assist: MentionAssist?, onAccept: () -> Unit, dark: Boolean = false) {
    val best = assist?.best ?: return
    if (best.username.equals(assist.query, ignoreCase = true)) return
    val c = Pc.colors
    Row(Modifier.clip(CircleShape).background(if (dark) Color.White.copy(alpha = 0.18f) else c.tonal)
        .clickable(onClickLabel = "Mention ${best.name}", onClick = onAccept).padding(start = 8.dp, end = 10.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Text("✓", style = Pc.type.smallStrong, color = if (dark) Color(0xFF7BE0A1) else c.pine)
        Spacer(Modifier.width(4.dp))
        Text("@${best.username}", style = Pc.type.smallStrong, color = if (dark) Color.White else c.ink, maxLines = 1)
    }
}

/**
 * Other people it could be, in a row above the box (the best match sits in the box). Picking
 * one calls [onText] with the mention finished.
 */
@Composable
fun MentionPicker(text: String, statuses: StatusRepository, onText: (String) -> Unit, modifier: Modifier = Modifier, assist: MentionAssist? = rememberMentionAssist(text, statuses)) {
    val c = Pc.colors
    val a = assist ?: return
    if (a.query.isEmpty()) { Text("Type a name or username to mention someone", style = Pc.type.small, color = c.ink3, modifier = modifier.padding(horizontal = 14.dp, vertical = 6.dp)); return }
    if (a.others.isEmpty()) return
    LazyRow(modifier.padding(vertical = 6.dp), contentPadding = PaddingValues(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(a.others, key = { it.id }) { u ->
            Row(Modifier.clip(CircleShape).background(c.tonal).clickable(onClickLabel = "Mention ${u.name}") { onText((text.substring(0, a.start) + "@${u.username} ").take(2000)) }
                .padding(start = 4.dp, end = 12.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(u, 26.dp); Spacer(Modifier.width(8.dp))
                Column {
                    Text(u.name, style = Pc.type.smallStrong, color = c.ink, maxLines = 1)
                    Text("@${u.username}", style = Pc.type.label, color = c.ink2, maxLines = 1)
                }
            }
        }
    }
}
