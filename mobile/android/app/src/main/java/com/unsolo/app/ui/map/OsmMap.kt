package com.unsolo.app.ui.map

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.BitmapDrawable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.unsolo.app.ui.theme.Pc
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

/** One pin: a coloured dot with a short label (price, name). */
data class MapMarker(val id: String, val lat: Double, val lng: Double, val label: String, val color: Color, val selected: Boolean = false)

/** India, roughly, for an empty map. */
private val INDIA = BoundingBox(35.5, 97.5, 7.5, 68.0)

/**
 * OpenStreetMap (osmdroid) with label pins. Fits all pins the first time they arrive (or India
 * when there are none). Tapping a pin calls [onPin].
 */
@Composable
fun OsmMap(markers: List<MapMarker>, modifier: Modifier = Modifier, fitKey: Any? = null, onPin: (String) -> Unit = {}) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val density = context.resources.displayMetrics.density
    val ink = Pc.colors.ink.toArgb(); val paper = Pc.colors.raised.toArgb()
    val map = remember {
        Configuration.getInstance().apply {
            userAgentValue = context.packageName
            osmdroidBasePath = java.io.File(context.cacheDir, "osm"); osmdroidTileCache = java.io.File(context.cacheDir, "osm/tiles")
        }
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
            minZoomLevel = 4.0; maxZoomLevel = 18.0
            isTilesScaledToDpi = true
            isHorizontalMapRepetitionEnabled = false; isVerticalMapRepetitionEnabled = false
            clipToOutline = true
        }
    }
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e -> when (e) { Lifecycle.Event.ON_RESUME -> map.onResume(); Lifecycle.Event.ON_PAUSE -> map.onPause(); else -> Unit } }
        lifecycle.addObserver(obs); map.onResume()
        onDispose { lifecycle.removeObserver(obs); map.onPause(); map.onDetach() }
    }
    // Re-fit when the category changes or a different set of places arrives (cached, then fresh),
    // but not when only the selected pin changes.
    val placesKey = remember(markers) { markers.map { it.id }.toSet() }
    var fitted by remember(fitKey, placesKey) { mutableStateOf(false) }
    Box(modifier.clipToBounds()) {
        AndroidView({ map }, Modifier.fillMaxSize().clipToBounds()) { mv ->
            mv.overlays.removeAll { it is Marker }
            markers.sortedBy { it.selected }.forEach { m ->
                mv.overlays.add(Marker(mv).apply {
                    position = GeoPoint(m.lat, m.lng)
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                    icon = pinDrawable(mv, m.label, if (m.selected) ink else m.color.toArgb(), if (m.selected) paper else android.graphics.Color.WHITE, density)
                    setOnMarkerClickListener { _, _ -> onPin(m.id); true }
                    infoWindow = null
                })
            }
            if (!fitted) {
                mv.post {
                    // Pins all in one spot (or one pin): centre on it. A near-zero box makes osmdroid
                    // zoom somewhere else entirely.
                    val latSpan = (markers.maxOfOrNull { it.lat } ?: 0.0) - (markers.minOfOrNull { it.lat } ?: 0.0)
                    val lngSpan = (markers.maxOfOrNull { it.lng } ?: 0.0) - (markers.minOfOrNull { it.lng } ?: 0.0)
                    if (markers.isEmpty()) mv.zoomToBoundingBox(INDIA, false)
                    else if (markers.size == 1 || (latSpan < 0.02 && lngSpan < 0.02)) {
                        mv.controller.setZoom(12.0); mv.controller.setCenter(GeoPoint(markers.map { it.lat }.average(), markers.map { it.lng }.average()))
                    }
                    else mv.zoomToBoundingBox(BoundingBox.fromGeoPoints(markers.map { GeoPoint(it.lat, it.lng) }).increaseByScale(1.3f), false, (40 * density).toInt())
                }
                if (markers.isNotEmpty()) fitted = true
            }
            mv.invalidate()
        }
        Text("© OpenStreetMap contributors", fontSize = 9.sp, color = Color(0xFF333333),
            modifier = Modifier.align(Alignment.BottomEnd).navigationBarsPadding().background(Color.White.copy(alpha = 0.75f)).padding(horizontal = 4.dp, vertical = 1.dp))
    }
}

/** A rounded label with a little point at the bottom. */
private fun pinDrawable(mv: MapView, label: String, bg: Int, fg: Int, d: Float): BitmapDrawable {
    val text = label.take(18)
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 12 * d; color = fg; typeface = android.graphics.Typeface.DEFAULT_BOLD }
    val padX = 8 * d; val h = 24 * d; val tip = 6 * d
    val w = (p.measureText(text) + padX * 2).coerceAtLeast(h)
    val bmp = android.graphics.Bitmap.createBitmap(w.toInt() + 2, (h + tip).toInt() + 2, android.graphics.Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = bg }
    val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x33000000; style = Paint.Style.STROKE; strokeWidth = d }
    c.drawRoundRect(RectF(1f, 1f, w, h), h / 2, h / 2, fill)
    c.drawRoundRect(RectF(1f, 1f, w, h), h / 2, h / 2, stroke)
    val path = android.graphics.Path().apply { moveTo(w / 2 - tip, h - 1); lineTo(w / 2, h + tip); lineTo(w / 2 + tip, h - 1); close() }
    c.drawPath(path, fill)
    c.drawText(text, padX, h / 2 - (p.descent() + p.ascent()) / 2, p)
    return BitmapDrawable(mv.resources, bmp)
}
