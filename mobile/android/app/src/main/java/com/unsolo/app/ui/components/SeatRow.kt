package com.unsolo.app.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.unsolo.app.core.model.Seat
import com.unsolo.app.core.model.SeatState
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens

/**
 * The signature component, as circles: a face (or initials) on a soft tonal fill.
 *  organiser → 2dp ink ring · host → 2dp gold ring · you → gold fill ·
 *  requested → face at 60% + clock badge · held → dashed gold, pulsing · open → 1.5dp dashed rule2.
 */
@Composable
fun SeatCell(seat: Seat, size: Dp = PcTokens.seat, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    val c = Pc.colors
    val label = when (seat.state) {
        SeatState.OPEN -> "Open seat"
        SeatState.HELD -> "Seat held"
        SeatState.REQUESTED -> "${seat.user?.firstName ?: "Someone"} requested"
        SeatState.YOU -> "You"
        SeatState.HOST -> "Host ${seat.user?.name.orEmpty()}"
        SeatState.ORGANISER -> "Organiser ${seat.user?.name.orEmpty()}"
        else -> seat.user?.name ?: "Traveller"
    }
    val textSize = (size.value * 0.36f).coerceIn(11f, 16f).sp
    Box(modifier.size(size).semantics { contentDescription = label }.then(if (onClick != null) Modifier.clip(CircleShape).clickable(onClick = onClick) else Modifier)) {
        when (seat.state) {
            SeatState.OPEN -> Box(Modifier.fillMaxSize().dashedBorder(c.rule2, radius = size / 2, width = 1.5.dp, on = 3.dp, off = 3.dp))
            SeatState.HELD -> {
                val t = rememberInfiniteTransition(label = "held")
                val a by t.animateFloat(0.45f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "pulse")
                Box(Modifier.fillMaxSize().alpha(a).clip(CircleShape).background(c.goldBg).dashedBorder(c.gold, radius = size / 2, width = 1.5.dp, on = 3.dp, off = 3.dp))
            }
            SeatState.YOU -> Box(Modifier.fillMaxSize().clip(CircleShape).background(c.gold), contentAlignment = Alignment.Center) {
                Text(seat.user?.initials ?: "YOU", style = Pc.type.smallStrong.copy(fontSize = textSize), color = c.onGold)
            }
            else -> {
                val ring = when (seat.state) { SeatState.ORGANISER -> c.ink; SeatState.HOST -> c.gold; else -> null }
                val inner = if (ring != null) Modifier.fillMaxSize().border(2.dp, ring, CircleShape).padding(3.dp) else Modifier.fillMaxSize()
                Box(inner.clip(CircleShape).background(tonal()), contentAlignment = Alignment.Center) {
                    val url = seat.user?.avatarUrl
                    val a = if (seat.state == SeatState.REQUESTED) 0.6f else 1f
                    if (url != null) {
                        AsyncImage(ImageRequest.Builder(LocalContext.current).data(url).build(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, alpha = a)
                    } else if (seat.user != null) {
                        Text(seat.user.initials, style = Pc.type.smallStrong.copy(fontSize = textSize), color = c.ink.copy(alpha = a))
                    } else {
                        // Faces are only sent to signed-in viewers: a taken seat without identity.
                        PcIcon(PcIcons.User, null, tint = c.ink3, size = size * 0.45f)
                    }
                }
                if (seat.state == SeatState.REQUESTED) {
                    Box(Modifier.align(Alignment.BottomEnd).offset(2.dp, 2.dp).size(17.dp).clip(CircleShape).background(c.paper).padding(1.5.dp).clip(CircleShape).background(c.ink), contentAlignment = Alignment.Center) {
                        PcIcon(PcIcons.Clock, null, tint = c.onInk, size = 11.dp)
                    }
                }
            }
        }
    }
}

/**
 * Seats laid out in rows; as many per row as fit (or [perRow] when smaller).
 * Beyond 16 seats it collapses to "18 of 24" + a bar.
 */
@Composable
fun SeatRow(seats: List<Seat>, modifier: Modifier = Modifier, perRow: Int? = null, gap: Dp = 8.dp, maxCell: Dp = PcTokens.seat, onSeat: ((Seat) -> Unit)? = null) {
    if (seats.size > 16) { CollapsedSeats(seats, modifier); return }
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val fit = ((maxWidth + gap) / (maxCell + gap)).toInt().coerceAtLeast(1)
        val n = (perRow ?: fit).coerceAtMost(fit).coerceAtLeast(1)
        Column(verticalArrangement = Arrangement.spacedBy(gap)) {
            seats.chunked(n).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    row.forEach { s -> SeatCell(s, maxCell, onClick = onSeat?.let { { it(s) } }) }
                }
            }
        }
    }
}

/** Compact dot strip for list rows (Explore departures, host hub). */
@Composable
fun SeatStrip(seats: List<Seat>, modifier: Modifier = Modifier, cell: Dp = 12.dp, max: Int = 14) {
    BoxWithConstraints(modifier) {
        val gap = 4.dp
        val fit = ((maxWidth + gap) / (cell + gap)).toInt().coerceAtLeast(1)
        val shown = minOf(max, fit, seats.size)
        val hidden = seats.size - shown
        val c = Pc.colors
        Row(horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = Alignment.CenterVertically) {
            seats.take(if (hidden > 0) (shown - 2).coerceAtLeast(1) else shown).forEach { s ->
                when (s.state) {
                    SeatState.OPEN -> Box(Modifier.size(cell).dashedBorder(c.rule2, radius = cell / 2, width = 1.2.dp, on = 2.dp, off = 2.dp))
                    SeatState.YOU -> Box(Modifier.size(cell).clip(CircleShape).background(c.gold))
                    SeatState.HOST -> Box(Modifier.size(cell).border(2.dp, c.gold, CircleShape).padding(2.5.dp).clip(CircleShape).background(c.ink.copy(alpha = 0.55f)))
                    SeatState.HELD -> Box(Modifier.size(cell).dashedBorder(c.gold, radius = cell / 2, width = 1.2.dp, on = 2.dp, off = 2.dp))
                    else -> Box(Modifier.size(cell).clip(CircleShape).background(c.ink.copy(alpha = 0.55f)))
                }
            }
            if (hidden > 0) Text("+${seats.size - (shown - 2).coerceAtLeast(1)}", style = Pc.type.label, color = Pc.colors.ink2)
        }
    }
}

/** Seat strip from counts only (TripLite gives seatsLeft/seatsTotal, not seats). */
fun seatsFromCounts(total: Int?, left: Int?, hostFirst: Boolean = true): List<Seat> {
    val t = (total ?: 0).coerceIn(0, 40)
    val l = (left ?: 0).coerceIn(0, t)
    val taken = t - l
    return List(t) { i ->
        when {
            i == 0 && hostFirst && taken > 0 -> Seat(SeatState.HOST)
            i < taken -> Seat(SeatState.MEMBER)
            else -> Seat(SeatState.OPEN)
        }
    }
}

@Composable
private fun CollapsedSeats(seats: List<Seat>, modifier: Modifier) {
    val c = Pc.colors
    val taken = seats.count { it.state != SeatState.OPEN }
    Column(modifier.fillMaxWidth()) {
        Text("$taken of ${seats.size}", style = Pc.type.num, color = c.ink)
        Spacer(Modifier.height(6.dp))
        Box(Modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(tonal())) {
            Box(Modifier.fillMaxHeight().fillMaxWidth(taken / seats.size.toFloat()).clip(CircleShape).background(c.ink))
        }
    }
}
