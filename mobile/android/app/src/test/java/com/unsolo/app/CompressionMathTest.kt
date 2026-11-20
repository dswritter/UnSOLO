package com.unsolo.app

import com.unsolo.app.core.image.CompressionMath
import org.junit.Assert.*
import org.junit.Test

class CompressionMathTest {
    private val max = 2_097_152

    @Test fun inSampleSizeKeepsAtLeastMaxEdge() {
        assertEquals(1, CompressionMath.inSampleSize(2048, 1536, 2048))
        assertEquals(1, CompressionMath.inSampleSize(4000, 3000, 2048)) // 4000/2 = 2000 < 2048
        assertEquals(4, CompressionMath.inSampleSize(8192, 6144, 2048))
        assertEquals(8, CompressionMath.inSampleSize(16384, 100, 2048))
    }

    @Test fun targetSizeCapsLongEdgeAndKeepsAspect() {
        assertEquals(2048 to 1536, CompressionMath.targetSize(4000, 3000, 2048))
        assertEquals(1536 to 2048, CompressionMath.targetSize(3000, 4000, 2048))
        assertEquals(800 to 600, CompressionMath.targetSize(800, 600, 2048))
    }

    /** Fake encoder: bytes grow with quality and with pixel area (like JPEG). */
    private fun fakeSize(base: Int) = { scale: Float, quality: Int -> (base * scale * scale * (quality / 100f)).toInt() }

    @Test fun lowersQualityBeforeScaling() {
        val fit = CompressionMath.fit(max, encode = fakeSize(3_000_000), sizeOf = { it })!!
        assertTrue(fit.bytes <= max)
        assertEquals(1f, fit.scale)
        assertEquals(66, fit.quality) // 3.0M*0.72 = 2.16M > max; 3.0M*0.66 = 1.98M ≤ max
    }

    @Test fun scalesDownWhenQualityIsNotEnough() {
        val fit = CompressionMath.fit(max, encode = fakeSize(12_000_000), sizeOf = { it })!!
        assertTrue(fit.bytes <= max)
        assertTrue(fit.scale < 1f)
    }

    @Test fun smallImagesKeepTopQuality() {
        val fit = CompressionMath.fit(max, encode = fakeSize(500_000), sizeOf = { it })!!
        assertEquals(90, fit.quality)
        assertEquals(1f, fit.scale)
    }

    @Test fun returnsNullWhenImpossible() {
        assertNull(CompressionMath.fit(10, encode = { _, _ -> 1000 }, sizeOf = { it }))
    }

    @Test fun neverExceedsLimitAcrossSizes() {
        for (base in listOf(1_000_000, 2_500_000, 5_000_000, 9_000_000, 20_000_000, 40_000_000)) {
            val fit = CompressionMath.fit(max, encode = fakeSize(base), sizeOf = { it })
            assertNotNull("base=$base", fit)
            assertTrue("base=$base bytes=${fit!!.bytes}", fit.bytes <= max)
        }
    }
}
