package com.unsolo.app.ui.status

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateRotation
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.exifinterface.media.ExifInterface
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

val StoryAspects = listOf("story" to 9f / 16f, "4:5" to 4f / 5f, "1:1" to 1f, "original" to 0f)
private fun aspectLabel(k: String) = when (k) { "story" -> "Story"; "original" -> "Original"; "wide" -> "16:9"; else -> k }
/** Trip photos: always 16:9, like the web. */
val TripAspects = listOf("wide" to 16f / 9f)

/**
 * Crop a photo before it goes up, Instagram style: two fingers zoom and twist it (it snaps
 * straight near 0°/90°), one finger drags it, double-tap zooms. The photo always covers the frame.
 * Pick a shape, or turn it a quarter at a time. "Done" writes a new JPEG and returns its Uri.
 */
@Composable
fun PhotoEditor(source: Uri, onCancel: () -> Unit, aspects: List<Pair<String, Float>> = StoryAspects, onDone: (Uri) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val tick = rememberTick()
    var bitmap by remember(source) { mutableStateOf<Bitmap?>(null) }
    var aspectKey by remember { mutableStateOf(aspects.first().first) }
    // Photo centre = frame centre + offset; drawn at [scale] and turned [angle] degrees.
    var scale by remember { mutableFloatStateOf(0f) }
    var angle by remember { mutableFloatStateOf(0f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var touching by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var box by remember { mutableStateOf(IntSize.Zero) }
    LaunchedEffect(source) { bitmap = withContext(Dispatchers.IO) { decodeUpright(context, source, 2400) } }
    DarkBarsForEditor()
    val bars = rememberHostBars()
    val bmp = bitmap
    Column(Modifier.fillMaxSize().background(Color.Black).padding(top = bars.first, bottom = bars.second)) {
        if (bmp == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { androidx.compose.material3.CircularProgressIndicator(Modifier.size(36.dp), color = Color.White, strokeWidth = 3.dp) }
            return@Column
        }
        val iw = bmp.width.toFloat(); val ih = bmp.height.toFloat()
        val aspect = aspects.first { it.first == aspectKey }.second.takeIf { it > 0f } ?: (iw / ih)
        val density = context.resources.displayMetrics.density
        // The crop frame: as big as fits with a margin, centred.
        val f = run {
            val w = box.width.toFloat(); val h = box.height.toFloat()
            if (w <= 0f || h <= 0f) Rect.Zero else {
                val margin = 16f * density
                var fw = w - margin * 2; var fh = fw / aspect
                if (fh > h - margin * 2) { fh = h - margin * 2; fw = fh * aspect }
                Rect(Offset((w - fw) / 2, (h - fh) / 2), Size(fw, fh))
            }
        }
        val shown = snapAngle(angle)
        val minS = coverScale(f.width, f.height, iw, ih, shown)
        if (scale < minS) scale = minS
        val fit by rememberUpdatedState(Triple(f, iw to ih, minS))
        fun settle() {
            val (fr, dims, _) = fit
            val a = snapAngle(angle)
            val m = coverScale(fr.width, fr.height, dims.first, dims.second, a)
            scale = scale.coerceIn(m, m * 8f)
            offset = clampOffset(offset, scale, a, fr.width, fr.height, dims.first, dims.second)
        }
        val img = remember(bmp) { bmp.asImageBitmap() }
        Canvas(Modifier.weight(1f).fillMaxWidth().onSizeChanged { box = it }
            .pointerInput(bmp) { detectTapGestures(onDoubleTap = { c ->
                val (fr, _, m) = fit
                val target = if (scale > m * 1.6f) m else m * 2.5f
                val k = target / scale
                val v = c - fr.center
                offset = v + (offset - v) * k; scale = target; settle(); tick()
            }) }
            .pointerInput(bmp) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    touching = true
                    val startSnap = snapAngle(angle)
                    do {
                        val ev = awaitPointerEvent()
                        val zoomC = ev.calculateZoom(); val rot = ev.calculateRotation(); val pan = ev.calculatePan()
                        val c = ev.calculateCentroid(useCurrent = true)
                        if (zoomC != 1f || rot != 0f || pan != Offset.Zero) {
                            val fr = fit.first
                            val v = if (c.isSpecified) c - fr.center else Offset.Zero
                            // Turn and scale the photo about the fingers, then move it with them.
                            val rad = Math.toRadians(rot.toDouble())
                            val d = offset - v
                            val r = Offset((d.x * cos(rad) - d.y * sin(rad)).toFloat(), (d.x * sin(rad) + d.y * cos(rad)).toFloat())
                            offset = v + r * zoomC + pan
                            scale *= zoomC; angle += rot
                            settle()
                            ev.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    } while (ev.changes.any { it.pressed })
                    touching = false
                    if (snapAngle(angle) != startSnap && snapAngle(angle) % 90f == 0f) tick()
                    angle = snapAngle(angle); settle()
                }
            }) {
            if (f == Rect.Zero) return@Canvas
            withTransform({
                translate(f.center.x + offset.x, f.center.y + offset.y)
                rotate(shown, pivot = Offset.Zero)
                scale(scale, scale, pivot = Offset.Zero)
            }) {
                drawImage(img, srcOffset = IntOffset.Zero, srcSize = IntSize(bmp.width, bmp.height),
                    dstOffset = IntOffset((-iw / 2).roundToInt(), (-ih / 2).roundToInt()), dstSize = IntSize(bmp.width, bmp.height),
                    filterQuality = FilterQuality.Medium)
            }
            // Dim outside the frame, outline, and a thirds grid while you move it.
            clipRect(f.left, f.top, f.right, f.bottom, clipOp = ClipOp.Difference) { drawRect(Color.Black.copy(alpha = 0.62f)) }
            drawRect(Color.White, f.topLeft, f.size, style = Stroke(1.5.dp.toPx()))
            val gridA = if (touching) 0.45f else 0.18f
            for (k in 1..2) {
                val x = f.left + f.width * k / 3; val y = f.top + f.height * k / 3
                drawLine(Color.White.copy(alpha = gridA), Offset(x, f.top), Offset(x, f.bottom), 1.dp.toPx())
                drawLine(Color.White.copy(alpha = gridA), Offset(f.left, y), Offset(f.right, y), 1.dp.toPx())
            }
        }
        // Controls under the photo, above the navigation bar.
        Column(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val deg = (((shown % 360f) + 540f) % 360f - 180f).roundToInt()
            Text(if (deg != 0 && deg % 90 != 0) "${deg}° · tap to straighten" else "Pinch to zoom · twist to rotate · drag to move",
                style = Pc.type.label, color = Color.White.copy(alpha = 0.75f),
                modifier = Modifier.clip(CircleShape).clickable(enabled = deg % 90 != 0) { angle = (Math.round(shown / 90f) * 90f); settle(); tick() }.padding(horizontal = 10.dp, vertical = 4.dp))
            if (aspects.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                aspects.forEach { (k, _) ->
                    val on = k == aspectKey
                    Text(aspectLabel(k), style = Pc.type.smallStrong.copy(fontWeight = FontWeight.Bold), color = if (on) Color.Black else Color.White,
                        modifier = Modifier.clip(CircleShape).background(if (on) Color.White else Color.White.copy(alpha = 0.16f))
                            .clickable { aspectKey = k; scale = 0f; offset = Offset.Zero; tick() }.padding(horizontal = 14.dp, vertical = 8.dp))
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                EditorPill("Cancel", onClick = onCancel)
                Spacer(Modifier.weight(1f))
                EditorPill("Rotate", icon = PcIcons.Refresh) { tick(); angle = Math.round(shown / 90f) * 90f + 90f; scale = 0f; offset = Offset.Zero }
                Spacer(Modifier.weight(1f))
                EditorPill("Done", primary = true, loading = saving) {
                    if (saving || f == Rect.Zero) return@EditorPill
                    saving = true
                    val fr = f; val s = scale; val a = shown; val o = offset
                    scope.launch {
                        val out = withContext(Dispatchers.IO) { runCatching { renderCrop(context, bmp, fr, s, a, o) }.getOrNull() }
                        saving = false
                        if (out != null) onDone(out) else onCancel()
                    }
                }
            }
        }
    }
}

@Composable
private fun EditorPill(label: String, primary: Boolean = false, loading: Boolean = false, icon: androidx.compose.ui.graphics.vector.ImageVector? = null, onClick: () -> Unit) {
    Row(Modifier.heightIn(min = 44.dp).clip(CircleShape).background(if (primary) Color(0xFFFCBA12) else Color.White.copy(alpha = 0.16f))
        .clickable(onClick = onClick).padding(horizontal = 18.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        if (loading) androidx.compose.material3.CircularProgressIndicator(Modifier.size(16.dp), color = Color.Black, strokeWidth = 2.dp)
        else {
            icon?.let { PcIcon(it, null, tint = Color.White, size = 18.dp); Spacer(Modifier.width(6.dp)) }
            Text(label, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = if (primary) Color.Black else Color.White)
        }
    }
}

/** Within 3° of a quarter turn counts as straight. */
internal fun snapAngle(a: Float): Float { val q = Math.round(a / 90f) * 90f; return if (abs(a - q) < 3f) q else a }

/** Smallest scale at which the photo, turned [deg], still covers a [fw]×[fh] frame. */
internal fun coverScale(fw: Float, fh: Float, iw: Float, ih: Float, deg: Float): Float {
    if (fw <= 0f || fh <= 0f) return 1f
    val r = Math.toRadians(deg.toDouble()); val c = abs(cos(r)).toFloat(); val s = abs(sin(r)).toFloat()
    return max((fw * c + fh * s) / iw, (fw * s + fh * c) / ih)
}

/** Keeps every frame corner on the photo: clamp in the photo's own (unturned) coordinates. */
private fun clampOffset(o: Offset, scale: Float, deg: Float, fw: Float, fh: Float, iw: Float, ih: Float): Offset {
    val r = Math.toRadians(deg.toDouble()); val c = cos(r).toFloat(); val s = sin(r).toFloat()
    val ac = abs(c); val asn = abs(s)
    val lx = (o.x * c + o.y * s) / scale; val ly = (-o.x * s + o.y * c) / scale
    val mx = max(0f, iw / 2 - (fw * ac + fh * asn) / (2 * scale)); val my = max(0f, ih / 2 - (fw * asn + fh * ac) / (2 * scale))
    val qx = lx.coerceIn(-mx, mx) * scale; val qy = ly.coerceIn(-my, my) * scale
    return Offset(qx * c - qy * s, qx * s + qy * c)
}

/** Draws what's inside the frame at the photo's own resolution (long side ≤ 2160) into a JPEG. */
internal fun renderCrop(context: Context, bmp: Bitmap, f: Rect, scale: Float, deg: Float, o: Offset): Uri {
    var k = 1f / scale
    val longSide = max(f.width, f.height) * k
    if (longSide > 2160f) k *= 2160f / longSide
    val w = (f.width * k).roundToInt().coerceAtLeast(1); val h = (f.height * k).roundToInt().coerceAtLeast(1)
    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val m = Matrix().apply {
        postTranslate(-bmp.width / 2f, -bmp.height / 2f); postRotate(deg); postScale(scale * k, scale * k)
        postTranslate(k * (f.width / 2 + o.x), k * (f.height / 2 + o.y))
    }
    android.graphics.Canvas(out).apply { drawColor(android.graphics.Color.BLACK); drawBitmap(bmp, m, android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG or android.graphics.Paint.ANTI_ALIAS_FLAG)) }
    val file = File(context.cacheDir, "story_edit_${UUID.randomUUID()}.jpg")
    file.outputStream().use { out.compress(Bitmap.CompressFormat.JPEG, 92, it) }
    out.recycle()
    return Uri.fromFile(file)
}

/**
 * Status and navigation bar heights. A Dialog's own window often reports none, so this also reads
 * the activity's window, and takes whichever is bigger.
 */
@Composable
private fun rememberHostBars(): Pair<Dp, Dp> {
    val d = LocalDensity.current
    val top = WindowInsets.systemBars.getTop(d); val bottom = WindowInsets.systemBars.getBottom(d)
    val view = androidx.compose.ui.platform.LocalView.current
    val act = remember(view) { generateSequence(view.context) { (it as? android.content.ContextWrapper)?.baseContext }.firstOrNull { it is android.app.Activity } as? android.app.Activity }
    val host = act?.window?.decorView?.let { androidx.core.view.ViewCompat.getRootWindowInsets(it) }
        ?.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars())
    return with(d) { max(top, host?.top ?: 0).toDp() to max(bottom, host?.bottom ?: 0).toDp() }
}

@Composable
private fun DarkBarsForEditor() {
    val view = androidx.compose.ui.platform.LocalView.current
    DisposableEffect(Unit) {
        val w = (view.context as? android.app.Activity)?.window
        val ctl = w?.let { androidx.core.view.WindowCompat.getInsetsController(it, view) }
        val was = ctl?.isAppearanceLightStatusBars
        ctl?.isAppearanceLightStatusBars = false; ctl?.isAppearanceLightNavigationBars = false
        onDispose { if (was != null) { ctl.isAppearanceLightStatusBars = was; ctl.isAppearanceLightNavigationBars = was } }
    }
}


private fun Bitmap.rotate(deg: Float): Bitmap = Bitmap.createBitmap(this, 0, 0, width, height, Matrix().apply { postRotate(deg) }, true)

/** Decodes [uri] no larger than [maxSide] on its long side, turned the right way up (EXIF). */
internal fun decodeUpright(context: Context, uri: Uri, maxSide: Int): Bitmap? = runCatching {
    val cr = context.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
    val bmp = cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return@runCatching null
    val rot = cr.openInputStream(uri)?.use { s ->
        when (ExifInterface(s).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f; ExifInterface.ORIENTATION_ROTATE_180 -> 180f; ExifInterface.ORIENTATION_ROTATE_270 -> 270f; else -> 0f
        }
    } ?: 0f
    if (rot != 0f) bmp.rotate(rot) else bmp
}.getOrNull()
