package com.unsolo.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/** Phosphor-like 1.5px stroke icons drawn inline (no icon font, no extended Material icons). */
object PcIcons {
    private fun stroke(name: String, vararg paths: String, width: Float = 1.6f): ImageVector =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
            paths.forEach {
                addPath(
                    pathData = addPathNodes(it), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = width,
                    strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
                )
            }
        }.build()

    private fun filled(name: String, vararg paths: String): ImageVector =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
            paths.forEach { addPath(pathData = addPathNodes(it), fill = SolidColor(Color.Black)) }
        }.build()

    private const val CIRCLE9 = "M21,12a9,9 0 1,1 -18,0a9,9 0 1,1 18,0z"

    val Compass by lazy { stroke("compass", CIRCLE9, "M15.5,8.5L13.4,13.4L8.5,15.5L10.6,10.6Z") }
    val Users by lazy { stroke("users", "M12.25,8a3.25,3.25 0 1,1 -6.5,0a3.25,3.25 0 1,1 6.5,0z", "M3,19c0,-3.3 2.7,-5.5 6,-5.5s6,2.2 6,5.5", "M15,4.8a3.2,3.2 0 0,1 0,6.4", "M17,13.6c2.4,0.6 4,2.6 4,5.4") }
    val Plus by lazy { stroke("plus", "M12,5V19M5,12H19", width = 2f) }
    val Ticket by lazy { stroke("ticket", "M3,7.5V9.5a2.5,2.5 0 0,1 0,5V16.5a1,1 0 0,0 1,1H20a1,1 0 0,0 1,-1V14.5a2.5,2.5 0 0,1 0,-5V7.5a1,1 0 0,0 -1,-1H4a1,1 0 0,0 -1,1Z", "M15,6.5V8M15,11V13M15,16V17.5") }
    val Mail by lazy { stroke("mail", "M3.5,6H20.5V18H3.5Z", "M3.5,6.5L12,13L20.5,6.5") }
    val Bell by lazy { stroke("bell", "M6,17V11a6,6 0 0,1 12,0V17L19.5,18.5H4.5Z", "M10,20.5a2,2 0 0,0 4,0") }
    val Search by lazy { stroke("search", "M17,10.5a6.5,6.5 0 1,1 -13,0a6.5,6.5 0 1,1 13,0z", "M15.3,15.3L20,20") }
    val Back by lazy { stroke("back", "M15,5L8,12L15,19", width = 1.8f) }
    val ChevronRight by lazy { stroke("chevron", "M9,5L16,12L9,19", width = 1.8f) }
    val ChevronDown by lazy { stroke("chevron_down", "M6,9L12,15L18,9", width = 1.8f) }
    val Share by lazy { stroke("share", "M12,3V15M7.5,7.5L12,3L16.5,7.5", "M5,11V20H19V11") }
    val Flag by lazy { stroke("flag", "M5,21V4", "M5,4H18L15.5,8.5L18,13H5") }
    val Bookmark by lazy { stroke("bookmark", "M6,3.5H18V21L12,16.5L6,21Z") }
    val BookmarkFilled by lazy { filled("bookmark_f", "M6,3.5H18V21L12,16.5L6,21Z") }
    val Pin by lazy { stroke("pin", "M12,21c0,0 -6.5,-6 -6.5,-11a6.5,6.5 0 0,1 13,0c0,5 -6.5,11 -6.5,11Z", "M14.5,10a2.5,2.5 0 1,1 -5,0a2.5,2.5 0 1,1 5,0z") }
    val Chat by lazy { stroke("chat", "M4,5H20V16H9L5,19.5V16H4Z") }
    val Calendar by lazy { stroke("calendar", "M4,5.5H20V20H4Z", "M4,10H20", "M8,3.5V7M16,3.5V7") }
    val Clock by lazy { stroke("clock", CIRCLE9, "M12,7V12L15.5,14") }
    val Check by lazy { stroke("check", "M5,12.5L10,17.5L19,7", width = 2f) }
    val Heart by lazy { stroke("heart", "M12,20s-8,-4.8 -8,-10.5a4.5,4.5 0 0,1 8,-2.8a4.5,4.5 0 0,1 8,2.8c0,5.7 -8,10.5 -8,10.5Z") }
    val HeartFilled by lazy { filled("heart_f", "M12,20s-8,-4.8 -8,-10.5a4.5,4.5 0 0,1 8,-2.8a4.5,4.5 0 0,1 8,2.8c0,5.7 -8,10.5 -8,10.5Z") }
    val Bulb by lazy { stroke("bulb", "M9,17.5H15", "M10,21H14", "M12,3a6,6 0 0,0 -3.5,10.9c0.6,0.5 0.5,1.3 0.5,2.1V17.5H15V16c0,-0.8 -0.1,-1.6 0.5,-2.1A6,6 0 0,0 12,3Z") }
    val More by lazy { filled("more", "M7.25,12a1.25,1.25 0 1,1 -2.5,0a1.25,1.25 0 1,1 2.5,0z", "M13.25,12a1.25,1.25 0 1,1 -2.5,0a1.25,1.25 0 1,1 2.5,0z", "M19.25,12a1.25,1.25 0 1,1 -2.5,0a1.25,1.25 0 1,1 2.5,0z") }
    val Shield by lazy { stroke("shield", "M12,3L19.5,6V11.5c0,4.5 -3.2,8 -7.5,9.5c-4.3,-1.5 -7.5,-5 -7.5,-9.5V6Z", "M9,12L11.2,14.2L15.2,10") }
    val Image by lazy { stroke("image", "M3.5,5H20.5V19H3.5Z", "M10,9.5a1.5,1.5 0 1,1 -3,0a1.5,1.5 0 1,1 3,0z", "M3.5,16.5L9,12L13,15.5L16,13L20.5,16.5") }
    val Question by lazy { stroke("question", CIRCLE9, "M9.5,9.5a2.5,2.5 0 1,1 3.5,2.3c-0.6,0.3 -1,0.8 -1,1.5V14", "M12,17.2V17.4", width = 1.6f) }
    val Close by lazy { stroke("close", "M6,6L18,18M18,6L6,18", width = 1.8f) }
    val Sliders by lazy { stroke("sliders", "M4,7H13M19,7H20M4,17H7M13,17H20", "M18,7a2,2 0 1,1 -4,0a2,2 0 1,1 4,0z", "M12,17a2,2 0 1,1 -4,0a2,2 0 1,1 4,0z") }
    val Minus by lazy { stroke("minus", "M5,12H19", width = 2f) }
    val User by lazy { stroke("user", "M16,8a4,4 0 1,1 -8,0a4,4 0 1,1 8,0z", "M4.5,20.5c0,-4 3.4,-6.5 7.5,-6.5s7.5,2.5 7.5,6.5") }
    val Send by lazy { stroke("send", "M4,12L20,4L13,20L11,13Z", "M11,13L20,4") }
    val NearMe by lazy { stroke("near", "M12,2.5V6M12,18V21.5M2.5,12H6M18,12H21.5", "M18,12a6,6 0 1,1 -12,0a6,6 0 1,1 12,0z") }
    val Edit by lazy { stroke("edit", "M4,20H8L19,9L15,5L4,16Z") }
    val Logout by lazy { stroke("logout", "M14,4H19V20H14", "M10,8L6,12L10,16M6,12H15") }
    val Phone by lazy { stroke("phone", "M6.5,3.5H10L11.5,8L9.3,9.5a11,11 0 0,0 5.2,5.2L16,12.5L20.5,14V17.5a2,2 0 0,1 -2,2C10.5,19.5 4.5,13.5 4.5,5.5a2,2 0 0,1 2,-2Z") }
    val Star by lazy { stroke("star", "M12,3.5L14.6,9L20.5,9.7L16.1,13.8L17.3,19.6L12,16.7L6.7,19.6L7.9,13.8L3.5,9.7L9.4,9Z") }
    val Refresh by lazy { stroke("refresh", "M19,8a7.5,7.5 0 1,0 1,6", "M19.5,3.5V8.5H14.5") }
    val Briefcase by lazy { stroke("briefcase", "M3.5,7.5H20.5V19.5H3.5Z", "M9,7.5V5H15V7.5", "M3.5,12.5H20.5") }
    val Trophy by lazy { stroke("trophy", "M7,4H17V9a5,5 0 0,1 -10,0Z", "M7,6H4V8a3,3 0 0,0 3,3M17,6H20V8a3,3 0 0,1 -3,3", "M12,14V18M8.5,20.5H15.5") }
    val Lock by lazy { stroke("lock", "M5.5,10.5H18.5V20.5H5.5Z", "M8.5,10.5V7.5a3.5,3.5 0 0,1 7,0V10.5") }
}
