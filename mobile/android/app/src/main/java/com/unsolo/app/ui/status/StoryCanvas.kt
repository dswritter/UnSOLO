package com.unsolo.app.ui.status

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateRotation
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.unsolo.app.ui.components.rememberTick
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/** How a photo sits in the 9:16 story: [scale] 0 = not touched yet (shown whole). */
data class StoryFit(val scale: Float = 0f, val angle: Float = 0f, val offset: Offset = Offset.Zero, val frame: Rect = Rect.Zero) {
    val touched get() = scale > 0f
}

private fun bbox(iw: Float, ih: Float, deg: Float): Size {
    val r = Math.toRadians(deg.toDouble()); val c = abs(cos(r)).toFloat(); val s = abs(sin(r)).toFloat()
    return Size(iw * c + ih * s, iw * s + ih * c)
}

/** Scale that shows the whole (turned) photo inside the frame. */
private fun fitScale(f: Rect, iw: Float, ih: Float, deg: Float): Float { val b = bbox(iw, ih, deg); return min(f.width / b.width, f.height / b.height) }

/** Bigger than the frame on an axis: no gap on that axis. Smaller: stays inside the frame. */
private fun clampLoose(o: Offset, s: Float, f: Rect, iw: Float, ih: Float, deg: Float): Offset {
    val b = bbox(iw, ih, deg)
    val mx = abs(b.width * s - f.width) / 2; val my = abs(b.height * s - f.height) / 2
    return Offset(o.x.coerceIn(-mx, mx), o.y.coerceIn(-my, my))
}

/**
 * The story preview you edit in place, Instagram style: two fingers zoom and twist the photo
 * (snaps straight near quarter turns), drag it when it's zoomed in, double-tap to fill / show whole.
 * One-finger swipes on an unzoomed photo are left to the pager (next photo).
 */
@Composable
fun StoryCanvas(source: Uri, fit: StoryFit, onFit: (StoryFit) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val tick = rememberTick()
    var bitmap by remember(source) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(source) { bitmap = withContext(Dispatchers.IO) { decodeUpright(context, source, 2160) } }
    var box by remember { mutableStateOf(IntSize.Zero) }
    var touching by remember { mutableStateOf(false) }
    val bmp = bitmap
    Box(modifier.fillMaxSize().onSizeChanged { box = it }, contentAlignment = Alignment.Center) {
        if (bmp == null) { androidx.compose.material3.CircularProgressIndicator(Modifier.size(32.dp), color = Color.White, strokeWidth = 3.dp); return@Box }
        val iw = bmp.width.toFloat(); val ih = bmp.height.toFloat()
        // 9:16 frame, as big as the screen allows.
        val f = run {
            val w = box.width.toFloat(); val h = box.height.toFloat()
            if (w <= 0f || h <= 0f) Rect.Zero else {
                var fw = w; var fh = fw * 16f / 9f
                if (fh > h) { fh = h; fw = fh * 9f / 16f }
                Rect(Offset((w - fw) / 2, (h - fh) / 2), Size(fw, fh))
            }
        }
        if (f == Rect.Zero) return@Box
        val shownAngle = snapAngle(fit.angle)
        val minS = fitScale(f, iw, ih, shownAngle)
        val s = if (fit.touched) max(fit.scale, minS) else minS
        val cur by rememberUpdatedState(fit.copy(scale = s, frame = f))
        val img = remember(bmp) { bmp.asImageBitmap() }
        Canvas(Modifier.fillMaxSize()
            .pointerInput(bmp) { detectTapGestures(onDoubleTap = { c ->
                val st = cur; val a = snapAngle(st.angle)
                val m = fitScale(st.frame, iw, ih, a); val cover = coverScale(st.frame.width, st.frame.height, iw, ih, a)
                val target = if (st.scale > m * 1.05f) m else cover
                val v = c - st.frame.center; val k = target / st.scale
                onFit(st.copy(scale = target, offset = clampLoose(v + (st.offset - v) * k, target, st.frame, iw, ih, a))); tick()
            }) }
            .pointerInput(bmp) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    var st = cur
                    val startSnap = snapAngle(st.angle)
                    do {
                        val ev = awaitPointerEvent()
                        val multi = ev.changes.count { it.pressed } >= 2
                        val zoomed = st.scale > fitScale(st.frame, iw, ih, snapAngle(st.angle)) * 1.02f
                        if (multi || zoomed) {
                            val zc = ev.calculateZoom(); val rot = if (multi) ev.calculateRotation() else 0f; val pan = ev.calculatePan()
                            if (zc != 1f || rot != 0f || pan != Offset.Zero) {
                                touching = true
                                val c = ev.calculateCentroid(useCurrent = true)
                                val v = if (c.isSpecified) c - st.frame.center else Offset.Zero
                                val rad = Math.toRadians(rot.toDouble())
                                val d = st.offset - v
                                val r = Offset((d.x * cos(rad) - d.y * sin(rad)).toFloat(), (d.x * sin(rad) + d.y * cos(rad)).toFloat())
                                val na = st.angle + rot; val a = snapAngle(na)
                                val m = fitScale(st.frame, iw, ih, a)
                                val ns = (st.scale * zc).coerceIn(m, coverScale(st.frame.width, st.frame.height, iw, ih, a) * 8f)
                                st = st.copy(scale = ns, angle = na, offset = clampLoose(v + r * zc + pan, ns, st.frame, iw, ih, a))
                                onFit(st)
                                ev.changes.forEach { if (it.positionChanged()) it.consume() }
                            }
                        }
                    } while (ev.changes.any { it.pressed })
                    if (touching) {
                        val a = snapAngle(st.angle)
                        if (a != startSnap && a % 90f == 0f) tick()
                        onFit(st.copy(angle = a, scale = max(st.scale, fitScale(st.frame, iw, ih, a)), offset = clampLoose(st.offset, st.scale, st.frame, iw, ih, a)))
                    }
                    touching = false
                }
            }) {
            withTransform({
                translate(f.center.x + fit.offset.x, f.center.y + fit.offset.y)
                rotate(shownAngle, pivot = Offset.Zero)
                scale(s, s, pivot = Offset.Zero)
            }) {
                drawImage(img, srcOffset = IntOffset.Zero, srcSize = IntSize(bmp.width, bmp.height),
                    dstOffset = IntOffset((-iw / 2).roundToInt(), (-ih / 2).roundToInt()), dstSize = IntSize(bmp.width, bmp.height), filterQuality = FilterQuality.Medium)
            }
            // While you move it: the story's edges and a thirds grid.
            if (touching) {
                drawRect(Color.White.copy(alpha = 0.7f), f.topLeft, f.size, style = Stroke(1.dp.toPx()))
                for (k in 1..2) {
                    val x = f.left + f.width * k / 3; val y = f.top + f.height * k / 3
                    drawLine(Color.White.copy(alpha = 0.35f), Offset(x, f.top), Offset(x, f.bottom), 1.dp.toPx())
                    drawLine(Color.White.copy(alpha = 0.35f), Offset(f.left, y), Offset(f.right, y), 1.dp.toPx())
                }
            }
        }
    }
}

/** What you see in the frame, as a 9:16 JPEG (black where the photo doesn't reach). */
suspend fun renderStory(context: Context, source: Uri, fit: StoryFit): Uri? = withContext(Dispatchers.IO) {
    runCatching {
        val bmp = decodeUpright(context, source, 2160) ?: return@runCatching null
        // The canvas decoded at the same size, so its scale maps straight onto these pixels.
        renderCrop(context, bmp, fit.frame, fit.scale, snapAngle(fit.angle), fit.offset).also { bmp.recycle() }
    }.getOrNull()
}
