package com.unsolo.app.core.image

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import kotlin.math.max
import kotlin.math.roundToInt

/** Pure maths for the upload pipeline (unit-tested in CompressionMathTest). */
object CompressionMath {
    val QUALITIES = listOf(90, 84, 78, 72, 66, 60, 54, 48, 42)
    val SCALES = listOf(1f, 0.85f, 0.7f, 0.55f, 0.4f, 0.3f, 0.25f)

    /** Largest power-of-two subsample that still decodes at least [maxEdge] on the long edge. */
    fun inSampleSize(width: Int, height: Int, maxEdge: Int): Int {
        var sample = 1
        val longEdge = max(width, height)
        while (longEdge / (sample * 2) >= maxEdge) sample *= 2
        return sample
    }

    /** Scales so the long edge is ≤ [maxEdge], keeping aspect ratio. */
    fun targetSize(width: Int, height: Int, maxEdge: Int): Pair<Int, Int> {
        val longEdge = max(width, height)
        if (longEdge <= maxEdge) return width to height
        val f = maxEdge.toFloat() / longEdge
        return max(1, (width * f).roundToInt()) to max(1, (height * f).roundToInt())
    }

    data class Fit<T>(val value: T, val scale: Float, val quality: Int, val bytes: Int)

    /**
     * Lowers quality first, then size, until the encoded output is ≤ [maxBytes].
     * Returns null when even the smallest attempt is too large.
     */
    fun <T> fit(
        maxBytes: Int,
        encode: (scale: Float, quality: Int) -> T,
        sizeOf: (T) -> Int,
        qualities: List<Int> = QUALITIES,
        scales: List<Float> = SCALES,
    ): Fit<T>? {
        for (s in scales) for (q in qualities) {
            val v = encode(s, q)
            val n = sizeOf(v)
            if (n <= maxBytes) return Fit(v, s, q, n)
        }
        return null
    }

    fun rotationFor(exifOrientation: Int): Pair<Float, Boolean> = when (exifOrientation) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f to false
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f to false
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f to false
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> 0f to true
        ExifInterface.ORIENTATION_TRANSPOSE -> 90f to true
        ExifInterface.ORIENTATION_TRANSVERSE -> 270f to true
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> 180f to true
        else -> 0f to false
    }
}

data class CompressedImage(val file: File, val width: Int, val height: Int, val bytes: Long)

/**
 * Photo Picker URI → JPEG ≤ 2 MB with long edge ≤ 2048 px.
 * EXIF: the orientation is applied to the pixels and every other tag (GPS, device, time) is
 * dropped because the bitmap is re-encoded without metadata.
 */
class ImageCompressor(private val context: Context) {
    suspend fun compress(uri: Uri, out: File, maxBytes: Int = 2_097_152, maxEdge: Int = 2048): CompressedImage = withContext(Dispatchers.IO) {
        val cr = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        // A bounds-only decode always returns null (only [bounds] is filled), so check the stream, not the result:
        // treating that null as "can't open" failed every photo and stories went out without them.
        val stream = cr.openInputStream(uri) ?: throw IOException("Can't open image")
        stream.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IOException("Not an image")
        val orientation = runCatching {
            cr.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
        }.getOrNull() ?: ExifInterface.ORIENTATION_NORMAL

        val opts = BitmapFactory.Options().apply {
            inSampleSize = CompressionMath.inSampleSize(bounds.outWidth, bounds.outHeight, maxEdge)
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: throw IOException("Decode failed")
        val (tw, th) = CompressionMath.targetSize(decoded.width, decoded.height, maxEdge)
        val (deg, flip) = CompressionMath.rotationFor(orientation)
        val matrix = Matrix().apply {
            postScale(tw.toFloat() / decoded.width * (if (flip) -1 else 1), th.toFloat() / decoded.height)
            if (deg != 0f) postRotate(deg)
        }
        val base = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        if (base !== decoded) decoded.recycle()

        val fit = CompressionMath.fit(
            maxBytes = maxBytes,
            encode = { scale, quality ->
                val bmp = if (scale == 1f) base else Bitmap.createScaledBitmap(base, max(1, (base.width * scale).roundToInt()), max(1, (base.height * scale).roundToInt()), true)
                val bos = ByteArrayOutputStream()
                bmp.compress(Bitmap.CompressFormat.JPEG, quality, bos)
                if (bmp !== base) bmp.recycle()
                bos.toByteArray()
            },
            sizeOf = { it.size },
        ) ?: throw IOException("Image too large even after compression")
        out.parentFile?.mkdirs()
        out.writeBytes(fit.value)
        val w = (base.width * fit.scale).roundToInt(); val h = (base.height * fit.scale).roundToInt()
        base.recycle()
        CompressedImage(out, w, h, fit.bytes.toLong())
    }
}
