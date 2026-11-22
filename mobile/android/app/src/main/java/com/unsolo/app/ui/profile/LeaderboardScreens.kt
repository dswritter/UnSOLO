package com.unsolo.app.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.unsolo.app.core.model.LeaderEntry
import com.unsolo.app.core.model.LeaderboardResponse
import com.unsolo.app.core.model.UserLite
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.apiCall
import com.unsolo.app.data.getAs
import com.unsolo.app.data.putAs
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc

/** The leaderboard, as on the web: all-time top 100 or this month, with your standing on top. */
@Composable
fun LeaderboardScreen(nav: AppNav) {
    val c = Pc.colors
    var data by remember { mutableStateOf<LeaderboardResponse?>(null) }
    var failed by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(true) }
    var tab by remember { mutableStateOf("all") }
    val meId = nav.graph.account.me.value?.user?.id
    // Last copy at once, then the fresh one.
    LaunchedEffect(Unit) {
        val cache = nav.graph.db.cache()
        cache.getAs("leaderboard", LeaderboardResponse.serializer())?.let { data = it }
        when (val r = apiCall { nav.graph.api.leaderboard() }) {
            is ApiResult.Ok -> { data = r.value; cache.putAs("leaderboard", LeaderboardResponse.serializer(), r.value) }
            else -> failed = true
        }
        refreshing = false
    }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Leaderboard", onBack = { nav.back() }, headerActions = false)
        if (refreshing && data != null) androidx.compose.material3.LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp), color = c.gold, trackColor = c.tonal)
        Segmented(listOf("all" to "All time", "month" to "This month"), tab, { tab = it }, Modifier.padding(horizontal = Gutter))
        val d = data
        when {
            failed && d == null -> EmptyState("Couldn't load the leaderboard", "Check your connection and try again.")
            d == null -> Column(Modifier.padding(Gutter)) { repeat(8) { Box(Modifier.padding(vertical = 6.dp).fillMaxWidth().height(52.dp).clip(RoundedCornerShape(12.dp)).background(c.tonal)) } }
            else -> LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                d.me?.rank?.let { r -> item {
                    Row(Modifier.padding(Gutter).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.goldBg).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("You're #$r", style = Pc.type.title2, color = c.ink, modifier = Modifier.weight(1f))
                        d.me.entry?.let { Text("${it.points} pts", style = Pc.type.num, color = c.ink) }
                    }
                } }
                val list = if (tab == "all") d.entries else d.monthly
                if (list.isEmpty()) item { EmptyState(if (tab == "all") "No one on the board yet" else "No trips booked this month yet", "Book trips and write reviews to earn points.") }
                items(list, key = { tab + it.user.id }) { e -> LeaderRow(e, tab == "month", e.user.id == meId) { if (e.user.username.isNotBlank()) nav.to(Routes.profile(e.user.username)) } }
            }
        }
    }
}

@Composable
private fun LeaderRow(e: LeaderEntry, monthly: Boolean, me: Boolean, onClick: () -> Unit) {
    val c = Pc.colors
    Row(Modifier.fillMaxWidth().background(if (me) c.goldBg else androidx.compose.ui.graphics.Color.Transparent).clickable(onClick = onClick).padding(horizontal = Gutter, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(when (e.rank) { 1 -> "🥇"; 2 -> "🥈"; 3 -> "🥉"; else -> "#${e.rank ?: "–"}" }, style = Pc.type.num, color = c.ink, modifier = Modifier.width(44.dp))
        Avatar(e.user, 38.dp); Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(e.user.name, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull("${e.trips} trips", "${e.states} places", "${e.reviews} reviews", e.location).joinToString(" · "), style = Pc.type.small, color = c.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(if (monthly) "${e.monthlyTrips ?: 0} trips" else "${e.points} pts", style = Pc.type.num, color = c.ink)
    }
}

/** Followers or following of a person. */
@Composable
fun PeopleScreen(username: String, kind: String, nav: AppNav) {
    val c = Pc.colors
    var list by remember { mutableStateOf<List<UserLite>?>(null) }
    var refreshing by remember { mutableStateOf(true) }
    LaunchedEffect(username, kind) {
        val cache = nav.graph.db.cache()
        val key = "people:$username:$kind"
        cache.getAs(key, com.unsolo.app.core.model.UserListResponse.serializer())?.let { list = it.items }
        val r = apiCall { if (kind == "followers") nav.graph.api.followers(username) else nav.graph.api.following(username) }
        if (r is ApiResult.Ok) { list = r.value.items; cache.putAs(key, com.unsolo.app.core.model.UserListResponse.serializer(), r.value) }
        else if (list == null) list = emptyList()
        refreshing = false
    }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar(if (kind == "followers") "Followers" else "Following", onBack = { nav.back() }, headerActions = false)
        if (refreshing && list != null) androidx.compose.material3.LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp), color = c.gold, trackColor = c.tonal)
        val l = list
        when {
            l == null -> Column(Modifier.padding(Gutter)) { repeat(6) { Box(Modifier.padding(vertical = 6.dp).fillMaxWidth().height(48.dp).clip(RoundedCornerShape(12.dp)).background(c.tonal)) } }
            l.isEmpty() -> EmptyState(if (kind == "followers") "No followers yet" else "Not following anyone yet", "")
            else -> LazyColumn {
                items(l, key = { it.id }) { u ->
                    Row(Modifier.fillMaxWidth().clickable { if (u.username.isNotBlank()) nav.to(Routes.profile(u.username)) }.padding(horizontal = Gutter, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(u, 40.dp); Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(u.name, style = Pc.type.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("@${u.username}", style = Pc.type.small, color = c.ink2)
                        }
                        if (u.isHost) Tag("Host", TagKind.Host, height = 20.dp)
                    }
                }
            }
        }
    }
}
