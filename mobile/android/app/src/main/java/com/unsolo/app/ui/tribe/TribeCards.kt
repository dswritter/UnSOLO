package com.unsolo.app.ui.tribe

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.unsolo.app.core.db.LocalState
import com.unsolo.app.core.model.*
import com.unsolo.app.data.MoneyFormat
import com.unsolo.app.data.PostItem
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.explore.HostedTripCard
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
)

/** Printed cards are raised; pencilled (plans) are paper with a dashed rule2 outline. 12dp between cards. */
@Composable
fun CardFrame(pencilled: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth()
            .then(if (pencilled) Modifier.pencilledCard() else Modifier.raisedCard())
            .padding(vertical = 16.dp),
        content = content,
    )
}

@Composable
private fun AuthorRow(p: Post, tag: @Composable () -> Unit, sub: String, onAuthor: () -> Unit) {
    val c = Pc.colors
    Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClick = onAuthor), verticalAlignment = Alignment.CenterVertically) {
            Avatar(p.author, 40.dp)
            Spacer(Modifier.width(10.dp))
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.author.name, style = Pc.type.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (p.author.isIdVerified) { Spacer(Modifier.width(4.dp)); VerifiedMark() }
                    if (p.author.isHost) { Spacer(Modifier.width(6.dp)); Tag("Host", TagKind.Host) }
                }
                Text(sub, style = Pc.type.small, color = c.ink2, maxLines = 1)
            }
        }
        tag()
    }
}

@Composable
fun LocalStateLine(item: PostItem, progress: Float?, actions: CardActions) {
    val c = Pc.colors
    when (item.localState) {
        LocalState.SENDING -> Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (progress != null) CircularProgressIndicator(progress = { progress }, Modifier.size(14.dp), color = c.ink, trackColor = c.rule, strokeWidth = 2.dp)
            else CircularProgressIndicator(Modifier.size(14.dp), color = c.ink2, trackColor = c.rule, strokeWidth = 2.dp)
            Spacer(Modifier.width(8.dp))
            Text(if (progress != null) "Uploading photos · ${(progress * 100).toInt()}%" else "Posting…", style = Pc.type.label, color = c.ink2)
        }
        LocalState.FAILED -> Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Couldn't post.", style = Pc.type.smallStrong, color = c.red, modifier = Modifier.weight(1f))
            LinkText("Retry", { actions.retry(item.post) }, style = Pc.type.smallStrong)
            Spacer(Modifier.width(12.dp))
            LinkText("Discard", { actions.discard(item.post) }, style = Pc.type.smallStrong)
        }
        LocalState.HELD -> Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().clip(RoundedCornerShape(PcTokens.radiusImage)).background(c.goldBg).padding(12.dp)) {
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

@Composable
private fun Footer(p: Post, actions: CardActions, primary: (@Composable () -> Unit)? = null) {
    val c = Pc.colors
    Row(Modifier.padding(start = 8.dp, end = 16.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        val wants = ReactionKind.WANT_TO_GO in p.myReactions
        Row(Modifier.clip(CircleShape).background(if (wants) c.ink.copy(alpha = 0.10f) else Color.Transparent)
            .clickable(role = Role.Button, onClickLabel = "Want to go") { actions.react(p, ReactionKind.WANT_TO_GO) }
            .defaultMinSize(minHeight = 44.dp).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            PcIcon(PcIcons.Pin, null, size = 18.dp, tint = c.ink)
            Spacer(Modifier.width(6.dp))
            Text("${p.reactions.wantToGo}", style = Pc.type.num.copy(fontSize = 14.sp), color = c.ink)
            Text(" want to go", style = if (wants) Pc.type.smallStrong else Pc.type.small, color = c.ink)
        }
        Row(Modifier.clip(CircleShape).clickable { actions.open(p) }.defaultMinSize(minHeight = 44.dp).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            PcIcon(PcIcons.Chat, "Comments", size = 18.dp)
            Spacer(Modifier.width(6.dp))
            Text("${p.commentCount}", style = Pc.type.num.copy(fontSize = 14.sp), color = c.ink)
        }
        Spacer(Modifier.weight(1f))
        if (primary != null) primary()
        else IconTap(if (p.viewer.saved) PcIcons.BookmarkFilled else PcIcons.Bookmark, if (p.viewer.saved) "Saved" else "Save", { actions.save(p) })
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

/** calendar 12–18 Jan · pin Kaza, Spiti · people 3 of 5 open */
fun planFacts(p: Post): List<Fact> {
    val total = p.spotsTotal ?: p.seats.size
    val open = (total - p.memberCount).coerceAtLeast(0)
    return listOf(
        Fact(PcIcons.Calendar, Fmt.range(p.startsOn, p.endsOn)),
        Fact(PcIcons.Pin, p.place?.name ?: ""),
        Fact(PcIcons.Users, "$open of $total open"),
    )
}

/** "Pencilled" plan card: dashed rule2 outline, no price slot, tonal "Ask to join", ORGANISER ring. */
@Composable
fun PlanCard(item: PostItem, progress: Float?, actions: CardActions) {
    val p = item.post
    val c = Pc.colors
    CardFrame(pencilled = true) {
        Column(Modifier.clickable { actions.open(p) }) {
            AuthorRow(p, { Tag("Plan", TagKind.Kind) }, listOfNotNull(p.author.homeCity, Fmt.ago(p.createdAt)).joinToString(" · ")) { actions.author(p.author) }
            LocalStateLine(item, progress, actions)
            Spacer(Modifier.height(12.dp))
            CommunityPlanLine(Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.height(4.dp))
            Text(p.title ?: "", style = Pc.type.title2.copy(fontSize = 22.sp), color = c.ink, modifier = Modifier.padding(horizontal = 16.dp))
            if (p.body.isNotBlank()) Text(p.body, style = Pc.type.body, color = c.ink2, maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
            Spacer(Modifier.height(10.dp))
            Facts(planFacts(p), Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.height(14.dp))
            SeatRow(p.seats, Modifier.padding(horizontal = 16.dp), maxCell = PcTokens.seatSmall)
            val audienceNote = when (p.audience) { "women" -> "Women only"; "verified" -> "Verified travellers"; else -> null }
            val cost = listOfNotNull(p.estCostText, audienceNote).joinToString(" · ")
            if (cost.isNotBlank()) Text(cost, style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
            else Spacer(Modifier.height(10.dp))
        }
        Footer(p, actions) { JoinButton(p) { actions.join(p) } }
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
        else -> "Ask to join"
    }
    val enabled = p.viewer.isAuthor || p.viewer.membership != null || p.viewer.canJoin || p.viewer.joinBlockedReason == "phone_required" || p.viewer.joinBlockedReason == null
    PcButton(label, onClick, kind = BtnKind.Outline, enabled = enabled, height = 44.dp)
}

@Composable
fun PhotoGrid(media: List<Media>, onClick: () -> Unit, progress: Float? = null) {
    if (media.isEmpty()) return
    val c = Pc.colors
    Box(Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(200.dp).clip(RoundedCornerShape(PcTokens.radiusImage)).clickable(onClick = onClick)) {
        if (media.size == 1) ProgressiveImage(media[0], Modifier.fillMaxSize())
        else Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            ProgressiveImage(media[0], Modifier.weight(2f).fillMaxHeight())
            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
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

@Composable
fun StoryCard(item: PostItem, progress: Float?, actions: CardActions) {
    val p = item.post
    val c = Pc.colors
    CardFrame {
        val sub = if (p.trip != null) "Went with UnSOLO · ${Fmt.ago(p.createdAt)}" else listOfNotNull(p.place?.name, Fmt.ago(p.createdAt)).joinToString(" · ")
        AuthorRow(p, { Tag("Story", TagKind.Kind) }, sub) { actions.author(p.author) }
        LocalStateLine(item, progress, actions)
        Spacer(Modifier.height(12.dp))
        PhotoGrid(p.media, { actions.open(p) }, if (item.localState == LocalState.SENDING) progress else null)
        Spacer(Modifier.height(12.dp))
        Text(p.title ?: p.body.take(80), style = Pc.type.title2.copy(fontSize = 21.sp), color = c.ink, modifier = Modifier.padding(horizontal = 16.dp).clickable { actions.open(p) })
        p.trip?.let { t ->
            Spacer(Modifier.height(12.dp))
            Box(Modifier.padding(horizontal = 16.dp)) { HostedTripCard(t, { actions.openTrip(t) }, { actions.takeSeat(t) }) }
        }
        Spacer(Modifier.height(6.dp))
        Footer(p, actions)
    }
}

@Composable
fun PollView(p: Post, onVote: (PollOption) -> Unit, modifier: Modifier = Modifier) {
    val poll = p.poll ?: return
    val c = Pc.colors
    val total = poll.options.sumOf { it.votes }.coerceAtLeast(1)
    Column(modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        poll.options.forEach { o ->
            val mine = poll.myChoice == o.id
            val voted = poll.myChoice != null
            Box(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(PcTokens.radiusButton)).background(tonal())
                .clickable(enabled = !voted, role = Role.RadioButton) { onVote(o) }) {
                if (voted) Box(Modifier.fillMaxHeight().fillMaxWidth(o.votes / total.toFloat()).background(c.ink.copy(alpha = if (mine) 0.16f else 0.07f)))
                Row(Modifier.fillMaxSize().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(o.label, style = if (mine) Pc.type.bodyStrong else Pc.type.body, color = c.ink, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (mine) { PcIcon(PcIcons.Check, "Your vote", size = 16.dp); Spacer(Modifier.width(6.dp)) }
                    if (voted) Text("${o.votes * 100 / total}%", style = Pc.type.num.copy(fontSize = 13.sp), color = c.ink)
                }
            }
        }
        Text(if (poll.myChoice == null) "Tap an option to vote · ${poll.options.sumOf { it.votes }} votes" else "${poll.options.sumOf { it.votes }} votes", style = Pc.type.small, color = c.ink2)
    }
}

@Composable
fun AskCard(item: PostItem, progress: Float?, actions: CardActions) {
    val p = item.post
    val c = Pc.colors
    CardFrame {
        AuthorRow(p, { Tag("Ask", TagKind.Kind) }, listOfNotNull(p.place?.name, Fmt.ago(p.createdAt)).joinToString(" · ")) { actions.author(p.author) }
        LocalStateLine(item, progress, actions)
        Spacer(Modifier.height(12.dp))
        Text(p.title ?: p.body, style = Pc.type.title2.copy(fontSize = 21.sp), color = c.ink, modifier = Modifier.padding(horizontal = 16.dp).clickable { actions.open(p) })
        if (p.title != null && p.body.isNotBlank()) Text(p.body, style = Pc.type.body, color = c.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        if (p.poll != null) { Spacer(Modifier.height(12.dp)); PollView(p, { actions.vote(p, it) }) }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.padding(start = 8.dp, end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            val helpful = ReactionKind.HELPFUL in p.myReactions
            Row(Modifier.clip(CircleShape).background(if (helpful) c.ink.copy(alpha = 0.10f) else Color.Transparent).clickable { actions.react(p, ReactionKind.HELPFUL) }
                .defaultMinSize(minHeight = 44.dp).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                PcIcon(PcIcons.Bulb, null, size = 18.dp)
                Spacer(Modifier.width(6.dp))
                Text("Helpful · ${p.reactions.helpful}", style = if (helpful) Pc.type.smallStrong else Pc.type.small, color = c.ink)
            }
            Text("${p.commentCount} answers", style = Pc.type.small, color = c.ink2, modifier = Modifier.weight(1f).padding(start = 8.dp))
            PcButton("Answer", { actions.open(p) }, kind = BtnKind.Outline, height = 44.dp)
        }
    }
}

@Composable
fun PlacedTripCard(t: TripLite, actions: CardActions) {
    val c = Pc.colors
    Column(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().raisedCard().clickable { actions.openTrip(t) }) {
        Box {
            ProgressiveImage(t.image, Modifier.fillMaxWidth().height(168.dp))
            Tag("Hosted trip · bookable", TagKind.Muted, Modifier.padding(12.dp).clip(CircleShape).background(c.raised.copy(alpha = 0.92f)))
        }
        Column(Modifier.padding(16.dp)) {
            Text(t.title, style = Pc.type.title2, color = c.ink)
            Spacer(Modifier.height(6.dp))
            Facts(listOf(Fact(PcIcons.Calendar, Fmt.dowDayMonth(t.nextDeparture)), Fact(PcIcons.Clock, Fmt.nights(t.durationDays)), Fact(PcIcons.Pin, t.place?.name.orEmpty())))
            Spacer(Modifier.height(10.dp))
            SeatStrip(seatsFromCounts(t.seatsTotal, t.seatsLeft))
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(MoneyFormat.rupees(t.priceFromPaise), style = Pc.type.numLarge, color = c.ink)
                Text(" / person", style = Pc.type.small, color = c.ink2, modifier = Modifier.weight(1f))
                PcButton("Take a seat", { actions.takeSeat(t) }, height = 44.dp)
            }
            Text("Placed by UnSOLO", style = Pc.type.label, color = c.ink3, modifier = Modifier.padding(top = 6.dp))
        }
    }
}
