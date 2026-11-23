package com.unsolo.app.core.util

/**
 * How a trip or plan talks about its spots (same rule as the web's src/lib/seats.ts).
 * "8/12 spots left" on a trip nobody has booked reads as "nobody wants this", so the total
 * only shows once it helps:
 *  - nobody booked yet  → "12 spots open"
 *  - under half booked  → "3 going" (the group size only on the trip page)
 *  - half or more       → "4/12 spots left"
 *  - none left          → "Full"
 */
enum class SeatStage { Open, Going, Filling, Full }

object SeatCopy {
    fun stage(total: Int, left: Int): SeatStage {
        val n = total.coerceAtLeast(0)
        val l = left.coerceIn(0, n)
        val booked = n - l
        return when {
            n > 0 && l <= 0 -> SeatStage.Full
            booked <= 0 -> SeatStage.Open
            booked * 2 < n -> SeatStage.Going
            else -> SeatStage.Filling
        }
    }

    private fun spots(k: Int) = if (k == 1) "spot" else "spots"

    /** Cards, rows, map pins, stories. */
    fun short(total: Int, left: Int): String {
        val n = total.coerceAtLeast(0); val l = left.coerceIn(0, n)
        return when (stage(n, l)) {
            SeatStage.Full -> "Full"
            SeatStage.Open -> "$n ${spots(n)} open"
            SeatStage.Going -> "${n - l} going"
            SeatStage.Filling -> "$l/$n ${spots(l)} left"
        }
    }

    /** Date pills (narrow): "12 open", "3 going", "4/12 left", "Full". */
    fun tiny(total: Int, left: Int): String {
        val n = total.coerceAtLeast(0); val l = left.coerceIn(0, n)
        return when (stage(n, l)) {
            SeatStage.Full -> "Full"
            SeatStage.Open -> "$n open"
            SeatStage.Going -> "${n - l} going"
            SeatStage.Filling -> "$l/$n left"
        }
    }

    /** The trip page itself: same rule, plus the group size while it's under half booked. */
    fun long(total: Int, left: Int): String {
        val n = total.coerceAtLeast(0); val l = left.coerceIn(0, n)
        return when (stage(n, l)) {
            SeatStage.Full -> "Full"
            SeatStage.Open -> "$n ${spots(n)} open"
            SeatStage.Going -> "${n - l} going · group of $n"
            SeatStage.Filling -> "$l of $n ${spots(l)} left"
        }
    }

    /** Ring centre: big number, the tiny "/12" (null until half booked), and the word under it. */
    data class Center(val big: String, val of: String?, val small: String)

    fun center(total: Int, left: Int): Center {
        val n = total.coerceAtLeast(0); val l = left.coerceIn(0, n)
        return when (stage(n, l)) {
            SeatStage.Full -> Center("$n", "/$n", "full")
            SeatStage.Open -> Center("$n", null, "${spots(n)} open")
            SeatStage.Going -> Center("${n - l}", null, "going")
            SeatStage.Filling -> Center("$l", "/$n", "${spots(l)} left")
        }
    }

    /** Worth an urgency line only once half the spots are gone. */
    fun scarce(total: Int?, left: Int?): Boolean = total != null && total > 0 && left != null && stage(total, left) == SeatStage.Filling
}
