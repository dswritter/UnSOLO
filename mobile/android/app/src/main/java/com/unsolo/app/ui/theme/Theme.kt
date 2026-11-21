package com.unsolo.app.ui.theme

import android.provider.Settings
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.DeviceFontFamilyName
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.text.googlefonts.Font as GoogleFontFont
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.unsolo.app.R

private val provider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs,
)

/**
 * Google downloadable fonts (no font files in the APK), each weight followed by the system
 * sans-serif at the same weight, so text renders immediately and swaps once the font arrives.
 * The ₹ sign is not in either face and falls back to the system font automatically.
 */
private fun family(name: String, weights: List<FontWeight>): FontFamily {
    val g = GoogleFont(name)
    return FontFamily(
        weights.flatMap { w ->
            listOf(
                GoogleFontFont(googleFont = g, fontProvider = provider, weight = w),
                Font(DeviceFontFamilyName("sans-serif"), weight = w),
            )
        }
    )
}

object PcFonts {
    /** Bricolage Grotesque: headings, titles, prices, big numbers. */
    val display = family("Bricolage Grotesque", listOf(FontWeight.SemiBold, FontWeight.Bold, FontWeight.ExtraBold))
    /** Figtree: body, labels, buttons. */
    /** Wordmark keeps the original UnSOLO type: Inter Black. */
    val wordmark = family("Inter", listOf(FontWeight.Black))
    val body = family("Figtree", listOf(FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold, FontWeight.Bold, FontWeight.ExtraBold))

    @Deprecated("Full Circle has no condensed face", ReplaceWith("display")) val title get() = display
    @Deprecated("Full Circle has no mono face; numbers use tabular figures", ReplaceWith("body")) val mono get() = body
}

private const val TNUM = "tnum"

/**
 * Full Circle type scale (design/tokens.json + docs/revamp/design-system.md).
 * Bricolage 800 for display/titles/prices, Figtree 400/600/700 for everything else.
 * Every numeric style uses tabular figures.
 */
@Immutable
data class PcTypography(
    val display: TextStyle = TextStyle(fontFamily = PcFonts.display, fontWeight = FontWeight.ExtraBold, fontSize = 28.sp, lineHeight = 1.08.em, letterSpacing = (-0.02).em),
    val title1: TextStyle = TextStyle(fontFamily = PcFonts.display, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, lineHeight = 1.12.em, letterSpacing = (-0.015).em),
    val title2: TextStyle = TextStyle(fontFamily = PcFonts.display, fontWeight = FontWeight.Bold, fontSize = 18.sp, lineHeight = 1.18.em, letterSpacing = (-0.01).em),
    val title3: TextStyle = TextStyle(fontFamily = PcFonts.display, fontWeight = FontWeight.Bold, fontSize = 15.sp, lineHeight = 1.22.em, letterSpacing = (-0.01).em),
    val body: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 1.45.em),
    val bodyStrong: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 1.45.em),
    val small: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 1.4.em),
    val smallStrong: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, lineHeight = 1.4.em),
    val label: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, lineHeight = 1.3.em),
    /** Buttons: Figtree 700. */
    val button: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.Bold, fontSize = 14.sp, lineHeight = 1.2.em),
    /** Facts row (calendar · clock · wallet). */
    val fact: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, lineHeight = 1.35.em, fontFeatureSettings = TNUM),
    /** Inline numbers in sentences and counters. */
    val num: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.Bold, fontSize = 15.sp, lineHeight = 1.2.em, fontFeatureSettings = TNUM),
    /** Big numbers (ring centre, countdowns, date chips). */
    val numLarge: TextStyle = TextStyle(fontFamily = PcFonts.display, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, lineHeight = 1.0.em, letterSpacing = (-0.02).em, fontFeatureSettings = TNUM),
    /** Prices in rows: Bricolage 800. */
    val price: TextStyle = TextStyle(fontFamily = PcFonts.display, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, lineHeight = 1.15.em, letterSpacing = (-0.01).em, fontFeatureSettings = TNUM),
    /** Hero prices (cards, bottom bar). */
    val priceLarge: TextStyle = TextStyle(fontFamily = PcFonts.display, fontWeight = FontWeight.ExtraBold, fontSize = 19.sp, lineHeight = 1.1.em, letterSpacing = (-0.01).em, fontFeatureSettings = TNUM),
    /** Badges (HOST / ORGANISER) and overlines: 11sp 800, tracked. */
    val code: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.ExtraBold, fontSize = 10.sp, lineHeight = 1.25.em, letterSpacing = 0.05.em),
    /** Wordmark. */
    val wordmark: TextStyle = TextStyle(fontFamily = PcFonts.wordmark, fontWeight = FontWeight.Black, fontSize = 19.sp, lineHeight = 1.0.em, letterSpacing = (-0.025).em),
)

val LocalPcColors = staticCompositionLocalOf { PcTokens.Light }
val LocalPcType = staticCompositionLocalOf { PcTypography() }
val LocalDark = staticCompositionLocalOf { false }
/** True when the system "Remove animations" setting is on (animator duration scale 0). */
val LocalReduceMotion = staticCompositionLocalOf { false }

object Pc {
    val colors: PcColors @Composable @ReadOnlyComposable get() = LocalPcColors.current
    val type: PcTypography @Composable @ReadOnlyComposable get() = LocalPcType.current
    val isDark: Boolean @Composable @ReadOnlyComposable get() = LocalDark.current
    val reduceMotion: Boolean @Composable @ReadOnlyComposable get() = LocalReduceMotion.current
}

@Composable
fun FullCircleTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val c = if (dark) PcTokens.Dark else PcTokens.Light
    val ctx = LocalContext.current
    val reduceMotion = remember(ctx) {
        runCatching { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false)
    }
    // Material3 is plumbing only (ripples, text selection, dialogs, date pickers); visuals come from Pc.*.
    val scheme = if (dark) darkColorScheme(
        primary = c.ink, onPrimary = c.raised, primaryContainer = c.tonal, onPrimaryContainer = c.ink,
        background = c.paper, onBackground = c.ink, surface = c.raised, onSurface = c.ink,
        surfaceVariant = c.tonal, onSurfaceVariant = c.ink2, outline = c.rule, outlineVariant = c.rule, error = c.red,
        secondary = c.ink, tertiary = c.gold, surfaceContainer = c.raised, surfaceContainerHigh = c.raised,
        surfaceContainerHighest = c.raised, surfaceContainerLow = c.paper, surfaceContainerLowest = c.paper,
    ) else lightColorScheme(
        primary = c.ink, onPrimary = c.raised, primaryContainer = c.tonal, onPrimaryContainer = c.ink,
        background = c.paper, onBackground = c.ink, surface = c.raised, onSurface = c.ink,
        surfaceVariant = c.tonal, onSurfaceVariant = c.ink2, outline = c.rule, outlineVariant = c.rule, error = c.red,
        secondary = c.ink, tertiary = c.gold, surfaceContainer = c.raised, surfaceContainerHigh = c.raised,
        surfaceContainerHighest = c.raised, surfaceContainerLow = c.paper, surfaceContainerLowest = c.paper,
    )
    val type = remember { PcTypography() }
    CompositionLocalProvider(LocalPcColors provides c, LocalPcType provides type, LocalDark provides dark, LocalReduceMotion provides reduceMotion) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}

@Deprecated("Renamed for the Full Circle design", ReplaceWith("FullCircleTheme(dark, content)"))
@Composable
fun PassengerChartTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) = FullCircleTheme(dark, content)
