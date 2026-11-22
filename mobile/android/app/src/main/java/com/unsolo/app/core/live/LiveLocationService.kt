package com.unsolo.app.core.live

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.unsolo.app.MainActivity
import com.unsolo.app.R
import com.unsolo.app.UnsoloApp
import com.unsolo.app.core.model.LiveLocationUpdate
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.push.NotificationChannels
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Shares your position with one trip group for a set time (you choose 30 min – 4 h), even with the
 * screen off. A notification stays up with a Stop button; it ends by itself when the time is up.
 */
class LiveLocationService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val graph = (application as UnsoloApp).graph
        when (intent?.action) {
            ACTION_STOP -> { stopSharing(graph, intent.getStringExtra(EXTRA_ROOM)); return START_NOT_STICKY }
        }
        val room = intent?.getStringExtra(EXTRA_ROOM) ?: return START_NOT_STICKY
        val minutes = intent.getIntExtra(EXTRA_MINUTES, 60)
        val name = intent.getStringExtra(EXTRA_NAME) ?: "your trip group"
        val until = System.currentTimeMillis() + minutes * 60_000L
        startInForeground(room, name, until)
        _active.value = Share(room, until)
        job?.cancel()
        job = scope.launch {
            var first = true
            launch { delay(minutes * 60_000L); stopSharing(graph, room) }
            graph.precise.updates(30_000).collect { f ->
                val r = graph.trips.shareLocation(room, LiveLocationUpdate(f.lat, f.lng, f.accuracy, if (first) minutes else null))
                if (r is ApiResult.Ok) first = false
            }
        }
        return START_REDELIVER_INTENT
    }

    private fun stopSharing(graph: com.unsolo.app.AppGraph, room: String?) {
        job?.cancel()
        val r = room ?: _active.value?.roomId
        _active.value = null
        if (r != null) scope.launch { graph.trips.stopLocation(r); stopSelf() } else stopSelf()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    }

    private fun startInForeground(room: String, name: String, until: Long) {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
            .setData(android.net.Uri.parse("unsolo://chat/$room")), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val stop = PendingIntent.getService(this, 1, Intent(this, LiveLocationService::class.java).setAction(ACTION_STOP).putExtra(EXTRA_ROOM, room),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(this, NotificationChannels.TRIPS)
            .setSmallIcon(R.drawable.ic_stat_unsolo)
            .setContentTitle("Sharing your live location")
            .setContentText("With $name, until ${java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(until))}")
            .setOngoing(true).setOnlyAlertOnce(true).setContentIntent(open)
            .addAction(0, "Stop sharing", stop)
            .build()
        ServiceCompat.startForeground(this, NOTIF_ID, n, if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0)
    }

    override fun onDestroy() { scope.cancel(); super.onDestroy() }

    data class Share(val roomId: String, val until: Long)

    companion object {
        private const val ACTION_STOP = "stop"
        private const val EXTRA_ROOM = "room"
        private const val EXTRA_MINUTES = "minutes"
        private const val EXTRA_NAME = "name"
        private const val NOTIF_ID = 4242
        private val _active = MutableStateFlow<Share?>(null)
        /** The group you're sharing with right now, if any. */
        val active: StateFlow<Share?> = _active.asStateFlow()

        fun start(context: Context, roomId: String, minutes: Int, groupName: String?) {
            ContextCompat.startForegroundService(context, Intent(context, LiveLocationService::class.java)
                .putExtra(EXTRA_ROOM, roomId).putExtra(EXTRA_MINUTES, minutes).putExtra(EXTRA_NAME, groupName))
        }

        fun stop(context: Context, roomId: String) {
            context.startService(Intent(context, LiveLocationService::class.java).setAction(ACTION_STOP).putExtra(EXTRA_ROOM, roomId))
        }
    }
}
