package com.unsolo.app.core.sync

import com.unsolo.app.core.db.OutboxEntity
import com.unsolo.app.core.net.ApiResult
import kotlin.math.min

/** Result of executing one outbox item against the API. */
sealed interface ExecResult {
    /** Applied (or the server already had it: same clientId → original object). */
    data object Done : ExecResult
    /** Transient (offline, 5xx, 429): try again later. [stopDrain] keeps order when offline. */
    data class Retry(val reason: String, val retryAfterMs: Long? = null, val stopDrain: Boolean = false) : ExecResult
    /** Permanent (validation, forbidden, phone_required…): stop retrying, surface to the user. */
    data class Fail(val reason: String) : ExecResult
    /** Waiting for something local (e.g. photos still uploading). Not counted as an attempt. */
    data object Wait : ExecResult
}

interface OutboxStore {
    suspend fun pending(): List<OutboxEntity>
    suspend fun update(item: OutboxEntity)
    suspend fun delete(id: Long)
}

fun interface OutboxExecutor {
    suspend fun execute(item: OutboxEntity): ExecResult
}

object OutboxPolicy {
    const val MAX_ATTEMPTS = 8
    private const val BASE_MS = 15_000L
    private const val CAP_MS = 6 * 60 * 60 * 1000L

    /** 15 s, 30 s, 1 min, 2 min … capped at 6 h. */
    fun backoffMs(attempts: Int): Long = min(CAP_MS, BASE_MS shl (attempts.coerceIn(0, 20)))

    /** Maps a contract error to retry/fail. clientId idempotency makes every retry safe. */
    fun classify(result: ApiResult<*>): ExecResult = when (result) {
        is ApiResult.Ok -> ExecResult.Done
        ApiResult.Offline -> ExecResult.Retry("offline", stopDrain = true)
        is ApiResult.Err -> when {
            result.status == 409 || result.code == "conflict" -> ExecResult.Done
            result.status == 429 || result.code == "rate_limited" -> ExecResult.Retry("rate_limited", result.retryAfterSec?.times(1000))
            result.status >= 500 || result.status == 0 && result.code == "server_error" -> ExecResult.Retry(result.code)
            result.status == 401 -> ExecResult.Fail("unauthorized")
            else -> ExecResult.Fail(result.code)
        }
    }
}

data class DrainResult(val done: Int, val failed: List<OutboxEntity>, val needsRetry: Boolean)

/**
 * Drains the outbox in insertion order. Retries with exponential backoff and gives up after
 * [OutboxPolicy.MAX_ATTEMPTS]. Unit-tested in OutboxProcessorTest.
 */
class OutboxProcessor(
    private val store: OutboxStore,
    private val executor: OutboxExecutor,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    suspend fun drain(): DrainResult {
        var done = 0
        var needsRetry = false
        val failed = mutableListOf<OutboxEntity>()
        for (item in store.pending()) {
            val now = clock()
            if (item.nextAttemptAt > now) { needsRetry = true; continue }
            when (val r = executor.execute(item)) {
                ExecResult.Done -> { store.delete(item.id); done++ }
                ExecResult.Wait -> needsRetry = true
                is ExecResult.Fail -> {
                    val f = item.copy(state = "failed", lastError = r.reason, attempts = item.attempts + 1)
                    store.update(f); failed += f
                }
                is ExecResult.Retry -> {
                    val attempts = item.attempts + 1
                    if (attempts >= OutboxPolicy.MAX_ATTEMPTS) {
                        val f = item.copy(state = "failed", lastError = r.reason, attempts = attempts)
                        store.update(f); failed += f
                    } else {
                        val delay = r.retryAfterMs ?: OutboxPolicy.backoffMs(attempts - 1)
                        store.update(item.copy(attempts = attempts, nextAttemptAt = now + delay, lastError = r.reason))
                        needsRetry = true
                    }
                    if (r.stopDrain) return DrainResult(done, failed, true)
                }
            }
        }
        return DrainResult(done, failed, needsRetry)
    }
}
