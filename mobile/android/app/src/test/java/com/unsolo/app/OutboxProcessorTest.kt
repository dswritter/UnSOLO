package com.unsolo.app

import com.unsolo.app.core.db.OutboxEntity
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.sync.ExecResult
import com.unsolo.app.core.sync.OutboxPolicy
import com.unsolo.app.core.sync.OutboxProcessor
import com.unsolo.app.core.sync.OutboxStore
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class OutboxProcessorTest {
    /** In-memory outbox with the same unique-clientId rule as the Room table. */
    class FakeStore : OutboxStore {
        val rows = linkedMapOf<Long, OutboxEntity>()
        private var nextId = 1L
        fun insert(e: OutboxEntity): Boolean {
            if (rows.values.any { it.clientId == e.clientId }) return false // OnConflictStrategy.IGNORE on unique index
            val id = nextId++; rows[id] = e.copy(id = id); return true
        }
        override suspend fun pending() = rows.values.filter { it.state == "pending" }.sortedBy { it.id }
        override suspend fun update(item: OutboxEntity) { rows[item.id] = item }
        override suspend fun delete(id: Long) { rows.remove(id) }
    }

    /** Server that de-duplicates creates by clientId, like POST /posts. */
    class FakeServer {
        val created = mutableMapOf<String, Int>()
        var failNextAfterApplying = 0
        fun create(clientId: String): ApiResult<Unit> {
            created[clientId] = (created[clientId] ?: 0) + 1
            if (failNextAfterApplying > 0) { failNextAfterApplying--; return ApiResult.Offline } // response lost
            return ApiResult.Ok(Unit)
        }
        val distinctObjects get() = created.keys.size
    }

    private fun item(clientId: String, type: String = "create_post") = OutboxEntity(clientId = clientId, type = type)

    @Test fun duplicateEnqueueIsIgnored() {
        val store = FakeStore()
        assertTrue(store.insert(item("a")))
        assertFalse(store.insert(item("a")))
        assertEquals(1, store.rows.size)
    }

    @Test fun lostResponseIsRetriedSafelyWithSameClientId() = runTest {
        val store = FakeStore(); val server = FakeServer().apply { failNextAfterApplying = 1 }
        var now = 0L
        val p = OutboxProcessor(store, { OutboxPolicy.classify(server.create(it.clientId)) }, clock = { now })
        store.insert(item("post-1"))
        val first = p.drain()
        assertTrue(first.needsRetry)
        assertEquals(1, store.rows.values.single().attempts)
        now += OutboxPolicy.backoffMs(0) + 1
        val second = p.drain()
        assertFalse(second.needsRetry)
        assertTrue(store.rows.isEmpty())
        assertEquals(1, server.distinctObjects) // the server saw clientId twice but kept one object
    }

    @Test fun backoffSkipsItemsUntilDue() = runTest {
        val store = FakeStore(); var calls = 0; var now = 1_000L
        val p = OutboxProcessor(store, { calls++; ExecResult.Retry("server_error") }, clock = { now })
        store.insert(item("x"))
        p.drain(); assertEquals(1, calls)
        p.drain(); assertEquals(1, calls) // not due yet
        now += OutboxPolicy.backoffMs(0)
        p.drain(); assertEquals(2, calls)
        assertEquals(now + OutboxPolicy.backoffMs(1), store.rows.values.single().nextAttemptAt)
    }

    @Test fun backoffGrowsExponentiallyAndIsCapped() {
        assertEquals(15_000L, OutboxPolicy.backoffMs(0))
        assertEquals(30_000L, OutboxPolicy.backoffMs(1))
        assertEquals(60_000L, OutboxPolicy.backoffMs(2))
        assertEquals(6 * 60 * 60 * 1000L, OutboxPolicy.backoffMs(30))
    }

    @Test fun givesUpAfterMaxAttempts() = runTest {
        val store = FakeStore(); var now = 0L
        val p = OutboxProcessor(store, { ExecResult.Retry("server_error") }, clock = { now })
        store.insert(item("y"))
        repeat(OutboxPolicy.MAX_ATTEMPTS) { now += 7 * 60 * 60 * 1000L; p.drain() }
        val row = store.rows.values.single()
        assertEquals("failed", row.state)
        assertEquals(OutboxPolicy.MAX_ATTEMPTS, row.attempts)
    }

    @Test fun offlineStopsDrainToKeepOrder() = runTest {
        val store = FakeStore(); val seen = mutableListOf<String>()
        val p = OutboxProcessor(store, { seen += it.clientId; OutboxPolicy.classify(ApiResult.Offline) }, clock = { 0L })
        store.insert(item("1")); store.insert(item("2")); store.insert(item("3"))
        p.drain()
        assertEquals(listOf("1"), seen)
    }

    @Test fun permanentErrorsFailImmediately() = runTest {
        val store = FakeStore()
        val p = OutboxProcessor(store, { OutboxPolicy.classify(ApiResult.Err(403, "phone_required", null)) }, clock = { 0L })
        store.insert(item("z"))
        val r = p.drain()
        assertEquals(1, r.failed.size)
        assertEquals("phone_required", r.failed.single().lastError)
    }

    @Test fun waitDoesNotCountAsAttempt() = runTest {
        val store = FakeStore()
        val p = OutboxProcessor(store, { ExecResult.Wait }, clock = { 0L })
        store.insert(item("w"))
        assertTrue(p.drain().needsRetry)
        assertEquals(0, store.rows.values.single().attempts)
    }

    @Test fun classifyMapsContractErrors() {
        assertEquals(ExecResult.Done, OutboxPolicy.classify(ApiResult.Err(409, "conflict", null)))
        val rl = OutboxPolicy.classify(ApiResult.Err(429, "rate_limited", null, retryAfterSec = 30)) as ExecResult.Retry
        assertEquals(30_000L, rl.retryAfterMs)
        assertTrue(OutboxPolicy.classify(ApiResult.Err(503, "server_error", null)) is ExecResult.Retry)
        assertTrue(OutboxPolicy.classify(ApiResult.Err(400, "bad_request", null)) is ExecResult.Fail)
        assertTrue(OutboxPolicy.classify(ApiResult.Err(426, "upgrade_required", null)) is ExecResult.Fail)
    }
}
