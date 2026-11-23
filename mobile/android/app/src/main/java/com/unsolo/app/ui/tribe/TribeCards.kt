package com.unsolo.app.ui.tribe

import com.unsolo.app.ui.components.spotsPair
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.unsolo.app.core.db.LocalState
import com.unsolo.app.core.model.*
import com.unsolo.app.data.PostItem
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.explore.HostedTripCard
import com.unsolo.app.ui.explore.SeatCaption
import com.unsolo.app.ui.explore.TripCard
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens

/** Callbacks shared by every feed card. */
class CardActions(
    val open: (Post) -> Unit,
    val author: (UserLite) -> Unit,
    val join: (Post) -> Unit,
    val react: (Post, String) -> Unit,
    val save: (Post) -> Unit,
    val openTrip: (TripLite) -> Unit,
    val takeSeat: (TripLite) -> Unit,
    val vote: (Post, PollOption) -> Unit,
    val retry: (Post) -> Unit,
    val discard: (Post) -> Unit,
    val share: (Post) -> Unit = {},
    /** Your own post: asks, then deletes it. */
    val delete: ((Post) -> Unit)? = null,
)

/** Cards: surface, 28dp, 1dp rule; plans are pencilled (dashed). 12dp between cards. */
@Composable
fun CardFrame(pencilled: Boolean = false, padded: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.padding(horizontal = 14.dp, vertical = 6.dp).fillMaxWidth()
            .then(if (pencilled) Modifier.pencilledCard() else Modifier.raisedCard())
            .then(if (padded) Modifier.padding(vertical = 14.dp) else Modifier),
        content = content,
    )
}

@Composable
fun AuthorRow(p: Post, sub: String, onAuthor: () -> Unit, extra: @Composable () -> Unit = {}, trailing: @Composable () -> Unit = {}) {
    val c = Pc.colors
    Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClickLabel = "Open ${p.author.firstName}'s profile", onClick = onAuthor), verticalAlignment = Alignment.CenterVertically) {
            Avatar(p.author, 32.dp)
            Spacer(Modifier.width(10.dp))
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.author.name, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold, fontSize = 12.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (p.author.isIdVerified) { Spacer(Modifier.width(4.dp)); VerifiedMark() }
                    if (p.author.isHost) { Spacer(Modifier.width(6.dp)); Tag("Host", TagKind.Host, height = 20.dp) }
                    extra()
                }
                Text(sub, style = Pc.type.small.copy(fontSize = 11.sp), color = c.ink3, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        trailing()
    }
}

@Composable
fun LocalStateLine(item: PostItem, progress: Float?, actions: CardActions) {
    val c = Pc.colors
    when (item.localState) {
        LocalState.SENDING -> Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (progress != null) CircularProgressIndicator(progress = { progress }, Modifier.size(14.dp), color = c.ink, trackColor = c.rule, strokeWidth = 2.dp)
            else CircularProgressIndicator(Modifier.size(14.dp), color = c.ink, trackColor = c.rule, strokeWidth = 2.dp)
            Spacer(Modifier.width(8.dp))
            Text(if (progress != null) "Uploading photos · ${(progress * 100).toInt()}%" else "Posting…", style = Pc.type.label, color = c.ink2)
        }
        LocalState.FAILED -> Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Couldn't post.", style = Pc.type.smallStrong, color = c.red, modifier = Modifier.weight(1f))
            LinkText("Retry", { actions.retry(item.post) }, style = Pc.type.smallStrong)
            Spacer(Modifier.width(12.dp))
            LinkText("Discard", { actions.discard(item.post) }, style = Pc.type.smallStrong)
        }
        LocalState.HELD -> Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().clip(RoundedCornerShape(RadiusField)).background(c.selected).padding(12.dp)) {
            Text("Held for review · only you can see this", style = Pc.type.smallStrong, color = c.ink)
            Text(heldCopy(item.prompts), style = Pc.type.small, color = c.ink2)
        }
    }
}

fun heldCopy(prompts: List<String>): String = when {
    "money" in prompts -> "Charging for this? List it as a hosted trip. Otherwise edit out the price and it goes live."
    "contact_hidden" in prompts -> "We hid phone numbers and emails. Chat inside UnSOLO instead."
    "links_disabled" in prompts -> "Outside links show as plain text."
    else -> "A moderator will look at it shortly."
}

/** Reactions row: heart (love), comments, share; save on the right. */
@Composable
private fun ReactsRow(p: Post, actions: CardActions, modifier: Modifier = Modifier, primary: (@Composable () -> Unit)? = null) {
    val c = Pc.colors
    Row(modifier.padding(start = 6.dp, end = 8.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        val loved = ReactionKind.LOVE in p.myReactions
        ReactBtn(if (loved) PcIcons.HeartFilled else PcIcons.Heart, "${p.reactions.love}", if (loved) "Loved" else "Love", tint = if (loved) c.rose else c.ink2) { actions.react(p, ReactionKind.LOVE) }
        ReactBtn(PcIcons.ChatCircle, "${p.commentCount}", "Comments") { actions.open(p) }
        ReactBtn(PcIcons.Share, null, "Share") { actions.share(p) }
        Spacer(Modifier.weight(1f))
        if (p.viewer.isAuthor && actions.delete != null) IconTap(PcIcons.Trash, "Delete your post", { actions.delete.invoke(p) }, tint = c.ink3)
        if (primary != null) primary()
        else IconTap(if (p.viewer.saved) PcIcons.BookmarkFilled else PcIcons.Bookmark, if (p.viewer.saved) "Saved" else "Save", { actions.save(p) }, tint = if (p.viewer.saved) c.ink else c.ink2)
    }
}

@Composable
fun ReactBtn(icon: androidx.compose.ui.graphics.vector.ImageVector, count: String?, label: String, tint: Color = Pc.colors.ink2, onClick: () -> Unit) {
    val tick = rememberTick()
    Row(Modifier.clip(CircleShape).clickable(role = Role.Button, onClickLabel = label, onClick = { tick(); onClick() }).defaultMinSize(minHeight = 44.dp, minWidth = 44.dp).padding(horizontal = 9.dp)
        .semantics(mergeDescendants = true) { contentDescription = if (count != null) "$label, $count" else label },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
        PcIcon(icon, null, size = 19.dp, tint = tint)
        if (count != null) { Spacer(Modifier.width(6.dp)); Text(count, style = Pc.type.num.copy(fontSize = 12.sp), color = if (tint == Pc.colors.ink2) Pc.colors.ink2 else tint) }
    }
}

/** calendar 12–18 Jan · pin Kaza · clock 3 days · wallet est. cost */
fun planFacts(p: Post): List<Fact> {
    val a = Fmt.date(p.startsOn); val b = Fmt.date(p.endsOn)
    val days = if (a != null && b != null) java.time.temporal.ChronoUnit.DAYS.between(a, b).toInt() + 1 else null
    return listOfNotNull(
        Fact(PcIcons.Calendar, Fmt.range(p.startsOn, p.endsOn)),
        p.place?.name?.let { Fact(PcIcons.Pin, it.substringBefore(',')) },
        days?.takeIf { it > 1 }?.let { Fact(PcIcons.Clock, "$it days") },
        p.estCostText?.let { Fact(PcIcons.Wallet, it.removePrefix("Est. ").substringBefore(" each").let { s -> "~$s each" }) },
    )
}

/** Ring for a plan: hollow circles for open spots, organiser's face in the centre. */
@Composable
fun PlanRing(p: Post, size: androidx.compose.ui.unit.Dp, meId: String?, badge: Boolean = false, centerLabel: Boolean = false) {
    val seats = p.seats.ifEmpty { seatsFromCounts(p.spotsTotal, (p.spotsTotal ?: 0) - p.memberCount, hostFirst = false) }
    val data = ringFromSeats(seats, meId)
    val open = (data.total - data.filled).coerceAtLeast(0)
    SeatRing(
        data, size, plan = true, women = p.audience == "women", centerUser = p.author,
        badge = if (badge) RingBadge(p.author, organiser = true) else null,
        centerLabel = if (centerLabel) (if (open == 0) "Full" to "" else spotsPair(data.total, open)) else null,
        centerLabelSize = if (centerLabel) (size.value * 0.2f).dp else null,
    )
}

/** Plan card (pencilled): author, title, the plan's loose circle, facts, seat line, Request to join. */
@Composable
fun PlanCard(item: PostItem, progress: Float?, actions: CardActions, meId: String? = null) {
    val p = item.post
    val c = Pc.colors
    CardFrame(pencilled = true) {
        Column(Modifier.clickable(onClickLabel = "Open plan") { actions.open(p) }) {
            AuthorRow(p, "Plan · looking for people · ${Fmt.ago(p.createdAt)}", { actions.author(p.author) },
                trailing = { if (p.audience == "women") Tag("Women only", TagKind.Women) })
            LocalStateLine(item, progress, actions)
            Text(p.title ?: "", style = Pc.type.title2.copy(fontSize = 16.5.sp), color = c.ink, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 4.dp))
            if (p.body.isNotBlank()) Text(p.body, style = Pc.type.small.copy(fontSize = 12.sp), color = c.ink2, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 16.dp))
            Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                PlanRing(p, 96.dp, meId)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Facts(planFacts(p))
                    SeatCaption(p.spotsTotal ?: p.seats.size, p.memberCount, plan = true)
                    JoinButton(p) { actions.join(p) }
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        ReactsRow(p, actions)
    }
}

@Composable
fun JoinButton(p: Post, onClick: () -> Unit) {
    val label = when {
        p.viewer.isAuthor -> "Manage"
        p.viewer.membership == "requested" -> "Requested"
        p.viewer.membership == "approved" -> "You're in"
        p.viewer.joinBlockedReason == "full" -> "Full"
        p.viewer.joinBlockedReason == "women_only" -> "Women only"
        p.viewer.joinBlockedReason == "verified_only" -> "Verified only"
        else -> "Request to join"
    }
    val primary = !p.viewer.isAuthor && p.viewer.membership == null && (p.viewer.canJoin || p.viewer.joinBlockedReason == "phone_required" || p.viewer.joinBlockedReason == null)
    val enabled = p.viewer.isAuthor || p.viewer.membership != null || primary
    PcButton(label, onClick, kind = if (primary) BtnKind.Primary else BtnKind.Outline, enabled = enabled, height = BtnSmall)
}

@Composable
fun PhotoGrid(media: List<Media>, onClick: () -> Unit, progress: Float? = null, height: androidx.compose.ui.unit.Dp = 180.dp, rounded: Boolean = false) {
    if (media.isEmpty()) return
    val c = Pc.colors
    Box(Modifier.fillMaxWidth().height(height).then(if (rounded) Modifier.padding(horizontal = 16.dp).clip(RoundedCornerShape(PcTokens.radiusImage)) else Modifier).clickable(onClick = onClick)) {
        if (media.size == 1) ProgressiveImage(media[0], Modifier.fillMaxSize())
        else Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            ProgressiveImage(media[0], Modifier.weight(2f).fillMaxHeight())
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                ProgressiveImage(media[1], Modifier.weight(1f).fillMaxWidth())
                if (media.size > 2) Box(Modifier.weight(1f).fillMaxWidth()) {
                    ProgressiveImage(media[2], Modifier.fillMaxSize())
                    if (media.size > 3) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)), contentAlignment = Alignment.Center) {
                        Text("+${media.size - 3}", style = Pc.type.title2, color = Color.White)
                    }
                }
            }
        }
        if (progress != null && progress < 1f) Box(Modifier.fillMaxSize().background(c.paper.copy(alpha = 0.35f)), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(progress = { progress.coerceAtLeast(0.02f) }, Modifier.size(44.dp), color = c.ink, trackColor = c.raised, strokeWidth = 3.dp)
        }
    }
}

/** Story card: author, full-bleed photo, text, the linked next departure, reactions. */
@Composable
fun StoryCard(item: PostItem, progress: Float?, actions: CardActions) {
    val p = item.post
    val c = Pc.colors
    CardFrame(padded = false) {
        Spacer(Modifier.height(12.dp))
        val sub = listOfNotNull("Story", p.trip?.title ?: p.place?.name, Fmt.ago(p.createdAt)).joinToString(" · ")
        AuthorRow(p, sub, { actions.author(p.author) })
        LocalStateLine(item, progress, actions)
        Spacer(Modifier.height(10.dp))
        PhotoGrid(p.media, { actions.open(p) }, if (item.localState == LocalState.SENDING) progress else null)
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp)) {
            Text(p.title ?: p.body.take(80), style = Pc.type.title3, color = c.ink, modifier = Modifier.clickable { actions.open(p) })
            if (p.title != null && p.body.isNotBlank()) Text(p.body, style = Pc.type.body.copy(fontSize = 12.5.sp), color = c.ink, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
            p.trip?.let { t ->
                Spacer(Modifier.height(10.dp))
                HostedTripCard(t, { actions.openTrip(t) }, { actions.takeSeat(t) })
            }
        }
        Spacer(Modifier.height(4.dp))
        ReactsRow(p, actions, Modifier.padding(bottom = 6.dp))
    }
}

/** Poll: tap a row to vote; after voting, result bars, with your choice in gold. */
@Composable
fun PollView(p: Post, onVote: (PollOption) -> Unit, modifier: Modifier = Modifier) {
    val tick = rememberTick()
    val poll = p.poll ?: return
    val c = Pc.colors
    val sum = poll.options.sumOf { it.votes }
    val total = sum.coerceAtLeast(1)
    val voted = poll.myChoice != null
    val reduce = Pc.reduceMotion
    Column(modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        poll.options.forEach { o ->
            val mine = poll.myChoice == o.id
            val shape = RoundedCornerShape(14.dp)
            val frac by animateFloatAsState(if (voted) o.votes / total.toFloat() else 0f, tween(if (reduce) 0 else 220), label = "bar")
            Box(
                Modifier.fillMaxWidth().height(48.dp).clip(shape)
                    .background(if (voted) c.tonal else c.raised)
                    .border(if (mine) 2.dp else 1.5.dp, if (mine) c.ink else if (voted) Color.Transparent else c.rule, shape)
                    .clickable(role = Role.RadioButton, onClickLabel = if (mine) "Take back your vote" else "Vote ${o.label}") { tick(); onVote(o) }
                    .semantics(mergeDescendants = true) { contentDescription = if (voted) "${o.label}, ${o.votes * 100 / total} percent${if (mine) ", your vote" else ""}" else "Vote ${o.label}" },
            ) {
                if (voted) Box(Modifier.fillMaxHeight().fillMaxWidth(frac).background(c.ink.copy(alpha = if (mine) 0.16f else 0.08f)))
                Row(Modifier.fillMaxSize().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (mine) { PcIcon(PcIcons.CheckCircleFilled, null, size = 18.dp, tint = c.ink); Spacer(Modifier.width(6.dp)) }
                    Text(o.label, style = Pc.type.bodyStrong.copy(fontSize = 12.sp), color = c.ink, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (voted) Text("${o.votes * 100 / total}%", style = Pc.type.num.copy(fontSize = 12.sp), color = c.ink)
                }
            }
        }
        Text(if (!voted) "Tap an option to vote · $sum votes" else "$sum ${if (sum == 1) "vote" else "votes"} · tap to change", style = Pc.type.smallStrong, color = c.ink3, modifier = Modifier.padding(top = 2.dp))
    }
}

/** Question (or poll) card. */
@Composable
fun AskCard(item: PostItem, progress: Float?, actions: CardActions) {
    val p = item.post
    val c = Pc.colors
    val isPoll = p.poll != null
    CardFrame {
        AuthorRow(p, listOfNotNull(if (isPoll) "Poll" else "Question", p.place?.name?.substringBefore(','), Fmt.ago(p.createdAt)).joinToString(" · "), { actions.author(p.author) },
            extra = { Spacer(Modifier.width(6.dp)); Tag(if (isPoll) "Poll" else "Question", TagKind.Verified, icon = if (isPoll) PcIcons.ChartBar else PcIcons.Question, height = 20.dp) })
        LocalStateLine(item, progress, actions)
        Text(p.title ?: p.body, style = Pc.type.title2.copy(fontSize = 16.5.sp), color = c.ink, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp).clickable { actions.open(p) })
        if (p.title != null && p.body.isNotBlank()) Text(p.body, style = Pc.type.small.copy(fontSize = 12.sp), color = c.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        if (isPoll) { Spacer(Modifier.height(10.dp)); PollView(p, { actions.vote(p, it) }) }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.padding(start = 6.dp, end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            val helpful = ReactionKind.HELPFUL in p.myReactions
            ReactBtn(PcIcons.ArrowFatUp, "${p.reactions.helpful}", if (helpful) "Marked helpful" else "Helpful", tint = if (helpful) c.ink else c.ink2) { actions.react(p, ReactionKind.HELPFUL) }
            ReactBtn(PcIcons.ChatCircle, "${p.commentCount}", "Answers") { actions.open(p) }
            Spacer(Modifier.weight(1f))
            PcButton("Answer", { actions.open(p) }, kind = BtnKind.Outline, height = BtnSmall)
        }
    }
}

/** A hosted departure placed in the feed: the photo-first trip card. */
@Composable
fun PlacedTripCard(t: TripLite, actions: CardActions, saved: Boolean = false, onSave: () -> Unit = {}) {
    Box(Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) {
        TripCard(t, saved, onSave = onSave, onOpen = { actions.openTrip(t) }, onTake = { actions.takeSeat(t) }, label = "Placed by UnSOLO")
    }
}

@Composable
fun CommunityPlanLine(modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        PcIcon(PcIcons.Shield, null, size = 14.dp, tint = Pc.colors.ink2)
        Spacer(Modifier.width(6.dp))
        Text("Community plan · not a booking", style = Pc.type.smallStrong, color = Pc.colors.ink2)
    }
}
