package com.unsolo.app

import com.unsolo.app.core.model.Seat
import com.unsolo.app.core.model.SeatState
import com.unsolo.app.core.model.UserLite
import com.unsolo.app.ui.components.RingGeometry
import com.unsolo.app.ui.components.YouSeat
import com.unsolo.app.ui.components.ringA11y
import com.unsolo.app.ui.components.ringCaption
import com.unsolo.app.ui.components.ringFromCounts
import com.unsolo.app.ui.components.ringFromSeats
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.max
import kotlin.math.min

/** The ring must match `ring()` in the Full Circle mockups (docs/revamp/design-system.md). */
class SeatRingGeometryTest {
    private val eps = 1e-3f

    @Test fun heroRingWithHostMatchesSpec() {
        val s = 240f; val n = 12
        val g = RingGeometry(s, n, badge = true)
        val pad = max(14f, s * 0.085f)
        val r = s / 2 - pad
        assertEquals(pad, g.pad, eps)
        assertEquals(r, g.r, eps)
        assertEquals(max(4f, s * 0.05f), g.wT, eps)
        assertEquals(max(2f, s * 0.016f), g.wO, eps)
        val d0 = max(12f, min(s * 0.14f, (2 * PI.toFloat() * r / n) * 0.6f))
        val hostGap = min(150f, Math.toDegrees(2.0 * asin(min(1.0, ((36 + d0 / 2 + 4) / r).toDouble()))).toFloat())
        assertEquals(hostGap, g.hostGap, eps)
        val seg = (360 - hostGap) / n
        assertEquals(seg, g.seg, eps)
        assertEquals(min(6f, seg * 0.24f), g.gap, eps)
        assertEquals(-90f + hostGap / 2, g.start, eps)
        assertEquals(g.start + g.gap / 2, g.a0(0), eps)
        assertEquals(g.a0(0) + seg - g.gap, g.a1(0), eps)
        // The open track runs from the first to the last segment edge, continuously.
        assertEquals(g.start + g.gap / 2, g.trackStart, eps)
        assertEquals(360 - hostGap - g.gap, g.trackSweep, eps)
        assertEquals(pad - 13f, g.badgeTop, eps)
    }

    @Test fun smallRingsUseTheSmallPadAndHideDots() {
        val g = RingGeometry(88f, 12, badge = false)
        assertEquals(max(3f, 88f * 0.06f), g.pad, eps)
        assertEquals(0f, g.hostGap, eps)
        assertFalse("12 seats on an 88dp ring are too small for dots", g.showDots)
        val r0 = max(2f, g.r - g.wT / 2 - max(2f, 88f * 0.05f))
        assertEquals(r0, g.r0, eps)
    }

    @Test fun largeRingsShowDots() {
        assertTrue(RingGeometry(240f, 6, badge = true).showDots)
    }

    @Test fun captionsAndLabels() {
        assertEquals("Be first in the circle · 12 seats open", ringCaption(12, 0).text)
        assertEquals("8 of 12 open · 4 going", ringCaption(12, 4).text)
        assertEquals("Full · 12/12", ringCaption(12, 12).text)
        assertEquals("8 of 12 seats open", ringA11y(12, 4))
        assertEquals("Full, 12 of 12 seats taken", ringA11y(12, 12))
    }

    @Test fun seatsMapToRing() {
        val me = UserLite("me", name = "Dev Sharma")
        val seats = listOf(Seat(SeatState.ORGANISER, UserLite("o")), Seat(SeatState.MEMBER, UserLite("m")), Seat(SeatState.YOU, me), Seat(SeatState.OPEN), Seat(SeatState.OPEN))
        val r = ringFromSeats(seats, me.id)
        assertEquals(5, r.total); assertEquals(2, r.taken); assertEquals(YouSeat.You, r.you); assertEquals(3, r.filled)
        assertTrue(r.coTraveller)
        val req = ringFromSeats(listOf(Seat(SeatState.ORGANISER, UserLite("o")), Seat(SeatState.REQUESTED, me), Seat(SeatState.OPEN)), me.id)
        assertEquals(me, req.waiting); assertEquals(1, req.taken)
        val counts = ringFromCounts(12, 5)
        assertEquals(7, counts.taken); assertFalse(counts.full)
        assertTrue(ringFromCounts(10, 0).full)
    }
}
