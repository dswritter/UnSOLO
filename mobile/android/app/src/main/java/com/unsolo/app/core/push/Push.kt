package com.unsolo.app.core.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.unsolo.app.BuildConfig
import com.unsolo.app.MainActivity
import com.unsolo.app.R
import com.unsolo.app.UnsoloApp
import com.unsolo.app.core.db.OutboxType
import com.unsolo.app.core.model.DeviceRequest
import com.unsolo.app.core.net.AppJson
import com.unsolo.app.data.putAs
import com.unsolo.app.data.getAs
import com.unsolo.app.ui.nav.DeepLinks
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.jsonObject
import java.util.Locale

object NotificationChannels {
    const val PLANS = "plans"
    const val REPLIES = "replies"
    const val MESSAGES = "messages"
    const val TRIPS = "trips"
    const val SYSTEM = "system"
    const val OFFERS = "offers"
    const val UPLOADS = "uploads"

    /** Contract categories → Android channels (tags ride on replies, marketing on offers). */
    fun forCategory(category: String?) = when (category) {
        PLANS -> PLANS; REPLIES, "tags" -> REPLIES; MESSAGES -> MESSAGES; TRIPS -> TRIPS; "marketing" -> OFFERS; else -> SYSTEM
    }

    fun create(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = context.getSystemService(NotificationManager::class.java)
        listOf(
            NotificationChannel(PLANS, "Plans and requests", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Join requests, approvals and host offers" },
            NotificationChannel(REPLIES, "Replies and tags", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Comments, answers and story tags" },
            NotificationChannel(MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH).apply { description = "Trip, plan and direct chats" },
            NotificationChannel(TRIPS, "Trips", NotificationManager.IMPORTANCE_HIGH).apply { description = "Bookings, departures and payments due" },
            NotificationChannel(SYSTEM, "Account and safety", NotificationManager.IMPORTANCE_DEFAULT),
            NotificationChannel(OFFERS, "Offers and news", NotificationManager.IMPORTANCE_LOW).apply { description = "Deals and price drops (only if you turned on Offers and news)" },
            NotificationChannel(UPLOADS, "Uploads", NotificationManager.IMPORTANCE_LOW).apply { description = "Photo upload progress"; setShowBadge(false) },
        ).forEach { nm.createNotificationChannel(it) }
    }
}

/** FCM is optional until google-services.json is added; every call is guarded. */
object Firebase {
    fun available(context: Context): Boolean = runCatching { FirebaseApp.getApps(context).isNotEmpty() }.getOrDefault(false)
}

class PushRegistrar(private val app: UnsoloApp) {
    suspend fun currentToken(): String? = app.graph.db.cache().getAs(KEY_TOKEN, String.serializer())

    /** Called after sign-in and on launch; upserts POST /devices through the outbox. */
    suspend fun register() {
        val g = app.graph
        if (!g.session.isSignedIn || !g.config.config.value.flags.pushEnabled) return
        if (!Firebase.available(app)) return
        val token = runCatching { kotlinx.coroutines.withTimeout(20_000) { FirebaseMessaging.getInstance().token.await() } }.getOrNull() ?: return
        onToken(token)
    }

    suspend fun onToken(token: String) {
        val g = app.graph
        g.db.cache().putAs(KEY_TOKEN, String.serializer(), token)
        if (!g.session.isSignedIn) return
        val req = DeviceRequest("android", token, BuildConfig.VERSION_NAME, Locale.getDefault().toLanguageTag())
        g.outbox.enqueue(OutboxType.REGISTER_DEVICE, AppJson.encodeToJsonElement(DeviceRequest.serializer(), req).jsonObject,
            clientId = "device:${token.hashCode()}:${System.currentTimeMillis() / 86_400_000}")
    }

    companion object { const val KEY_TOKEN = "fcm_token" }
}

class UnsoloMessagingService : FirebaseMessagingService() {
    private val app get() = application as UnsoloApp

    override fun onNewToken(token: String) {
        app.graph.appScope.launch { app.graph.push.onToken(token) }
    }

    /** Data message: { type, title, body, link, notificationId, category }. */
    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        val title = d["title"] ?: message.notification?.title ?: return
        val body = d["body"] ?: message.notification?.body
        val channel = NotificationChannels.forCategory(d["category"])
        val link = d["link"]?.let { DeepLinks.sanitizePath(it) }
        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            // Unknown or unsafe links open Activity.
            data = Uri.parse("unsolo:/" + (link?.takeIf { DeepLinks.routeForPath(it) != null } ?: "/activity"))
            putExtra(EXTRA_PUSH_TYPE, d["type"] ?: "unknown")
            putExtra(EXTRA_NOTIFICATION_ID, d["notificationId"])
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val id = (d["notificationId"] ?: title).hashCode()
        val pi = PendingIntent.getActivity(this, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.ic_stat_unsolo)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setGroup(channel)
            .build()
        runCatching { NotificationManagerCompat.from(this).notify(id, n) } // no-op without POST_NOTIFICATIONS
        app.graph.appScope.launch { app.graph.activity.refresh() }
    }

    companion object {
        const val EXTRA_PUSH_TYPE = "push_type"
        const val EXTRA_NOTIFICATION_ID = "notification_id"
    }
}
