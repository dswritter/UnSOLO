package com.unsolo.app.data

import com.unsolo.app.core.db.AppDatabase
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.ApiService
import com.unsolo.app.core.net.apiCall

/** Hosting (docs/revamp/api-v1-host.md): dashboard and trip details are cached so screens open at once. */
class HostRepository(private val db: AppDatabase, private val api: ApiService) {
    suspend fun cachedDashboard() = runCatching { db.cache().getAs(KEY_DASH, HostDashboard.serializer()) }.getOrNull()
    suspend fun dashboard() = apiCall { api.hostDashboard() }.also { if (it is ApiResult.Ok) db.cache().putAs(KEY_DASH, HostDashboard.serializer(), it.value) }
    suspend fun cachedTrip(id: String) = runCatching { db.cache().getAs("host_trip:$id", HostTripDetail.serializer()) }.getOrNull()
    suspend fun trip(id: String) = apiCall { api.hostTrip(id) }.also { if (it is ApiResult.Ok) db.cache().putAs("host_trip:$id", HostTripDetail.serializer(), it.value) }
    suspend fun formOptions() = apiCall { api.hostFormOptions() }
    suspend fun createDestination(name: String, state: String) = apiCall { api.hostCreateDestination(HostNewDestination(name, state)) }
    suspend fun tripForm(id: String) = apiCall { api.hostTripForm(id) }
    suspend fun create(f: TripForm) = apiCall { api.hostCreateTrip(f) }
    suspend fun update(id: String, f: TripForm) = apiCall { api.hostUpdateTrip(id, f) }
    suspend fun patch(id: String, p: HostTripPatch) = apiCall { api.hostPatchTrip(id, p) }
    suspend fun delete(id: String) = apiCall { api.hostDeleteTrip(id) }
    suspend fun decide(id: String, approve: Boolean, reason: String? = null) = apiCall { api.hostDecide(id, HostDecision(if (approve) "approve" else "reject", reason)) }
    suspend fun setServiceActive(id: String, on: Boolean) = apiCall { api.hostPatchService(id, HostServicePatch(on)) }
    suspend fun payout() = apiCall { api.hostPayout() }
    suspend fun savePayout(u: HostPayoutUpdate) = apiCall { api.hostSavePayout(u) }
    suspend fun earnings() = apiCall { api.hostEarnings() }

    // A trip being written, kept on the phone until it's sent (one per trip; "new" for a new one).
    suspend fun draft(key: String) = runCatching { db.cache().getAs("host_draft:$key", TripForm.serializer()) }.getOrNull()
    suspend fun saveDraft(key: String, f: TripForm) = runCatching { db.cache().putAs("host_draft:$key", TripForm.serializer(), f) }
    suspend fun clearDraft(key: String) = runCatching { db.cache().delete("host_draft:$key") }

    companion object { const val KEY_DASH = "host_dashboard" }
}
