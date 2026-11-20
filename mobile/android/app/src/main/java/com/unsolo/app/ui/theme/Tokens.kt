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
)

object PcTokens {
    val Light = PcColors(
        paper = Color(0xFFF4F0E6),
        raised = Color(0xFFFBF9F3),
        ink = Color(0xFF16181C),
        ink2 = Color(0xFF5F5B53),
        ink3 = Color(0xFF8C877C),
        rule = Color(0xFFD8D1C1),
        rule2 = Color(0xFFB9B09B),
        gold = Color(0xFFFCBA12),
        goldInk = Color(0xFF7A5800),
        goldBg = Color(0x2EFCBA12),
        blue = Color(0xFF1E4FA0),
        red = Color(0xFFB8321C),
        green = Color(0xFF1F6E46),
        onInk = Color(0xFFF4F0E6),
        onGold = Color(0xFF16181C),
    )
    val Dark = PcColors(
        paper = Color(0xFF14161A),
        raised = Color(0xFF1C1F24),
        ink = Color(0xFFF1ECE0),
        ink2 = Color(0xFFAEA899),
        ink3 = Color(0xFF7E796E),
        rule = Color(0xFF2E323A),
        rule2 = Color(0xFF474C56),
        gold = Color(0xFFFCBA12),
        goldInk = Color(0xFFFCBA12),
        goldBg = Color(0x29FCBA12),
        blue = Color(0xFF7FA6E8),
        red = Color(0xFFF07A62),
        green = Color(0xFF6BC79A),
        onInk = Color(0xFF14161A),
        onGold = Color(0xFF16181C),
    )

    val spaceXs = 4.dp
    val spaceS = 8.dp
    val spaceM = 12.dp
    val spaceL = 16.dp
    val spaceXl = 24.dp
    val spaceXxl = 32.dp
    val radiusS = 4.dp
    val radiusM = 6.dp
    val radiusImage = 12.dp
    val radiusButton = 14.dp
    val radiusCard = 16.dp
    val radiusSheet = 24.dp
    val radiusPill = 999.dp
    val touch = 44.dp
    val seat = 40.dp
    val seatSmall = 32.dp
    val seatTable = 16.dp
    val hairline = 1.dp
    val tabBar = 64.dp
    val topBar = 56.dp
    val buttonTall = 52.dp
    const val motionFast = 150
    const val motionStandard = 220
    const val motionStamp = 340
    const val imageMaxBytes = 2_097_152
}
