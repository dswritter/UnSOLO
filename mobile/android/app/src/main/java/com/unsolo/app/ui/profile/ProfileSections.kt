package com.unsolo.app.ui.profile

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.unsolo.app.core.model.*
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons

/** Same list as the web (src/lib/indian-states.ts). */
val IndianStates = listOf(
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
    "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi",
    "Jammu & Kashmir", "Ladakh", "Puducherry", "Chandigarh", "Andaman & Nicobar", "Lakshadweep",
)

/** Status line, bio, place / Instagram / website, travel style, joined. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileAbout(user: UserLite, followsYou: Boolean, nav: AppNav) {
    val c = Pc.colors
    Column(Modifier.padding(horizontal = Gutter)) {
        user.statusText?.let {
            Row(Modifier.padding(top = 10.dp).clip(RoundedCornerShape(14.dp)).background(c.goldBg).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("💭", fontSize = 14.sp); Spacer(Modifier.width(6.dp))
                Text(it, style = Pc.type.bodyStrong, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        user.bio?.takeIf { it.isNotBlank() }?.let { Text(it, style = Pc.type.body, color = c.ink, modifier = Modifier.padding(top = 10.dp)) }
        FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            user.location?.takeIf { it.isNotBlank() }?.let { loc -> LinkChip(PcIcons.Pin, loc) { nav.openUrl("https://www.google.com/maps/search/?api=1&query=" + java.net.URLEncoder.encode(loc, "UTF-8")) } }
            user.instagramUrl?.takeIf { it.isNotBlank() }?.let { url -> LinkChip(PcIcons.Camera, "@" + url.trimEnd('/').substringAfterLast('/')) { nav.openUrl(url) } }
            user.websiteUrl?.takeIf { it.isNotBlank() }?.let { url -> LinkChip(PcIcons.Share, url.removePrefix("https://").removePrefix("http://").removePrefix("www.").trimEnd('/')) { nav.openUrl(url) } }
            user.joinedAt?.let { j -> Fmt.date(j.take(10))?.let { d -> LinkChip(PcIcons.Calendar, "Joined ${d.month.name.lowercase().replaceFirstChar { it.uppercase() }.take(3)} ${d.year}", null) } }
            if (followsYou) Tag("Follows you", TagKind.Muted)
        }
        if (user.travelStyle.isNotEmpty()) FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            user.travelStyle.forEach { Tag(it, TagKind.Kind) }
        }
    }
}

@Composable
private fun LinkChip(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, onClick: (() -> Unit)?) {
    val c = Pc.colors
    Row(Modifier.clip(CircleShape).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        PcIcon(icon, null, size = 14.dp, tint = c.ink2); Spacer(Modifier.width(4.dp))
        Text(text, style = Pc.type.small, color = if (onClick != null) c.accentInk else c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Trips · states · reviews · listings · points · followers · following, side by side. */
@Composable
fun ProfileStatsRow(p: ProfileResponse?, user: UserLite?, fallbackTrips: Int?) {
    val c = Pc.colors
    val s = p?.stats
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        StatBox(s?.trips?.toString() ?: if (s != null) "🔒" else "${fallbackTrips ?: 0}", "trips")
        StatBox(s?.states?.toString() ?: if (s != null) "🔒" else "0", "states")
        StatBox("${s?.reviews ?: 0}", "reviews")
        if ((s?.listings ?: 0) > 0) StatBox("${s!!.listings}", "listings")
        StatBox("${s?.points ?: 0}", "points")
        StatBox("${user?.followers ?: 0}", "followers")
        StatBox("${user?.following ?: 0}", "following")
    }
    if (s != null) {
        // Leaderboard tier and how far to the next one.
        Column(Modifier.padding(horizontal = Gutter, vertical = 10.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.tonal).padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.tier.name, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink)
                s.rank?.let { Text("  · #$it on the leaderboard", style = Pc.type.small, color = c.ink2) }
                Spacer(Modifier.weight(1f))
                s.tier.next?.let { Text("${s.tier.pointsToNext} pts to $it", style = Pc.type.small, color = c.ink2) }
            }
            Box(Modifier.padding(top = 8.dp).fillMaxWidth().height(6.dp).clip(CircleShape).background(c.rule)) {
                Box(Modifier.fillMaxHeight().fillMaxWidth((s.tier.percent / 100f).coerceIn(0f, 1f)).background(c.gold))
            }
        }
    }
}

@Composable
private fun StatBox(value: String, label: String) {
    val c = Pc.colors
    Column(Modifier.clip(RoundedCornerShape(14.dp)).border(1.dp, c.rule, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 10.dp)) {
        Text(value, style = Pc.type.numLarge, color = c.ink)
        Text(label, style = Pc.type.small, color = c.ink2)
    }
}

/** Their phone: shown, masked with "Ask for number", or request pending. */
@Composable
fun PhoneRow(phone: ProfilePhone, onRequest: () -> Unit, onCall: (String) -> Unit) {
    val c = Pc.colors
    Row(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(1.dp, c.rule, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically) {
        PcIcon(PcIcons.Phone, null, size = 18.dp, tint = c.ink2); Spacer(Modifier.width(10.dp))
        Text(phone.number ?: phone.masked ?: "Phone hidden", style = Pc.type.num, color = c.ink, modifier = Modifier.weight(1f))
        when {
            phone.number != null -> PcButton("Call", { onCall(phone.number) }, kind = BtnKind.Quiet, height = BtnSmall)
            phone.request == "pending" -> Text("Request sent", style = Pc.type.smallStrong, color = c.ink2)
            phone.canRequest -> PcButton(if (phone.request == "rejected") "Ask again" else "Ask for number", onRequest, kind = BtnKind.Quiet, height = BtnSmall)
        }
    }
}

/** How you're connected (others' profiles): mutual follows, shared trips, shared groups, places in common. */
@Composable
fun ConnectionsCard(cn: ProfileConnections?, mutualPlaces: List<String>, nav: AppNav) {
    if (cn == null && mutualPlaces.isEmpty()) return
    if (cn != null && cn.mutual.isEmpty() && cn.shared.isEmpty() && cn.rooms.isEmpty() && mutualPlaces.isEmpty()) return
    val c = Pc.colors
    Column(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.tonal).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("How you're connected", style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = c.ink2)
        if (cn != null && cn.mutual.isNotEmpty()) Row(verticalAlignment = Alignment.CenterVertically) {
            FaceStack(cn.mutual.take(3), size = 26.dp); Spacer(Modifier.width(8.dp))
            Text("${cn.mutual.take(2).joinToString(", ") { it.firstName }}${if (cn.mutualCount > 2) " +${cn.mutualCount - 2}" else ""} in common", style = Pc.type.small, color = c.ink)
        }
        cn?.shared?.take(3)?.forEach { s ->
            Text("${if (s.hostedByThem) "They host" else "You both booked"} ${s.title}", style = Pc.type.small, color = c.accentInk,
                modifier = Modifier.clickable { if (s.path.startsWith("/packages/")) nav.to(Routes.trip(s.path.removePrefix("/packages/"))) else nav.to(Routes.trip(s.path.substringAfterLast('/'))) })
        }
        cn?.rooms?.take(3)?.let { r -> if (r.isNotEmpty()) Text("Both in ${r.joinToString(", ") { it.name }}", style = Pc.type.small, color = c.ink) }
        if (mutualPlaces.isNotEmpty()) Text("You've both been to ${mutualPlaces.take(3).joinToString(" · ") { it.substringBefore(',') }}", style = Pc.type.small, color = c.ink)
    }
}

/** A row of faces: "Reached out to you" (own host profile) or "Travellers hosted". */
@Composable
fun PeopleRow(title: String, people: List<UserLite>, nav: AppNav, total: Int = people.size) {
    if (people.isEmpty()) return
    val c = Pc.colors
    Column(Modifier.padding(top = 10.dp)) {
        SectionHeader(title, trailing = if (total > people.size) "$total" else null)
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            people.forEach { u ->
                Column(Modifier.width(62.dp).clip(RoundedCornerShape(12.dp)).clickable { if (u.username.isNotBlank()) nav.to(Routes.profile(u.username)) }.padding(vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Avatar(u, 48.dp); Spacer(Modifier.height(4.dp))
                    Text(u.firstName, style = Pc.type.label, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/** Own profile: people asking for your number, with Share / Decline. */
@Composable
fun PhoneRequestsCard(items: List<PhoneRequestItem>, onDecide: (PhoneRequestItem, Boolean) -> Unit) {
    if (items.isEmpty()) return
    val c = Pc.colors
    Column(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).border(1.dp, c.gold, RoundedCornerShape(16.dp)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Asked for your number", style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink)
        items.forEach { r ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(r.user, 32.dp); Spacer(Modifier.width(8.dp))
                Text(r.user.name, style = Pc.type.body, color = c.ink, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                PcButton("Decline", { onDecide(r, false) }, kind = BtnKind.Ghost, height = BtnSmall)
                PcButton("Share", { onDecide(r, true) }, kind = BtnKind.Quiet, height = BtnSmall)
            }
        }
    }
}

/** States explored as a tile map (visited ones filled), then the trip log. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TravelSection(travel: ProfileTravel?, own: Boolean, nav: AppNav) {
    val c = Pc.colors
    val states = travel?.states
    Column(Modifier.padding(horizontal = Gutter, vertical = 8.dp)) {
        if (states == null) {
            EmptyState("Travel is private", "They've chosen to keep their trips to themselves.")
            return@Column
        }
        val visited = states.toSet()
        Text("${visited.size} of ${IndianStates.size} states explored", style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink)
        FlowRow(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            (IndianStates.filter { it in visited } + visited.filter { it !in IndianStates } + IndianStates.filter { it !in visited }).forEach { st ->
                val on = st in visited
                Text(st, style = Pc.type.label.copy(fontWeight = if (on) FontWeight.Bold else FontWeight.Normal), color = if (on) c.onGold else c.ink3,
                    modifier = Modifier.clip(CircleShape).background(if (on) c.gold else c.tonal).padding(horizontal = 10.dp, vertical = 5.dp))
            }
        }
        if (travel.trips.isNotEmpty()) {
            Text("Trips", style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = c.ink2, modifier = Modifier.padding(top = 18.dp, bottom = 6.dp))
            travel.trips.forEach { t ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(enabled = t.slug != null) { t.slug?.let { nav.to(Routes.trip(it)) } }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(Fmt.dayMonth(t.date), style = Pc.type.num, color = c.ink, modifier = Modifier.width(72.dp))
                    Text(t.title, style = Pc.type.bodyStrong, color = c.ink, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Hairline()
            }
        } else if (visited.isEmpty()) Text(if (own) "Book a trip and the states you visit light up here." else "No trips yet.", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(top = 10.dp))
    }
}

/** Reviews they received as a host (with the average), then reviews they wrote. */
@Composable
fun ReviewsSection(p: ProfileResponse?, nav: AppNav) {
    val c = Pc.colors
    val host = p?.host
    val written = p?.reviewsWritten.orEmpty()
    Column(Modifier.padding(horizontal = Gutter, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (host != null && host.reviews.isNotEmpty()) {
            Text("★ ${host.reviewAverage?.let { "%.1f".format(it) } ?: "–"} · ${host.reviewTotal} reviews as a host", style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink)
            host.reviews.forEach { ReviewCard(it, nav) }
        }
        if (written.isNotEmpty()) {
            Text("Reviews they wrote", style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = c.ink2, modifier = Modifier.padding(top = 6.dp))
            written.forEach { ReviewCard(it, nav) }
        }
        if ((host?.reviews.isNullOrEmpty()) && written.isEmpty()) EmptyState("No reviews yet", "Reviews from trips and hosts show here.")
    }
}

@Composable
private fun ReviewCard(r: ProfileReview, nav: AppNav) {
    val c = Pc.colors
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(1.dp, c.rule, RoundedCornerShape(14.dp)).clickable(enabled = r.slug != null) { r.slug?.let { nav.to(Routes.trip(it)) } }.padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            r.reviewer?.let { Avatar(it, 24.dp); Spacer(Modifier.width(6.dp)); Text(it.firstName, style = Pc.type.smallStrong, color = c.ink); Spacer(Modifier.width(8.dp)) }
            Text("★".repeat(r.rating.coerceIn(0, 5)) + "☆".repeat((5 - r.rating).coerceIn(0, 5)), style = Pc.type.small, color = c.goldInk)
            Spacer(Modifier.weight(1f))
            Text(Fmt.ago(r.createdAt), style = Pc.type.label, color = c.ink3)
        }
        r.subject?.let { Text(it, style = Pc.type.label, color = c.ink2, modifier = Modifier.padding(top = 4.dp)) }
        r.body?.takeIf { it.isNotBlank() }?.let { Text(it, style = Pc.type.body, color = c.ink, modifier = Modifier.padding(top = 4.dp)) }
    }
}

/** Badges earned, and the next few to unlock. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BadgesSection(b: ProfileBadges?, own: Boolean) {
    val c = Pc.colors
    Column(Modifier.padding(horizontal = Gutter, vertical = 8.dp)) {
        Text("${b?.earned?.size ?: 0} of ${b?.total ?: 0} badges", style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink)
        if (b?.earned.isNullOrEmpty()) Text(if (own) "Book trips, write reviews and meet people to earn them." else "None yet.", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(top = 4.dp))
        FlowRow(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            b?.earned?.forEach { BadgeTile(it, earned = true) }
        }
        if (!b?.next.isNullOrEmpty()) {
            Text("Next to unlock", style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = c.ink2, modifier = Modifier.padding(top = 16.dp, bottom = 8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { b!!.next.forEach { BadgeTile(it, earned = false) } }
        }
    }
}

@Composable
private fun BadgeTile(b: Badge, earned: Boolean) {
    val c = Pc.colors
    Column(Modifier.width(100.dp).clip(RoundedCornerShape(14.dp)).background(if (earned) c.goldBg else c.tonal).padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(b.icon, fontSize = 26.sp, modifier = Modifier.then(if (earned) Modifier else Modifier.background(androidx.compose.ui.graphics.Color.Transparent)))
        Text(b.name, style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = if (earned) c.ink else c.ink3, maxLines = 2, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text(b.description, style = Pc.type.label.copy(fontSize = 10.sp), color = c.ink3, maxLines = 2, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}
