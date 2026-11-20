package com.unsolo.app.ui

import com.unsolo.app.core.model.Post
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Display formats used on the chart (Asia/Kolkata wall time for timestamps). */
object Fmt {
    private val zone: ZoneId = ZoneId.of("Asia/Kolkata")
    private val dayMon = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)
    private val dowDayMon = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)
    private val dd = DateTimeFormatter.ofPattern("dd", Locale.ENGLISH)
    private val mon = DateTimeFormatter.ofPattern("MMM", Locale.ENGLISH)
    private val dow = DateTimeFormatter.ofPattern("EEE", Locale.ENGLISH)
    private val time = DateTimeFormatter.ofPattern("HH:mm", Locale.ENGLISH)

    fun date(s: String?): LocalDate? = s?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
    fun instant(s: String?): Instant? = s?.let { runCatching { Instant.parse(it) }.getOrNull() }

    fun dayMonth(s: String?) = date(s)?.format(dayMon) ?: ""
    fun dowDayMonth(s: String?) = date(s)?.format(dowDayMon) ?: ""
    fun dayNum(s: String?) = date(s)?.format(dd) ?: "--"
    fun monUpper(s: String?) = date(s)?.format(mon)?.uppercase() ?: ""
    fun dowUpper(s: String?) = date(s)?.format(dow)?.uppercase() ?: ""

    /** "12–18 Jan", "28 Nov – 2 Dec", "Sun 6 Dec". */
    fun range(start: String?, end: String?): String {
        val a = date(start) ?: return ""
        val b = date(end)
        if (b == null || b == a) return a.format(dowDayMon)
        return if (a.month == b.month) "${a.dayOfMonth}–${b.dayOfMonth} ${a.format(mon)}" else "${a.format(dayMon)} – ${b.format(dayMon)}"
    }

    fun daysUntil(s: String?, today: LocalDate = LocalDate.now(zone)): Long? = date(s)?.let { ChronoUnit.DAYS.between(today, it) }

    fun inDays(s: String?): String = when (val d = daysUntil(s)) {
        null -> ""
        0L -> "today"
        1L -> "tomorrow"
        in 2..60 -> "in $d days"
        else -> dayMonth(s)
    }

    /** Feed/inbox timestamps: "now", "5m", "2h", "Yesterday", "Mon", "14 Nov". */
    fun ago(iso: String?, now: Instant = Instant.now()): String {
        val t = instant(iso) ?: return ""
        val d = Duration.between(t, now)
        val local = t.atZone(zone).toLocalDate()
        val today = now.atZone(zone).toLocalDate()
        return when {
            d.toMinutes() < 1 -> "now"
            d.toMinutes() < 60 -> "${d.toMinutes()}m"
            d.toHours() < 24 && local == today -> "${d.toHours()}h"
            local == today.minusDays(1) -> "Yesterday"
            d.toDays() < 7 -> t.atZone(zone).format(dow)
            else -> t.atZone(zone).format(dayMon)
        }
    }

    fun clock(iso: String?) = instant(iso)?.atZone(zone)?.format(time) ?: ""

    fun nights(days: Int) = if (days <= 1) "1D" else "${days}D/${days - 1}N"
}

/** "2 in · 3 open" etc. */
fun Post.spotsLine(): String {
    val total = spotsTotal ?: seats.size
    val open = (total - memberCount).coerceAtLeast(0)
    return "$memberCount in · $open open"
}

fun audienceLabel(a: String) = when (a) { "women" -> "Women only"; "verified" -> "Verified travellers"; else -> "Anyone" }
