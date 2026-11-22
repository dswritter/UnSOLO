package com.unsolo.app.core.device

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Looper
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

/** A real position (not rounded): only for SOS and live location, which the traveller turns on themselves. */
data class Fix(val lat: Double, val lng: Double, val accuracy: Double?)

/** Precise location for safety features. Asked for only when you raise an SOS or share live location. */
class PreciseLocation(private val context: Context) {
    fun hasPermission() = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun Location.fix() = Fix(latitude, longitude, if (hasAccuracy()) accuracy.toDouble() else null)

    /** Best position within [timeoutMs]: a fresh high-accuracy fix, else the last known one. */
    @SuppressLint("MissingPermission")
    suspend fun now(timeoutMs: Long = 10_000): Fix? {
        if (!hasPermission()) return null
        val client = LocationServices.getFusedLocationProviderClient(context)
        val fresh = withTimeoutOrNull(timeoutMs) { runCatching { client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null).await() }.getOrNull() }
        return (fresh ?: runCatching { client.lastLocation.await() }.getOrNull())?.fix()
    }

    /** Positions every [intervalMs] until the flow is cancelled. */
    @SuppressLint("MissingPermission")
    fun updates(intervalMs: Long = 30_000): Flow<Fix> = callbackFlow {
        if (!hasPermission()) { close(); return@callbackFlow }
        val client = LocationServices.getFusedLocationProviderClient(context)
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs).setMinUpdateIntervalMillis(intervalMs / 2).build()
        val cb = object : LocationCallback() { override fun onLocationResult(r: LocationResult) { r.lastLocation?.let { trySend(it.fix()) } } }
        client.requestLocationUpdates(req, cb, Looper.getMainLooper())
        awaitClose { client.removeLocationUpdates(cb) }
    }
}
