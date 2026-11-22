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

/**
 * Suggestions while someone types `@na…` at the end of [text]: people you follow and earlier
 * matches show at once, the search fills in. Picking one calls [onText] with the mention finished.
 */
@Composable
fun MentionPicker(text: String, statuses: StatusRepository, onText: (String) -> Unit, modifier: Modifier = Modifier) {
    val c = Pc.colors
    val m = TYPING.find(text)
    val q = m?.groupValues?.get(2).orEmpty()
    var hits by remember { mutableStateOf<List<UserLite>>(emptyList()) }
    LaunchedEffect(Unit) { statuses.warmPeople() }
    LaunchedEffect(m != null, q) {
        if (m == null || q.isEmpty()) { hits = emptyList(); return@LaunchedEffect }
        hits = statuses.peopleNow(q)
        delay(120)
        hits = statuses.people(q)
    }
    if (m == null) return
    val start = m.range.first + m.groupValues[1].length
    if (q.isEmpty()) { Text("Type a name or username to mention someone", style = Pc.type.small, color = c.ink3, modifier = modifier.padding(horizontal = 14.dp, vertical = 6.dp)); return }
    if (hits.isEmpty()) return
    LazyRow(modifier.padding(vertical = 6.dp), contentPadding = PaddingValues(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(hits, key = { it.id }) { u ->
            Row(Modifier.clip(CircleShape).background(c.tonal).clickable(onClickLabel = "Mention ${u.name}") { onText((text.substring(0, start) + "@${u.username} ").take(2000)) }
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
