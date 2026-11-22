package com.unsolo.app.ui.status

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
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
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private val Aspects = listOf("story" to 9f / 16f, "4:5" to 4f / 5f, "1:1" to 1f, "original" to 0f)
private fun aspectLabel(k: String) = when (k) { "story" -> "Story"; "original" -> "Original"; else -> k }

/**
 * Crop and rotate a photo before it goes in a story. Pinch to zoom, drag to place it under the
 * frame, pick a shape, rotate in quarter turns. "Done" writes a new JPEG and returns its Uri.
 */
@Composable
fun PhotoEditor(source: Uri, onCancel: () -> Unit, onDone: (Uri) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val tick = rememberTick()
    var bitmap by remember(source) { mutableStateOf<Bitmap?>(null) }
    var aspectKey by remember { mutableStateOf("story") }
    var zoom by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var saving by remember { mutableStateOf(false) }
    var box by remember { mutableStateOf(IntSize.Zero) }
    LaunchedEffect(source) { bitmap = withContext(Dispatchers.IO) { decodeUpright(context, source, 2400) } }
    DarkBarsForEditor()
    val bmp = bitmap
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (bmp == null) {
            androidx.compose.material3.CircularProgressIndicator(Modifier.align(Alignment.Center).size(36.dp), color = Color.White, strokeWidth = 3.dp)
        } else {
            val iw = bmp.width.toFloat(); val ih = bmp.height.toFloat()
            val aspect = Aspects.first { it.first == aspectKey }.second.takeIf { it > 0f } ?: (iw / ih)
            // The crop frame: as big as fits with a margin, centred.
            fun frame(): Rect {
                val w = box.width.toFloat(); val h = box.height.toFloat()
                if (w <= 0f || h <= 0f) return Rect.Zero
                val margin = 24f * context.resources.displayMetrics.density
                var fw = w - margin * 2; var fh = fw / aspect
                if (fh > h - margin * 2) { fh = h - margin * 2; fw = fh * aspect }
                return Rect(Offset((w - fw) / 2, (h - fh) / 2), Size(fw, fh))
            }
            val f = frame()
            // The photo always covers the frame: base scale fills it, zoom adds on top.
            val base = if (f.width > 0f) max(f.width / iw, f.height / ih) else 1f
            val scale = base * zoom
            fun clamp(o: Offset, s: Float): Offset {
                val mx = max(0f, (iw * s - f.width) / 2); val my = max(0f, (ih * s - f.height) / 2)
                return Offset(o.x.coerceIn(-mx, mx), o.y.coerceIn(-my, my))
            }
            val img = remember(bmp) { bmp.asImageBitmap() }
            Canvas(Modifier.fillMaxSize().onSizeChanged { box = it }.pointerInput(bmp, aspectKey, box) {
                detectTransformGestures { _, pan, gz, _ ->
                    val nz = (zoom * gz).coerceIn(1f, 6f)
                    zoom = nz
                    offset = clamp(offset + pan, base * nz)
                }
            }) {
                if (f == Rect.Zero) return@Canvas
                val dw = iw * scale; val dh = ih * scale
                val left = f.center.x + offset.x - dw / 2; val top = f.center.y + offset.y - dh / 2
                drawImage(img, dstOffset = IntOffset(left.roundToInt(), top.roundToInt()), dstSize = IntSize(dw.roundToInt(), dh.roundToInt()))
                // Dim outside the frame, outline and thirds grid inside it.
                clipRect(f.left, f.top, f.right, f.bottom, clipOp = ClipOp.Difference) { drawRect(Color.Black.copy(alpha = 0.6f)) }
                drawRect(Color.White, f.topLeft, f.size, style = Stroke(2.dp.toPx()))
                for (k in 1..2) {
                    val x = f.left + f.width * k / 3; val y = f.top + f.height * k / 3
                    drawLine(Color.White.copy(alpha = 0.35f), Offset(x, f.top), Offset(x, f.bottom), 1.dp.toPx())
                    drawLine(Color.White.copy(alpha = 0.35f), Offset(f.left, y), Offset(f.right, y), 1.dp.toPx())
                }
            }
            // Bottom controls: shapes, rotate, done.
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color.Black.copy(alpha = 0.55f)).navigationBarsPadding().padding(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Aspects.forEach { (k, _) ->
                        val on = k == aspectKey
                        Text(aspectLabel(k), style = Pc.type.smallStrong.copy(fontWeight = FontWeight.Bold), color = if (on) Color.Black else Color.White,
                            modifier = Modifier.clip(CircleShape).background(if (on) Color.White else Color.White.copy(alpha = 0.16f))
                                .clickable { aspectKey = k; zoom = 1f; offset = Offset.Zero; tick() }.padding(horizontal = 14.dp, vertical = 8.dp))
                    }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    PcButton("Cancel", onCancel, kind = BtnKind.Ghost, height = BtnSmall)
                    Spacer(Modifier.weight(1f))
                    PcButton("Rotate", {
                        tick()
                        bitmap = bmp.rotate(90f); zoom = 1f; offset = Offset.Zero
                    }, kind = BtnKind.Ghost, height = BtnSmall, icon = PcIcons.Refresh)
                    Spacer(Modifier.weight(1f))
                    PcButton("Done", {
                        if (saving) return@PcButton
                        saving = true
                        scope.launch {
                            // Frame → photo pixels.
                            val cl = ((f.left - (f.center.x + offset.x - iw * scale / 2)) / scale).coerceIn(0f, iw)
                            val ct = ((f.top - (f.center.y + offset.y - ih * scale / 2)) / scale).coerceIn(0f, ih)
                            val cw = min(f.width / scale, iw - cl); val ch = min(f.height / scale, ih - ct)
                            val out = withContext(Dispatchers.IO) {
                                runCatching {
                                    val crop = Bitmap.createBitmap(bmp, cl.toInt(), ct.toInt(), cw.toInt().coerceAtLeast(1), ch.toInt().coerceAtLeast(1))
                                    val file = File(context.cacheDir, "story_edit_${UUID.randomUUID()}.jpg")
                                    file.outputStream().use { crop.compress(Bitmap.CompressFormat.JPEG, 92, it) }
                                    Uri.fromFile(file)
                                }.getOrNull()
                            }
                            saving = false
                            if (out != null) onDone(out) else onCancel()
                        }
                    }, kind = BtnKind.Accent, height = BtnSmall, loading = saving)
                }
            }
        }
    }
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
private fun decodeUpright(context: Context, uri: Uri, maxSide: Int): Bitmap? = runCatching {
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
