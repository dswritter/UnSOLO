package com.unsolo.app.core.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.unsolo.app.core.db.AppDatabase
import com.unsolo.app.core.db.OutboxEntity
import com.unsolo.app.core.db.OutboxType
import com.unsolo.app.core.net.AppJson
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Pending writes (posts, comments, reactions, joins, messages, read receipts, preferences).
 * Items are de-duplicated by clientId (unique index) and drained in order by [OutboxWorker]
 * with a network constraint and exponential backoff; [kick] also drains in-process right away
 * so chat and reactions feel instant when online. Both paths share one mutex.
 */
class Outbox(
    private val context: Context,
    private val db: AppDatabase,
    private val scope: CoroutineScope,
    executorProvider: () -> OutboxExecutor,
) {
    private val mutex = Mutex()
    private val processor by lazy {
        OutboxProcessor(
            store = object : OutboxStore {
                override suspend fun pending() = db.outbox().pending()
                override suspend fun update(item: OutboxEntity) = db.outbox().update(item)
                override suspend fun delete(id: Long) = db.outbox().delete(id)
            },
            executor = executorProvider(),
        )
    }

    /** Listeners told about permanent failures (to flip optimistic UI to "failed"). */
    var onFailed: (suspend (OutboxEntity) -> Unit)? = null

    val pendingCount get() = db.outbox().observePendingCount()

    suspend fun enqueue(type: String, payload: JsonObject = JsonObject(emptyMap()), targetId: String? = null, clientId: String = UUID.randomUUID().toString(), kick: Boolean = true): String {
        db.outbox().insert(OutboxEntity(clientId = clientId, type = type, targetId = targetId, payload = payload.toString()))
        if (kick) kick()
        return clientId
    }

    /**
     * Toggles cancel each other out: queuing UNREACT while REACT is still pending removes both.
     * @return true when the opposite pending item was removed (nothing to send).
     */
    suspend fun cancelOpposite(oppositeType: String, targetId: String): Boolean {
        val existing = db.outbox().pending().firstOrNull { it.type == oppositeType && it.targetId == targetId && it.attempts == 0 }
        return if (existing != null) { db.outbox().delete(existing.id); true } else false
    }

    /** Merge into the pending item of this type (e.g. several preference edits → one PUT). */
    suspend fun enqueueMerged(type: String, patch: JsonObject, targetId: String? = null) {
        val existing = db.outbox().pending().firstOrNull { it.type == type && it.targetId == targetId }
        if (existing != null) {
            val merged = JsonObject(AppJson.parseToJsonElement(existing.payload).jsonObject + patch)
            db.outbox().update(existing.copy(payload = merged.toString()))
            kick()
        } else enqueue(type, patch, targetId)
    }

    suspend fun replacePending(type: String, targetId: String, payload: JsonObject = JsonObject(emptyMap())) {
        db.outbox().deletePending(type, targetId)
        enqueue(type, payload, targetId)
    }

    /** Drain now in-process and schedule the worker as a backstop. */
    fun kick() {
        scope.launch { drain() }
        schedule(context)
    }

    suspend fun drain(): DrainResult = mutex.withLock {
        val r = processor.drain()
        r.failed.forEach { onFailed?.invoke(it) }
        r
    }

    companion object {
        const val WORK_NAME = "outbox-drain"

        fun schedule(context: Context, delaySec: Long = 0) {
            val req = OneTimeWorkRequestBuilder<OutboxWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .apply { if (delaySec > 0) setInitialDelay(delaySec, TimeUnit.SECONDS) }
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, req)
        }

        fun scheduleUpload(context: Context, ownerClientId: String) {
            val req = OneTimeWorkRequestBuilder<UploadWorker>()
                .setInputData(workDataOf(UploadWorker.KEY_OWNER to ownerClientId))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 20, TimeUnit.SECONDS)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("upload-$ownerClientId", ExistingWorkPolicy.KEEP, req)
        }
    }
}

@Suppress("unused")
private val knownTypes = listOf(
    OutboxType.CREATE_POST, OutboxType.COMMENT, OutboxType.REACT, OutboxType.UNREACT, OutboxType.SAVE, OutboxType.UNSAVE,
    OutboxType.JOIN, OutboxType.WITHDRAW, OutboxType.DECIDE, OutboxType.MESSAGE, OutboxType.READ_CHAT,
    OutboxType.READ_NOTIFICATIONS, OutboxType.PREFERENCES, OutboxType.PATCH_ME, OutboxType.REGISTER_DEVICE,
)
