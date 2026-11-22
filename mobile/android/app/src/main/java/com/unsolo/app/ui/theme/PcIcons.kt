package com.unsolo.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Phosphor Bold-style icons drawn inline (24 grid, ~2.1 stroke = Phosphor's 24/256 bold weight).
 * No icon font and no extended Material icons, so the APK stays small.
 */
object PcIcons {
    private const val BOLD = 2.1f

    private fun stroke(name: String, vararg paths: String, width: Float = BOLD): ImageVector =
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

    // ---- navigation ----
    val Compass by lazy { stroke("compass", CIRCLE9, "M15.5,8.5L13.4,13.4L8.5,15.5L10.6,10.6Z") }
    val CompassFilled by lazy { filled("compass_f", "M12,2.5a9.5,9.5 0 1,0 0,19a9.5,9.5 0 1,0 0,-19zM15.9,8.9L13.9,13.6a0.6,0.6 0 0,1 -0.3,0.3L8.9,15.9a0.6,0.6 0 0,1 -0.8,-0.8L10.1,10.4a0.6,0.6 0 0,1 0.3,-0.3L15.1,8.1a0.6,0.6 0 0,1 0.8,0.8z") }
    val Users by lazy { stroke("users", "M12.25,8a3.25,3.25 0 1,1 -6.5,0a3.25,3.25 0 1,1 6.5,0z", "M3,19c0,-3.3 2.7,-5.5 6,-5.5s6,2.2 6,5.5", "M15,4.8a3.2,3.2 0 0,1 0,6.4", "M17,13.6c2.4,0.6 4,2.6 4,5.4") }
    /** users-three: the Tribe tab. */
    val UsersThree by lazy { stroke("users_three", "M14.75,11a2.75,2.75 0 1,1 -5.5,0a2.75,2.75 0 1,1 5.5,0z", "M7.5,18.5c0.8,-1.9 2.5,-3 4.5,-3s3.7,1.1 4.5,3", "M17.5,10.5a2.25,2.25 0 1,0 -1.4,-4", "M19,14.5c1.3,0.3 2.4,1.2 3,2.5", "M6.5,10.5a2.25,2.25 0 1,1 1.4,-4", "M5,14.5c-1.3,0.3 -2.4,1.2 -3,2.5") }
    val Plus by lazy { stroke("plus", "M12,5V19M5,12H19", width = 2.4f) }
    val Trash by lazy { stroke("trash", "M4,7H20", "M9,7V4.5H15V7", "M6.5,7L7.5,20H16.5L17.5,7", "M10,11V16.5", "M14,11V16.5") }
    val PlusCircle by lazy { stroke("plus_circle", CIRCLE9, "M12,8.5V15.5M8.5,12H15.5") }
    val Ticket by lazy { stroke("ticket", "M3,7.5V9.5a2.5,2.5 0 0,1 0,5V16.5a1,1 0 0,0 1,1H20a1,1 0 0,0 1,-1V14.5a2.5,2.5 0 0,1 0,-5V7.5a1,1 0 0,0 -1,-1H4a1,1 0 0,0 -1,1Z", "M15,6.5V8M15,11V13M15,16V17.5") }
    val User by lazy { stroke("user", "M16,8a4,4 0 1,1 -8,0a4,4 0 1,1 8,0z", "M4.5,20.5c0,-4 3.4,-6.5 7.5,-6.5s7.5,2.5 7.5,6.5") }
    val UserCircle by lazy { stroke("user_circle", CIRCLE9, "M15,10.5a3,3 0 1,1 -6,0a3,3 0 1,1 6,0z", "M6.5,18.3c1.2,-1.8 3.2,-2.8 5.5,-2.8s4.3,1 5.5,2.8") }
    val Mail by lazy { stroke("mail", "M3.5,6H20.5V18H3.5Z", "M3.5,6.5L12,13L20.5,6.5") }
    /** chats-circle: Messages. */
    val ChatsCircle by lazy { stroke("chats_circle", "M8.2,15.3a6.5,6.5 0 1,1 2.5,2.5L7.5,18.7L8.2,15.3Z", "M15.8,18.6a6.3,6.3 0 0,0 4.2,1.1l1.5,0.6L21,18.5a6.3,6.3 0 0,0 -0.5,-8") }
    val Bell by lazy { stroke("bell", "M6,17V11a6,6 0 0,1 12,0V17L19.5,18.5H4.5Z", "M10,20.5a2,2 0 0,0 4,0") }
    val BellRinging by lazy { stroke("bell_ringing", "M6,17V11a6,6 0 0,1 12,0V17L19.5,18.5H4.5Z", "M10,20.5a2,2 0 0,0 4,0", "M3,8.5a9,9 0 0,1 2.5,-4.5M21,8.5a9,9 0 0,0 -2.5,-4.5") }
    val Search by lazy { stroke("search", "M17,10.5a6.5,6.5 0 1,1 -13,0a6.5,6.5 0 1,1 13,0z", "M15.3,15.3L20,20") }
    val Back by lazy { stroke("back", "M19.5,12H4.5M10.5,6L4.5,12L10.5,18") }
    val ChevronRight by lazy { stroke("chevron", "M9,5L16,12L9,19") }
    val ChevronDown by lazy { stroke("chevron_down", "M6,9L12,15L18,9") }
    val ChevronUp by lazy { stroke("chevron_up", "M6,15L12,9L18,15") }
    val ArrowRight by lazy { stroke("arrow_right", "M4.5,12H19.5M13.5,6L19.5,12L13.5,18") }
    val Share by lazy { stroke("share", "M16.5,8.5a2.5,2.5 0 1,0 0,-5a2.5,2.5 0 1,0 0,5z", "M7.5,14.5a2.5,2.5 0 1,0 0,-5a2.5,2.5 0 1,0 0,5z", "M16.5,20.5a2.5,2.5 0 1,0 0,-5a2.5,2.5 0 1,0 0,5z", "M9.7,10.8L14.3,7.2M9.7,13.2L14.3,16.8") }
    val Flag by lazy { stroke("flag", "M5,21V4", "M5,4H18L15.5,8.5L18,13H5") }
    val Bookmark by lazy { stroke("bookmark", "M6,3.5H18V21L12,16.5L6,21Z") }
    val BookmarkFilled by lazy { filled("bookmark_f", "M6,3.5H18V21L12,16.5L6,21Z") }
    val Pin by lazy { stroke("pin", "M12,21c0,0 -6.5,-6 -6.5,-11a6.5,6.5 0 0,1 13,0c0,5 -6.5,11 -6.5,11Z", "M14.5,10a2.5,2.5 0 1,1 -5,0a2.5,2.5 0 1,1 5,0z") }
    val PinFilled by lazy { filled("pin_f", "M12,2.5a7.5,7.5 0 0,0 -7.5,7.5c0,5.6 6.9,11.6 7,11.7a0.75,0.75 0 0,0 1,0c0.1,-0.1 7,-6.1 7,-11.7A7.5,7.5 0 0,0 12,2.5zM12,13a3,3 0 1,1 0,-6a3,3 0 0,1 0,6z") }
    val Chat by lazy { stroke("chat", "M4,5H20V16H9L5,19.5V16H4Z") }
    val ChatCircle by lazy { stroke("chat_circle", "M7.2,18.7A8.5,8.5 0 1,0 4.3,15.8L3.2,20.2Z") }
    val Calendar by lazy { stroke("calendar", "M4,5.5H20V20H4Z", "M4,10H20", "M8,3.5V7M16,3.5V7") }
    val CalendarCheck by lazy { stroke("calendar_check", "M4,5.5H20V20H4Z", "M4,10H20", "M8,3.5V7M16,3.5V7", "M9,15L11,17L15,13") }
    val Clock by lazy { stroke("clock", CIRCLE9, "M12,7V12L15.5,14") }
    val Timer by lazy { stroke("timer", "M20,13a8,8 0 1,1 -16,0a8,8 0 1,1 16,0z", "M12,13L15,10", "M9.5,2.5H14.5") }
    val Check by lazy { stroke("check", "M5,12.5L10,17.5L19,7", width = 2.4f) }
    val CheckCircleFilled by lazy { filled("check_circle_f", "M12,2.5a9.5,9.5 0 1,0 0,19a9.5,9.5 0 1,0 0,-19zM16.6,9.6l-5.5,5.5a0.9,0.9 0 0,1 -1.3,0L7.4,12.7a0.9,0.9 0 1,1 1.3,-1.3l1.8,1.8l4.8,-4.8a0.9,0.9 0 1,1 1.3,1.3z") }
    val Heart by lazy { stroke("heart", "M12,20s-8,-4.8 -8,-10.5a4.5,4.5 0 0,1 8,-2.8a4.5,4.5 0 0,1 8,2.8c0,5.7 -8,10.5 -8,10.5Z") }
    val HeartFilled by lazy { filled("heart_f", "M12,20s-8,-4.8 -8,-10.5a4.5,4.5 0 0,1 8,-2.8a4.5,4.5 0 0,1 8,2.8c0,5.7 -8,10.5 -8,10.5Z") }
    val Bulb by lazy { stroke("bulb", "M9,17.5H15", "M10,21H14", "M12,3a6,6 0 0,0 -3.5,10.9c0.6,0.5 0.5,1.3 0.5,2.1V17.5H15V16c0,-0.8 -0.1,-1.6 0.5,-2.1A6,6 0 0,0 12,3Z") }
    /** arrow-fat-up: helpful. */
    val ArrowFatUp by lazy { stroke("arrow_fat_up", "M4,12L12,4L20,12H15.5V20H8.5V12Z") }
    val More by lazy { filled("more", "M7.4,12a1.4,1.4 0 1,1 -2.8,0a1.4,1.4 0 1,1 2.8,0z", "M13.4,12a1.4,1.4 0 1,1 -2.8,0a1.4,1.4 0 1,1 2.8,0z", "M19.4,12a1.4,1.4 0 1,1 -2.8,0a1.4,1.4 0 1,1 2.8,0z") }
    val Shield by lazy { stroke("shield", "M12,3L19.5,6V11.5c0,4.5 -3.2,8 -7.5,9.5c-4.3,-1.5 -7.5,-5 -7.5,-9.5V6Z", "M9,12L11.2,14.2L15.2,10") }
    /** seal-check (filled): verified. */
    val SealCheck by lazy { filled("seal_check", "M21.2,10.2c-0.4,-0.4 -0.7,-0.8 -0.9,-1.3c-0.2,-0.4 -0.2,-1 -0.2,-1.6c0,-1.4 -0.1,-2.3 -0.7,-2.9s-1.5,-0.7 -2.9,-0.7c-0.6,0 -1.2,0 -1.6,-0.2c-0.5,-0.2 -0.9,-0.5 -1.3,-0.9C12.6,1.6 12,1 12,1s-0.6,0.6 -1.6,1.6c-0.4,0.4 -0.8,0.7 -1.3,0.9C8.7,3.7 8.1,3.7 7.5,3.7c-1.4,0 -2.3,0.1 -2.9,0.7S3.9,5.9 3.9,7.3c0,0.6 0,1.2 -0.2,1.6c-0.2,0.5 -0.5,0.9 -0.9,1.3C1.6,11.4 1,12 1,12s0.6,0.6 1.8,1.8c0.4,0.4 0.7,0.8 0.9,1.3c0.2,0.4 0.2,1 0.2,1.6c0,1.4 0.1,2.3 0.7,2.9s1.5,0.7 2.9,0.7c0.6,0 1.2,0 1.6,0.2c0.5,0.2 0.9,0.5 1.3,0.9C11.4,22.4 12,23 12,23s0.6,-0.6 1.6,-1.6c0.4,-0.4 0.8,-0.7 1.3,-0.9c0.4,-0.2 1,-0.2 1.6,-0.2c1.4,0 2.3,-0.1 2.9,-0.7s0.7,-1.5 0.7,-2.9c0,-0.6 0,-1.2 0.2,-1.6c0.2,-0.5 0.5,-0.9 0.9,-1.3C22.4,12.6 23,12 23,12S22.4,11.4 21.2,10.2zM16.3,10.1l-4.9,4.9a0.9,0.9 0 0,1 -1.3,0l-2.4,-2.4a0.9,0.9 0 1,1 1.3,-1.3l1.8,1.8l4.2,-4.2a0.9,0.9 0 1,1 1.3,1.3z") }
    val Image by lazy { stroke("image", "M3.5,5H20.5V19H3.5Z", "M10,9.5a1.5,1.5 0 1,1 -3,0a1.5,1.5 0 1,1 3,0z", "M3.5,16.5L9,12L13,15.5L16,13L20.5,16.5") }
    val Camera by lazy { stroke("camera", "M3.5,8H7.5L9,5.5H15L16.5,8H20.5V19H3.5Z", "M15.5,13a3.5,3.5 0 1,1 -7,0a3.5,3.5 0 1,1 7,0z") }
    val Question by lazy { stroke("question", CIRCLE9, "M9.5,9.5a2.5,2.5 0 1,1 3.5,2.3c-0.6,0.3 -1,0.8 -1,1.5V14", "M12,17.2V17.4") }
    val ChartBar by lazy { stroke("chart_bar", "M4,20H20", "M6,20V13H10V20", "M10,20V6H14V20", "M14,20V10H18V20") }
    val Close by lazy { stroke("close", "M6,6L18,18M18,6L6,18") }
    val Sliders by lazy { stroke("sliders", "M4,7H13M19,7H20M4,17H7M13,17H20", "M18,7a2,2 0 1,1 -4,0a2,2 0 1,1 4,0z", "M12,17a2,2 0 1,1 -4,0a2,2 0 1,1 4,0z") }
    val Minus by lazy { stroke("minus", "M5,12H19", width = 2.4f) }
    val Send by lazy { filled("send", "M20.6,11.1L5.2,3.3a1,1 0 0,0 -1.4,1.2L6.4,12L3.8,19.5a1,1 0 0,0 1.4,1.2L20.6,12.9a1,1 0 0,0 0,-1.8zM7.9,12.9L6.4,12h5.6a0.9,0.9 0 0,0 0,-1.8H6.4l1.5,0.9z") }
    val NearMe by lazy { stroke("near", "M12,2.5V6M12,18V21.5M2.5,12H6M18,12H21.5", "M18,12a6,6 0 1,1 -12,0a6,6 0 1,1 12,0z") }
    val Edit by lazy { stroke("edit", "M4,20H8L19,9L15,5L4,16Z") }
    val NotePencil by lazy { stroke("note_pencil", "M12,4H5V19H20V12", "M10,14V11L18.5,2.5L21.5,5.5L13,14Z") }
    val Logout by lazy { stroke("logout", "M14,4H19V20H14", "M10,8L6,12L10,16M6,12H15") }
    val Phone by lazy { stroke("phone", "M6.5,3.5H10L11.5,8L9.3,9.5a11,11 0 0,0 5.2,5.2L16,12.5L20.5,14V17.5a2,2 0 0,1 -2,2C10.5,19.5 4.5,13.5 4.5,5.5a2,2 0 0,1 2,-2Z") }
    val Star by lazy { stroke("star", "M12,3.5L14.6,9L20.5,9.7L16.1,13.8L17.3,19.6L12,16.7L6.7,19.6L7.9,13.8L3.5,9.7L9.4,9Z") }
    val StarFilled by lazy { filled("star_f", "M12,3.5L14.6,9L20.5,9.7L16.1,13.8L17.3,19.6L12,16.7L6.7,19.6L7.9,13.8L3.5,9.7L9.4,9Z") }
    val Refresh by lazy { stroke("refresh", "M19,8a7.5,7.5 0 1,0 1,6", "M19.5,3.5V8.5H14.5") }
    val Briefcase by lazy { stroke("briefcase", "M3.5,7.5H20.5V19.5H3.5Z", "M9,7.5V5H15V7.5", "M3.5,12.5H20.5") }
    val Trophy by lazy { stroke("trophy", "M7,4H17V9a5,5 0 0,1 -10,0Z", "M7,6H4V8a3,3 0 0,0 3,3M17,6H20V8a3,3 0 0,1 -3,3", "M12,14V18M8.5,20.5H15.5") }
    val Lock by lazy { stroke("lock", "M5.5,10.5H18.5V20.5H5.5Z", "M8.5,10.5V7.5a3.5,3.5 0 0,1 7,0V10.5") }
    val Info by lazy { stroke("info", CIRCLE9, "M12,11V16.5", "M12,7.8V8") }
    val Lightning by lazy { stroke("lightning", "M13.5,2.5L5,13.5H11L10.5,21.5L19,10.5H13Z") }
    val Wallet by lazy { stroke("wallet", "M4,7.5V18a1.5,1.5 0 0,0 1.5,1.5H20V9H5.5A1.5,1.5 0 0,1 4,7.5a1.5,1.5 0 0,1 1.5,-1.5H17.5", "M16.5,14.2V14.4") }
    val Mountains by lazy { stroke("mountains", "M2.5,19.5L9,8L15.5,19.5Z", "M13,15L16,10L21.5,19.5H15.5", "M14.5,5.5a1.5,1.5 0 1,1 3,0a1.5,1.5 0 1,1 -3,0z") }
    val GenderFemale by lazy { stroke("gender_female", "M17,9a5,5 0 1,1 -10,0a5,5 0 1,1 10,0z", "M12,14V21.5M8.5,18H15.5") }
    val PushPin by lazy { stroke("push_pin", "M15,3L21,9L17.5,10.5L13.5,14.5L14,18L6,10L9.5,10.5L13.5,6.5Z", "M8.5,15.5L3.5,20.5") }
    val Backpack by lazy { stroke("backpack", "M6,9.5a4,4 0 0,1 4,-4H14a4,4 0 0,1 4,4V20.5H6Z", "M9.5,5.5V4a1,1 0 0,1 1,-1H13.5a1,1 0 0,1 1,1V5.5", "M9,14H15V20.5H9Z") }
    val Bed by lazy { stroke("bed", "M3,6V19M3,15.5H21V19M21,15.5V11.5a2.5,2.5 0 0,0 -2.5,-2.5H10V15.5", "M8.5,11.5a1.75,1.75 0 1,1 -3.5,0a1.75,1.75 0 1,1 3.5,0z") }
    val Hike by lazy { stroke("hike", "M15,4.5a1.75,1.75 0 1,1 -3.5,0a1.75,1.75 0 1,1 3.5,0z", "M8,21L11,14L14.5,16.5V21", "M7.5,11.5L10,8L14,8.5L16.5,12H19", "M11,14L12.5,8.2", "M19,9.5V21") }
    val Motorcycle by lazy { stroke("motorcycle", "M9,16a3,3 0 1,1 -6,0a3,3 0 1,1 6,0z", "M21,16a3,3 0 1,1 -6,0a3,3 0 1,1 6,0z", "M6,16L9.5,10H15L18,16", "M13.5,6H16L18,16", "M9.5,10L12,13") }
    /** Armchair: the seat cue in ring centres. */
    val Seat by lazy { stroke("seat", "M6,10V7a2,2 0 0,1 2,-2H16a2,2 0 0,1 2,2V10", "M4,11a2,2 0 0,1 2,2V14.5H18V13a2,2 0 0,1 4,0V18H2V13a2,2 0 0,1 2,-2Z", "M5,18V20M19,18V20") }
    val Microphone by lazy { stroke("microphone", "M9,6a3,3 0 0,1 6,0V11a3,3 0 0,1 -6,0Z", "M5.5,11a6.5,6.5 0 0,0 13,0", "M12,17.5V21") }
}
