package com.unsolo.app.core.device

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import kotlin.math.round

/** Drives the "Offline · showing saved" banner. */
class ConnectivityObserver(context: Context) {
    private val cm = context.getSystemService(ConnectivityManager::class.java)
    private val _online = MutableStateFlow(currentlyOnline())
    val online: StateFlow<Boolean> = _online.asStateFlow()

    init {
        runCatching {
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) { _online.value = true }
                override fun onLost(network: Network) { _online.value = currentlyOnline() }
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    _online.value = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                }
            })
        }
    }

    private fun currentlyOnline(): Boolean = runCatching {
        cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }.getOrDefault(true)
}

data class Coarse(val lat: Double, val lng: Double)

/**
 * Coarse location only (ACCESS_COARSE_LOCATION), asked when the user turns on "suggestions near me"
 * or taps "Near you". Coordinates are rounded to 2 decimals (~1 km) and kept in memory only.
 */
class CoarseLocation(private val context: Context) {
    @Volatile var last: Coarse? = null; private set

    fun hasPermission() = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    suspend fun get(): Coarse? {
        if (!hasPermission()) return null
        val loc = withTimeoutOrNull(8_000) { fused() ?: platform() }
        return loc?.let { Coarse(round2(it.latitude), round2(it.longitude)) }?.also { last = it }
    }

    @SuppressLint("MissingPermission")
    private suspend fun fused(): Location? {
        val gms = runCatching { GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS }.getOrDefault(false)
        if (!gms) return null
        return runCatching {
            val client = LocationServices.getFusedLocationProviderClient(context)
            client.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, null).await() ?: client.lastLocation.await()
        }.getOrNull()
    }

    @SuppressLint("MissingPermission")
    private suspend fun platform(): Location? = withContext(Dispatchers.IO) {
        val lm = context.getSystemService(LocationManager::class.java) ?: return@withContext null
        val provider = LocationManager.NETWORK_PROVIDER.takeIf { lm.isProviderEnabled(it) } ?: return@withContext null
        if (Build.VERSION.SDK_INT >= 30) {
            suspendCancellableCoroutine { cont ->
                runCatching {
                    lm.getCurrentLocation(provider, null, ContextCompat.getMainExecutor(context)) { cont.resume(it) }
                }.onFailure { cont.resume(lm.getLastKnownLocation(provider)) }
            }
        } else lm.getLastKnownLocation(provider)
    }

    companion object { fun round2(v: Double) = round(v * 100) / 100 }
}
