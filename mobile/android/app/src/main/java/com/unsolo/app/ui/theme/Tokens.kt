// Generated from design/tokens.json by scripts/gen-design-tokens.mjs. Do not edit.
package com.unsolo.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Immutable
data class PcColors(
    val paper: Color,
    val raised: Color,
    val ink: Color,
    val ink2: Color,
    val ink3: Color,
    val rule: Color,
    val rule2: Color,
    val gold: Color,
    val goldInk: Color,
    val goldBg: Color,
    val blue: Color,
    val red: Color,
    val green: Color,
    val onInk: Color,
    val onGold: Color,
    val pine: Color,
    val onPine: Color,
    val pineSoft: Color,
    val tonal: Color,
    val seatOpen: Color,
    val rose: Color,
    val roseSoft: Color,
    val roseOpen: Color,
    val full: Color,
    val selected: Color,
    val scrim: Color,
)

object PcTokens {
    val Light = PcColors(
        paper = Color(0xFFF4FAF7),
        raised = Color(0xFFFFFFFF),
        ink = Color(0xFF0B1A15),
        ink2 = Color(0xFF4A5E56),
        ink3 = Color(0xFF62766E),
        rule = Color(0xFFD5E5DD),
        rule2 = Color(0xFF7E9A8D),
        gold = Color(0xFFFCBA12),
        goldInk = Color(0xFF7A5800),
        goldBg = Color(0xFFFFF1C7),
        blue = Color(0xFF0E5A47),
        red = Color(0xFFB8321C),
        green = Color(0xFF1F6E46),
        onInk = Color(0xFFF4FAF7),
        onGold = Color(0xFF0B1A15),
        pine = Color(0xFF0E5A47),
        onPine = Color(0xFFFFFFFF),
        pineSoft = Color(0xFFE3F0EA),
        tonal = Color(0xFFE7F0EB),
        seatOpen = Color(0xFF5E8C7A),
        rose = Color(0xFFC9466A),
        roseSoft = Color(0xFFFBE8EE),
        roseOpen = Color(0xFFE2A3B5),
        full = Color(0xFFB07A00),
        selected = Color(0xFFFFF1C7),
        scrim = Color(0x990B1A15),
    )
    val Dark = PcColors(
        paper = Color(0xFF0B1A15),
        raised = Color(0xFF13261F),
        ink = Color(0xFFE8F2EC),
        ink2 = Color(0xFFA5BDB2),
        ink3 = Color(0xFF8AA398),
        rule = Color(0xFF23392F),
        rule2 = Color(0xFF587B6A),
        gold = Color(0xFFFCBA12),
        goldInk = Color(0xFFFCBA12),
        goldBg = Color(0xFF3A3112),
        blue = Color(0xFF6FD1AE),
        red = Color(0xFFF07A62),
        green = Color(0xFF6BC79A),
        onInk = Color(0xFF0B1A15),
        onGold = Color(0xFF0B1A15),
        pine = Color(0xFF3FB58E),
        onPine = Color(0xFF0B1A15),
        pineSoft = Color(0xFF17362B),
        tonal = Color(0xFF1C3329),
        seatOpen = Color(0xFF4E7A69),
        rose = Color(0xFFE36C8D),
        roseSoft = Color(0xFF3A1A25),
        roseOpen = Color(0xFF7A4256),
        full = Color(0xFFE0A526),
        selected = Color(0xFF3A3112),
        scrim = Color(0xCC000000),
    )

    val spaceXs = 4.dp
    val spaceS = 8.dp
    val spaceM = 12.dp
    val spaceL = 16.dp
    val spaceXl = 24.dp
    val spaceXxl = 32.dp
    val radiusS = 8.dp
    val radiusM = 12.dp
    val radiusImage = 20.dp
    val radiusButton = 999.dp
    val radiusCard = 28.dp
    val radiusSheet = 28.dp
    val radiusPill = 999.dp
    val touch = 48.dp
    val seat = 40.dp
    val seatSmall = 32.dp
    val seatTable = 16.dp
    val hairline = 1.dp
    val tabBar = 68.dp
    val topBar = 56.dp
    val buttonTall = 52.dp
    val ringHero = 240.dp
    val ringCard = 88.dp
    val ringMini = 44.dp
    val searchDock = 56.dp
    const val motionFast = 150
    const val motionStandard = 220
    const val motionStamp = 340
    const val imageMaxBytes = 2_097_152
}
