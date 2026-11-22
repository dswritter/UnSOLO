package com.unsolo.app.core.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.unsolo.app.MainActivity
import com.unsolo.app.R
import com.unsolo.app.UnsoloApp
import com.unsolo.app.core.model.MyTripsResponse
import com.unsolo.app.data.getAs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/**
 * Home-screen countdown: "12 days to Spiti", "Tomorrow", or "Day 2 of 5" during the trip. Reads the
 * bookings saved on the phone, so it works offline; refreshed when Bookings loads and every 3 hours.
 */
class TripCountdownWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try { render(context, manager, ids) } finally { pending.finish() }
        }
    }

    companion object {
        private val zone = ZoneId.of("Asia/Kolkata")
        private val fmt = DateTimeFormatter.ofPattern("EEE d MMM")

        /** Re-draws every countdown widget (call after bookings change). */
        fun updateAll(context: Context) {
            val m = AppWidgetManager.getInstance(context)
            val ids = m.getAppWidgetIds(ComponentName(context, TripCountdownWidget::class.java))
            if (ids.isNotEmpty()) CoroutineScope(Dispatchers.IO).launch { render(context, m, ids) }
        }

        private suspend fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val graph = (context.applicationContext as UnsoloApp).graph
            val trips = runCatching { graph.db.cache().getAs("my_trips", MyTripsResponse.serializer()) }.getOrNull()
            val today = LocalDate.now(zone)
            val next = trips?.upcoming?.filter { it.trip.kind == "trip" }?.firstOrNull { b ->
                val end = runCatching { LocalDate.parse((b.endDate ?: b.travelDate).take(10)) }.getOrNull()
                end == null || !end.isBefore(today)
            }
            val views = RemoteViews(context.packageName, R.layout.widget_countdown)
            val link: String
            if (next == null) {
                views.setInt(R.id.widget_root, "setBackgroundResource", R.drawable.widget_bg)
                views.setTextViewText(R.id.widget_label, "UNSOLO")
                views.setTextViewText(R.id.widget_big, "Where")
                views.setTextViewText(R.id.widget_unit, "next?")
                views.setTextViewText(R.id.widget_title, "No trip booked yet")
                views.setTextViewText(R.id.widget_date, "Tap to explore")
                link = "unsolo://explore"
            } else {
                val start = LocalDate.parse(next.travelDate.take(10))
                val days = ChronoUnit.DAYS.between(today, start)
                val total = next.trip.durationDays.coerceAtLeast(1)
                val place = next.trip.place?.name?.substringBefore(',') ?: next.trip.title
                val live = days <= 0
                views.setInt(R.id.widget_root, "setBackgroundResource", if (live) R.drawable.widget_bg_live else R.drawable.widget_bg)
                val fg = if (live) 0xFFFFFFFF.toInt() else 0xFF111111.toInt()
                val soft = if (live) 0xB3FFFFFF.toInt() else 0xB3111111.toInt()
                listOf(R.id.widget_big, R.id.widget_unit, R.id.widget_title).forEach { views.setTextColor(it, fg) }
                listOf(R.id.widget_label, R.id.widget_date).forEach { views.setTextColor(it, soft) }
                when {
                    live -> {
                        val day = (-days + 1).coerceIn(1, total.toLong())
                        views.setTextViewText(R.id.widget_label, "ON THE TRIP")
                        views.setTextViewText(R.id.widget_big, "Day $day")
                        views.setTextViewText(R.id.widget_unit, "of $total")
                    }
                    days == 1L -> { views.setTextViewText(R.id.widget_label, "NEXT TRIP"); views.setTextViewText(R.id.widget_big, "Tomorrow"); views.setTextViewText(R.id.widget_unit, "") }
                    else -> { views.setTextViewText(R.id.widget_label, "NEXT TRIP"); views.setTextViewText(R.id.widget_big, "$days"); views.setTextViewText(R.id.widget_unit, "days") }
                }
                views.setTextViewText(R.id.widget_title, if (live) place else "to $place")
                views.setTextViewText(R.id.widget_date, start.format(fmt))
                link = if (live) "unsolo://bookings/${next.id}/pack" else "unsolo://bookings"
            }
            val open = PendingIntent.getActivity(context, 7, Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse(link)),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            views.setOnClickPendingIntent(R.id.widget_root, open)
            ids.forEach { manager.updateAppWidget(it, views) }
        }
    }
}
