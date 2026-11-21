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
    val accentInk: Color,
    val taken: Color,
)

object PcTokens {
    val Light = PcColors(
        paper = Color(0xFFFAFAF7),
        raised = Color(0xFFFFFFFF),
        ink = Color(0xFF111111),
        ink2 = Color(0xFF55524C),
        ink3 = Color(0xFF6B6760),
        rule = Color(0xFFE7E4DD),
        rule2 = Color(0xFF8F8B82),
        gold = Color(0xFFFCBA12),
        goldInk = Color(0xFF7A5800),
        goldBg = Color(0xFFFFF4D1),
        blue = Color(0xFF7A5800),
        red = Color(0xFFB8321C),
        green = Color(0xFF1F6E46),
        onInk = Color(0xFFFFFFFF),
        onGold = Color(0xFF111111),
        pine = Color(0xFFFCBA12),
        onPine = Color(0xFF111111),
        pineSoft = Color(0xFFFFF4D1),
        tonal = Color(0xFFF2F0EB),
        seatOpen = Color(0xFF8F8B82),
        rose = Color(0xFFC9466A),
        roseSoft = Color(0xFFFBE8EE),
        roseOpen = Color(0xFFE2A3B5),
        full = Color(0xFFB07A00),
        selected = Color(0xFFFFF4D1),
        scrim = Color(0x99111111),
        accentInk = Color(0xFF7A5800),
        taken = Color(0xFF111111),
    )
    val Dark = PcColors(
        paper = Color(0xFF0F0F0F),
        raised = Color(0xFF1A1A1A),
        ink = Color(0xFFF5F3EE),
        ink2 = Color(0xFFB5B1A8),
        ink3 = Color(0xFF8F8B82),
        rule = Color(0xFF2C2B28),
        rule2 = Color(0xFF6B6860),
        gold = Color(0xFFFCBA12),
        goldInk = Color(0xFFFCBA12),
        goldBg = Color(0xFF2A2410),
        blue = Color(0xFFFCBA12),
        red = Color(0xFFF07A62),
        green = Color(0xFF6BC79A),
        onInk = Color(0xFF111111),
        onGold = Color(0xFF111111),
        pine = Color(0xFFFCBA12),
        onPine = Color(0xFF111111),
        pineSoft = Color(0xFF2A2410),
        tonal = Color(0xFF242320),
        seatOpen = Color(0xFF6B6860),
        rose = Color(0xFFE36C8D),
        roseSoft = Color(0xFF3A1A25),
        roseOpen = Color(0xFF7A4256),
        full = Color(0xFFE0A526),
        selected = Color(0xFF2A2410),
        scrim = Color(0xCC000000),
        accentInk = Color(0xFFFCBA12),
        taken = Color(0xFFF5F3EE),
    )

    val spaceXs = 4.dp
    val spaceS = 8.dp
    val spaceM = 12.dp
    val spaceL = 16.dp
    val spaceXl = 24.dp
    val spaceXxl = 32.dp
    val radiusS = 8.dp
    val radiusM = 12.dp
    val radiusImage = 16.dp
    val radiusButton = 999.dp
    val radiusCard = 20.dp
    val radiusSheet = 24.dp
    val radiusPill = 999.dp
    val touch = 44.dp
    val seat = 34.dp
    val seatSmall = 28.dp
    val seatTable = 16.dp
    val hairline = 1.dp
    val tabBar = 60.dp
    val topBar = 52.dp
    val buttonTall = 46.dp
    val ringHero = 200.dp
    val ringCard = 72.dp
    val ringMini = 38.dp
    val searchDock = 50.dp
    const val motionFast = 150
    const val motionStandard = 220
    const val motionStamp = 340
    const val imageMaxBytes = 2_097_152
}
