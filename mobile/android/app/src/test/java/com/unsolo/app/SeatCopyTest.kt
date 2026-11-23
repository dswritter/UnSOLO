package com.unsolo.app

import com.unsolo.app.core.util.SeatCopy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SeatCopyTest {
    @Test fun nobodyBookedShowsOpenOnly() {
        assertEquals("12 spots open", SeatCopy.short(12, 12))
        assertEquals(SeatCopy.Center("12", null, "spots open"), SeatCopy.center(12, 12))
    }
    @Test fun underHalfShowsBookingsOnly() {
        assertEquals("3 going", SeatCopy.short(12, 9))
        assertEquals("3 going · group of 12", SeatCopy.long(12, 9))
        assertEquals(SeatCopy.Center("5", null, "going"), SeatCopy.center(12, 7))
    }
    @Test fun halfOrMoreShowsLeftOfTotal() {
        assertEquals("6/12 spots left", SeatCopy.short(12, 6))
        assertEquals("1/12 spot left", SeatCopy.short(12, 1))
        assertEquals("4 of 12 spots left", SeatCopy.long(12, 4))
        assertEquals(SeatCopy.Center("4", "/12", "spots left"), SeatCopy.center(12, 4))
    }
    @Test fun full() {
        assertEquals("Full", SeatCopy.short(12, 0))
        assertTrue(SeatCopy.scarce(6, 3)); assertFalse(SeatCopy.scarce(6, 5)); assertFalse(SeatCopy.scarce(null, 3))
    }
}
