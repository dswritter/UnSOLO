package com.unsolo.app.core.sync

import android.app.Notification
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.unsolo.app.R
import com.unsolo.app.UnsoloApp
import com.unsolo.app.core.db.LocalState
import com.unsolo.app.core.model.Media
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.AppJson
import com.unsolo.app.core.net.apiCall
import com.unsolo.app.core.push.NotificationChannels
import kotlinx.coroutines.launch
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import okio.source
import java.io.File
import java.util.concurrent.TimeUnit

private val Context.graph get() = (applicationContext as UnsoloApp).graph

class OutboxWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val r = applicationContext.graph.outbox.drain()
        return if (r.needsRetry && runAttemptCount < 20) Result.retry() else Result.success()
    }
}

/** Uploads the compressed photos of one post (owner clientId), then lets the outbox publish it. */
class UploadWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun getForegroundInfo(): ForegroundInfo = foreground(0, 0)

    private fun foreground(done: Int, total: Int): ForegroundInfo {
        val n: Notification = NotificationCompat.Builder(applicationContext, NotificationChannels.UPLOADS)
            .setSmallIcon(R.drawable.ic_stat_unsolo)
            .setContentTitle("Uploading photos")
            .setContentText(if (total > 0) "$done of $total" else "Preparing…")
            .setProgress(total, done, total == 0)
            .setOngoing(true)
            .setSilent(true)
            .build()
        return if (Build.VERSION.SDK_INT >= 29) ForegroundInfo(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else ForegroundInfo(NOTIF_ID, n)
    }

    override suspend fun doWork(): Result {
        val g = applicationContext.graph
        val owner = inputData.getString(KEY_OWNER) ?: return Result.failure()
        val items = g.db.media().forOwner(owner)
        // "preparing" rows are still being compressed; their upload is scheduled once they're ready.
        val todo = items.filter { it.state != "done" && it.state != "preparing" }
        if (todo.isEmpty()) { g.outbox.kick(); return Result.success() }
        if (todo.size >= LARGE_BATCH) runCatching { setForeground(foreground(items.size - todo.size, items.size)) }
        for (m in todo) {
            val file = File(m.localPath)
            if (!file.exists()) { g.db.media().progress(m.id, 0f, "failed"); continue }
            g.db.media().progress(m.id, 0f, "uploading")
            var lastReported = 0f
            val body = ProgressBody(file, "image/jpeg".toMediaType()) { frac: Float ->
                if (frac - lastReported >= 0.05f || frac >= 1f) {
                    lastReported = frac
                    g.appScope.launch { g.db.media().progress(m.id, frac, "uploading") }
                }
            }
            val part = MultipartBody.Part.createFormData("file", file.name, body)
            when (val r = apiCall { g.api.upload(part, m.purpose.toRequestBody("text/plain".toMediaType())) }) {
                is ApiResult.Ok -> g.db.media().upsert(m.copy(state = "done", progress = 1f, resultJson = AppJson.encodeToString(Media.serializer(), r.value)))
                ApiResult.Offline -> { g.db.media().progress(m.id, 0f, "queued"); return Result.retry() }
                is ApiResult.Err -> if (r.status >= 500 || r.status == 429) { g.db.media().progress(m.id, 0f, "queued"); return Result.retry() } else {
                    g.db.media().progress(m.id, 0f, "failed")
                    g.tribe.markLocalPostState(owner, LocalState.FAILED)
                }
            }
            if (todo.size >= LARGE_BATCH) runCatching { setForeground(foreground(g.db.media().forOwner(owner).count { it.state == "done" }, items.size)) }
        }
        g.outbox.kick()
        return Result.success()
    }

    companion object {
        const val KEY_OWNER = "owner"
        const val LARGE_BATCH = 3
        private const val NOTIF_ID = 4201
    }
}

class ProgressBody(private val file: File, private val type: MediaType, private val onProgress: (Float) -> Unit) : RequestBody() {
    override fun contentType() = type
    override fun contentLength() = file.length()
    override fun writeTo(sink: BufferedSink) {
        val total = contentLength().coerceAtLeast(1)
        var sent = 0L
        file.source().use { src ->
            val buf = okio.Buffer()
            while (true) {
                val n = src.read(buf, 64 * 1024)
                if (n == -1L) break
                sink.write(buf, n)
                sent += n
                onProgress(sent.toFloat() / total)
            }
        }
    }
}

/** GET /sync?since= plus config refresh (kill switches) — periodic 15 min and on app foreground. */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ok = applicationContext.graph.syncNow()
        return if (ok || runAttemptCount > 3) Result.success() else Result.retry()
    }

    companion object {
        fun schedulePeriodic(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("periodic-sync", ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun runOnce(context: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("foreground-sync", ExistingWorkPolicy.REPLACE, req)
        }
    }
}

/** Flushes queued analytics when the app goes to the background. */
class EventsFlushWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result =
        if (applicationContext.graph.analytics.flush() || runAttemptCount > 5) Result.success() else Result.retry()

    companion object {
        fun schedule(context: Context) {
            val req = OneTimeWorkRequestBuilder<EventsFlushWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("events-flush", ExistingWorkPolicy.REPLACE, req)
        }
    }
}
