package com.unsolo.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
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

/** Downloadable IBM Plex with system fallbacks (Roboto Condensed / Roboto / monospace). */
private fun family(name: String, fallback: String, weights: List<FontWeight>): FontFamily {
    val g = GoogleFont(name)
    return FontFamily(
        weights.flatMap { w ->
            listOf(
                GoogleFontFont(googleFont = g, fontProvider = provider, weight = w),
                Font(DeviceFontFamilyName(fallback), weight = w),
            )
        }
    )
}

object PcFonts {
    val title = family("IBM Plex Sans Condensed", "sans-serif-condensed", listOf(FontWeight.Medium, FontWeight.SemiBold, FontWeight.Bold))
    val body = family("IBM Plex Sans", "sans-serif", listOf(FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold))
    val mono = family("IBM Plex Mono", "monospace", listOf(FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold))
}

/**
 * design/tokens.json "type" scale. Mono is only for prices and date digits (≤15sp); numbers that
 * sit in titles use the condensed face with tabular figures. Labels are sans, never mono.
 */
@Immutable
data class PcTypography(
    val display: TextStyle = TextStyle(fontFamily = PcFonts.title, fontWeight = FontWeight.SemiBold, fontSize = 32.sp, lineHeight = 1.1.em),
    val title1: TextStyle = TextStyle(fontFamily = PcFonts.title, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 1.15.em),
    val title2: TextStyle = TextStyle(fontFamily = PcFonts.title, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 1.2.em),
    val title3: TextStyle = TextStyle(fontFamily = PcFonts.title, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 1.25.em),
    val body: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 1.5.em),
    val bodyStrong: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 1.5.em),
    val small: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 1.45.em),
    val smallStrong: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 1.45.em),
    val label: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 1.3.em),
    /** Facts row (calendar · pin · people). */
    val fact: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 1.35.em, fontFeatureSettings = "tnum"),
    /** Inline numbers in sentences and counters: sans, tabular. */
    val num: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 1.2.em, fontFeatureSettings = "tnum"),
    /** Big numbers (hero price, countdown, date column): condensed, tabular. */
    val numLarge: TextStyle = TextStyle(fontFamily = PcFonts.title, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 1.1.em, fontFeatureSettings = "tnum"),
    /** Prices and date digits in rows: the one place mono is used. */
    val price: TextStyle = TextStyle(fontFamily = PcFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 1.2.em),
    /** Tag pills and overlines: 11sp semibold sans, tracked. */
    val code: TextStyle = TextStyle(fontFamily = PcFonts.body, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, lineHeight = 1.25.em, letterSpacing = 0.06.em),
)

val LocalPcColors = staticCompositionLocalOf { PcTokens.Light }
val LocalPcType = staticCompositionLocalOf { PcTypography() }
val LocalDark = staticCompositionLocalOf { false }

object Pc {
    val colors: PcColors @Composable @ReadOnlyComposable get() = LocalPcColors.current
    val type: PcTypography @Composable @ReadOnlyComposable get() = LocalPcType.current
    val isDark: Boolean @Composable @ReadOnlyComposable get() = LocalDark.current
}

@Composable
fun PassengerChartTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val c = if (dark) PcTokens.Dark else PcTokens.Light
    // Material3 is plumbing only (ripples, text selection, dialogs); visuals come from Pc.*.
    val scheme = if (dark) darkColorScheme(
        primary = c.ink, onPrimary = c.onInk, background = c.paper, onBackground = c.ink, surface = c.paper,
        onSurface = c.ink, surfaceVariant = c.raised, onSurfaceVariant = c.ink2, outline = c.rule, error = c.red,
        secondary = c.blue, tertiary = c.gold, surfaceContainer = c.raised, surfaceContainerHigh = c.raised, surfaceContainerLow = c.paper,
    ) else lightColorScheme(
        primary = c.ink, onPrimary = c.onInk, background = c.paper, onBackground = c.ink, surface = c.paper,
        onSurface = c.ink, surfaceVariant = c.raised, onSurfaceVariant = c.ink2, outline = c.rule, error = c.red,
        secondary = c.blue, tertiary = c.gold, surfaceContainer = c.raised, surfaceContainerHigh = c.raised, surfaceContainerLow = c.paper,
    )
    val type = PcTypography()
    CompositionLocalProvider(LocalPcColors provides c, LocalPcType provides type, LocalDark provides dark) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
