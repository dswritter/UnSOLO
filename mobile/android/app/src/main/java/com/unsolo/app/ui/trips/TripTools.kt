package com.unsolo.app.ui.trips

import android.Manifest
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.unsolo.app.core.live.LiveLocationService
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.apiCall
import com.unsolo.app.data.AppEvent
import com.unsolo.app.data.MoneyFormat
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.map.MapMarker
import com.unsolo.app.ui.map.OsmMap
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.UUID

private val SosRed = Color(0xFFD32F2F)

/** Precise location permission (asks once; SOS still works without it). */
@Composable
private fun rememberLocationAsk(onResult: (Boolean) -> Unit) =
    rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r -> onResult(r.values.any { it }) }

private val LOCATION_PERMS = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)

private fun shortRupees(p: Long?): String {
    val r = (p ?: 0) / 100
    return when { r >= 100_000 -> "₹%.1fL".format(r / 100_000.0); r >= 1000 -> "₹%.0fk".format(r / 1000.0); else -> "₹$r" }
}

// ======================= Countdown card (Bookings) =======================

/**
 * The next trip at the top of Bookings: "Spiti in 12 days", or "Day 2 of 5" while you're on it,
 * with the trip pack, group map and (on trip days) SOS.
 */
@Composable
fun TripCountdownCard(b: Booking, nav: AppNav) {
    val c = Pc.colors
    val days = Fmt.daysUntil(b.travelDate) ?: 0
    val total = b.trip.durationDays.coerceAtLeast(1)
    val dayOf = (-days + 1).coerceIn(1, total.toLong())
    val place = b.trip.place?.name?.substringBefore(',') ?: b.trip.title
    Column(Modifier.padding(horizontal = 14.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(if (b.onTrip) c.ink else c.goldBg).padding(18.dp)) {
        val fg = if (b.onTrip) c.onInk else c.ink
        Text(if (b.onTrip) "ON THE TRIP" else "NEXT TRIP", style = Pc.type.label.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp), color = fg.copy(alpha = 0.7f))
        Row(verticalAlignment = Alignment.Bottom) {
            if (b.onTrip) {
                Text("Day $dayOf", style = Pc.type.display.copy(fontSize = 40.sp), color = fg)
                Text("  of $total · $place", style = Pc.type.bodyStrong, color = fg.copy(alpha = 0.8f), modifier = Modifier.padding(bottom = 8.dp))
            } else {
                Text(when (days) { 0L -> "Today"; 1L -> "Tomorrow"; else -> "$days" }, style = Pc.type.display.copy(fontSize = 40.sp), color = fg)
                if (days > 1) Text("  days to $place", style = Pc.type.bodyStrong, color = fg.copy(alpha = 0.8f), modifier = Modifier.padding(bottom = 8.dp))
                else Text("  · $place", style = Pc.type.bodyStrong, color = fg.copy(alpha = 0.8f), modifier = Modifier.padding(bottom = 8.dp))
            }
        }
        Text("${Fmt.dowDayMonth(b.travelDate)}${b.endDate?.let { " – ${Fmt.dayMonth(it)}" } ?: ""}", style = Pc.type.small, color = fg.copy(alpha = 0.75f))
        Spacer(Modifier.height(14.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (b.onTrip) PcButton("SOS", { nav.to(Routes.sos(b.id)) }, kind = BtnKind.Danger, height = BtnSmall, icon = PcIcons.Shield)
            PcButton("Trip pack", { nav.to(Routes.pack(b.id)) }, kind = if (b.onTrip) BtnKind.Accent else BtnKind.Primary, height = BtnSmall, icon = PcIcons.Backpack)
            b.chatRoomId?.let { room -> PcButton("Group map", { nav.to(Routes.groupMap(room)) }, kind = BtnKind.Outline, height = BtnSmall, icon = PcIcons.Pin) }
        }
    }
}

// ======================= SOS =======================

/**
 * Hold the button for two seconds to send an SOS with your location. Then: call 112, call the host,
 * WhatsApp UnSOLO, text your emergency contact, or say you're safe. The location keeps updating
 * while this screen is open.
 */
@Composable
fun SosScreen(nav: AppNav, bookingId: String?) {
    val g = nav.graph
    val c = Pc.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val tick = rememberTick(strong = true)
    var status by remember { mutableStateOf<SosStatus?>(null) }
    var note by rememberSaveable { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf<SosResponse?>(null) }
    var safe by remember { mutableStateOf(false) }
    var fix by remember { mutableStateOf<com.unsolo.app.core.device.Fix?>(null) }
    val ask = rememberLocationAsk { ok -> if (ok) scope.launch { fix = g.precise.now() } }
    LaunchedEffect(Unit) {
        status = (g.trips.sosStatus() as? ApiResult.Ok)?.value
        if (g.precise.hasPermission()) fix = g.precise.now() else ask.launch(LOCATION_PERMS)
    }
    // Keep the team's map current while the alert is open.
    LaunchedEffect(sent?.id, safe) {
        val id = sent?.id ?: return@LaunchedEffect
        if (safe) return@LaunchedEffect
        while (true) { delay(60_000); g.precise.now(8_000)?.let { f -> fix = f; g.trips.sosUpdate(id, SosUpdate(f.lat, f.lng, f.accuracy)) } }
    }
    fun send() {
        if (sending) return
        sending = true; tick()
        scope.launch {
            val f = fix ?: g.precise.now(6_000)
            when (val r = g.trips.sos(SosRequest(f?.lat, f?.lng, f?.accuracy, note.trim().ifBlank { null }, bookingId))) {
                is ApiResult.Ok -> sent = r.value
                is ApiResult.Err -> g.events.emit(AppEvent.Message(r.message ?: "Couldn't send. Call 112 now."))
                ApiResult.Offline -> g.events.emit(AppEvent.Message("You're offline. Call 112, or text your contact below."))
            }
            sending = false
        }
    }
    fun call(phone: String) = runCatching { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) }
    fun sms(phone: String, text: String) = runCatching { context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$phone")).putExtra("sms_body", text)) }
    val message = sent?.message ?: ("I need help. " + (fix?.let { "I'm here: https://maps.google.com/?q=%.5f,%.5f".format(it.lat, it.lng) } ?: ""))
    val contact = sent?.emergencyContact ?: status?.emergencyContact
    val support = sent?.supportWhatsapp ?: status?.supportWhatsapp

    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("SOS", onBack = { nav.back() }, headerActions = false)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Gutter), horizontalAlignment = Alignment.CenterHorizontally) {
            if (sent == null) {
                Text("Hold for 2 seconds to alert UnSOLO, your host and your emergency contact.", style = Pc.type.body, color = c.ink2, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp, bottom = 20.dp))
                HoldButton(sending, onDone = { send() }, onStart = { tick() })
                Spacer(Modifier.height(18.dp))
                Text(fix?.let { "Location ready · within ${it.accuracy?.toInt() ?: "?"} m" } ?: if (g.precise.hasPermission()) "Finding your location…" else "Location off: we'll send the alert without it",
                    style = Pc.type.small, color = if (fix != null) c.green else c.ink3)
                if (!g.precise.hasPermission()) LinkText("Turn on location", { ask.launch(LOCATION_PERMS) }, style = Pc.type.smallStrong)
                Spacer(Modifier.height(16.dp))
                BoxedInput(note, { note = it.take(500) }, "What's happening? (optional)", Modifier.fillMaxWidth(), singleLine = false, minLines = 2)
                Spacer(Modifier.height(16.dp))
                Who(listOfNotNull(
                    "UnSOLO team" to "In the app and by email",
                    status?.trips?.firstOrNull()?.let { "Your host" to "For ${it.title}" },
                    (contact?.let { (it.name ?: "Emergency contact") to "By text" } ?: ("No emergency contact" to "Add one in Edit profile")),
                ))
                if (contact == null) LinkText("Add an emergency contact", { nav.to(Routes.EDIT_PROFILE) }, Modifier.padding(top = 6.dp), style = Pc.type.smallStrong)
            } else {
                Box(Modifier.padding(top = 12.dp).size(76.dp).clip(CircleShape).background(if (safe) c.green else SosRed), contentAlignment = Alignment.Center) {
                    PcIcon(if (safe) PcIcons.Check else PcIcons.Shield, null, tint = Color.White, size = 36.dp)
                }
                Text(if (safe) "Glad you're safe" else "Alert sent", style = Pc.type.title1, color = c.ink, modifier = Modifier.padding(top = 12.dp))
                Text(if (safe) "We've told the team. Stay with your group." else "The team has your location${sent?.trip?.let { " and knows you're on ${it.title}" } ?: ""}. Call for help too.",
                    style = Pc.type.body, color = c.ink2, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp, bottom = 18.dp))
            }
            // Always available, even offline: the phone does these itself.
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                PcButton("Call 112 (emergency)", { call("112") }, Modifier.fillMaxWidth(), kind = BtnKind.Danger, icon = PcIcons.Phone)
                sent?.host?.phone?.let { p -> PcButton("Call ${sent?.host?.name ?: "your host"}", { call(p) }, Modifier.fillMaxWidth(), kind = BtnKind.Outline, icon = PcIcons.Phone) }
                support?.let { w -> PcButton("WhatsApp UnSOLO", { nav.openUrl("https://wa.me/$w?text=" + Uri.encode(message)) }, Modifier.fillMaxWidth(), kind = BtnKind.Outline, icon = PcIcons.Chat) }
                contact?.phone?.let { p -> PcButton("Text ${contact.name ?: "emergency contact"}", { sms(p, message) }, Modifier.fillMaxWidth(), kind = BtnKind.Outline, icon = PcIcons.Send) }
                PcButton("Women helpline 181", { call("181") }, Modifier.fillMaxWidth(), kind = BtnKind.Line, icon = PcIcons.Phone)
                if (sent != null && !safe) PcButton("I'm safe now", {
                    scope.launch { if (g.trips.sosUpdate(sent!!.id, SosUpdate(status = "safe")) is ApiResult.Ok) { safe = true; tick() } }
                }, Modifier.fillMaxWidth(), kind = BtnKind.Primary, icon = PcIcons.Check)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun Who(rows: List<Pair<String, String>>) {
    val c = Pc.colors
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.tonal).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("WHO GETS IT", style = Pc.type.label.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.sp), color = c.ink3)
        rows.forEach { (a, b) -> Row { Text(a, style = Pc.type.bodyStrong, color = c.ink, modifier = Modifier.weight(1f)); Text(b, style = Pc.type.small, color = c.ink2) } }
    }
}

/** A big red button you hold for two seconds (a ring fills); letting go early cancels. */
@Composable
private fun HoldButton(busy: Boolean, onStart: () -> Unit, onDone: () -> Unit) {
    val progress = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    Box(Modifier.size(200.dp).pointerInput(busy) {
        detectTapGestures(onPress = {
            if (busy) return@detectTapGestures
            onStart()
            val job = scope.launch { progress.animateTo(1f, tween(2000, easing = LinearEasing)); onDone() }
            tryAwaitRelease()
            if (progress.value < 1f) { job.cancel(); scope.launch { progress.animateTo(0f, tween(250)) } }
        })
    }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(SosRed.copy(alpha = 0.15f))
            drawArc(SosRed, -90f, 360f * progress.value, false, Offset(8.dp.toPx(), 8.dp.toPx()), Size(size.width - 16.dp.toPx(), size.height - 16.dp.toPx()), style = Stroke(8.dp.toPx(), cap = StrokeCap.Round))
        }
        Box(Modifier.size(150.dp).clip(CircleShape).background(SosRed), contentAlignment = Alignment.Center) {
            if (busy) androidx.compose.material3.CircularProgressIndicator(Modifier.size(40.dp), color = Color.White, strokeWidth = 3.dp)
            else Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("SOS", style = Pc.type.display.copy(fontSize = 44.sp), color = Color.White)
                Text(if (progress.value > 0f) "Keep holding" else "Hold", style = Pc.type.smallStrong, color = Color.White.copy(alpha = 0.9f))
            }
        }
    }
}

// ======================= Trip pack (offline) =======================

/** Everything for the trip, kept on the phone: works with no signal. */
@Composable
fun TripPackScreen(nav: AppNav, bookingId: String) {
    val g = nav.graph
    val c = Pc.colors
    val context = LocalContext.current
    var pack by remember { mutableStateOf<TripPack?>(null) }
    var state by remember { mutableStateOf("loading") } // loading, fresh, saved, failed
    LaunchedEffect(bookingId) {
        g.trips.savedPack(bookingId)?.let { pack = it; state = "saved" }
        when (val r = g.trips.downloadPack(bookingId)) { is ApiResult.Ok -> { pack = r.value; state = "fresh" }; else -> if (pack == null) state = "failed" }
    }
    fun call(p: String) = runCatching { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$p"))) }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Trip pack", onBack = { nav.back() }, headerActions = false)
        val p = pack
        when {
            p == null && state == "failed" -> EmptyState("Couldn't load the trip pack", "Connect once and it stays on your phone for the trip.")
            p == null -> Column(Modifier.padding(Gutter)) { Text("Getting your trip pack…", style = Pc.type.body, color = c.ink2) }
            else -> LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
                item {
                    Text(if (state == "fresh") "Saved on this phone · works offline" else "Offline copy from ${Fmt.ago(p.generatedAt)}", style = Pc.type.small,
                        color = if (state == "fresh") c.green else c.ink2, modifier = Modifier.padding(horizontal = Gutter, vertical = 4.dp))
                    Column(Modifier.padding(horizontal = Gutter, vertical = 8.dp)) {
                        Text(p.trip.title, style = Pc.type.display.copy(fontSize = 24.sp), color = c.ink)
                        Text("${Fmt.dowDayMonth(p.startDate)} – ${Fmt.dowDayMonth(p.endDate)}" + (p.trip.place?.name?.let { " · $it" } ?: ""), style = Pc.type.body, color = c.ink2)
                        listOfNotNull(p.departureTime?.let { "Leaves in the $it" }, p.returnTime?.let { "back in the $it" }).joinToString(", ").takeIf { it.isNotEmpty() }?.let {
                            Text(it.replaceFirstChar { ch -> ch.uppercase() }, style = Pc.type.small, color = c.ink2)
                        }
                    }
                }
                item { PackSection("Your booking") {
                    PackRow("Code", p.confirmationCode ?: p.status)
                    PackRow("Travellers", "${p.guests}")
                    PackRow("Paid", MoneyFormat.rupees(p.paidPaise))
                    if (p.balancePaise > 0) PackRow("Balance due", MoneyFormat.rupees(p.balancePaise))
                    p.specialRequests?.let { PackRow("Your note", it) }
                } }
                p.host?.let { h -> item { PackSection("Host") {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(h.user, 40.dp); Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) { Text(h.user.name, style = Pc.type.bodyStrong, color = c.ink); h.phone?.let { Text(it, style = Pc.type.small, color = c.ink2) } }
                        h.phone?.let { ph -> PcButton("Call", { call(ph) }, kind = BtnKind.Outline, height = BtnSmall, icon = PcIcons.Phone) }
                    }
                } } }
                if (p.description.isNotBlank()) item { PackSection("The plan") { Text(p.description.replace(Regex("[#*_>`]+"), "").trim(), style = Pc.type.body, color = c.ink) } }
                if (p.includes.isNotEmpty()) item { PackSection("What's included") { p.includes.forEach { Text("• $it", style = Pc.type.body, color = c.ink) } } }
                if (p.travellers.isNotEmpty()) item { PackSection("Going with you") {
                    p.travellers.chunked(2).forEach { row -> Row { row.forEach { u -> Row(Modifier.weight(1f).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(u, 28.dp); Spacer(Modifier.width(8.dp)); Text(u.firstName, style = Pc.type.body, color = c.ink) } }; if (row.size == 1) Spacer(Modifier.weight(1f)) } }
                } }
                item { PackSection("Helplines") {
                    p.helplines.forEach { hl -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { call(hl.phone) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(hl.label, style = Pc.type.body, color = c.ink, modifier = Modifier.weight(1f)); Text(hl.phone, style = Pc.type.num, color = c.ink); Spacer(Modifier.width(8.dp)); PcIcon(PcIcons.Phone, null, size = 16.dp, tint = c.ink2)
                    } }
                    p.support.whatsapp?.let { w -> LinkText("WhatsApp UnSOLO support", { nav.openUrl("https://wa.me/$w") }, Modifier.padding(top = 6.dp), style = Pc.type.smallStrong) }
                } }
                p.cancellationPolicy?.takeIf { it.isNotBlank() }?.let { cp -> item { PackSection("Cancellation") { Text(cp, style = Pc.type.small, color = c.ink2) } } }
                item {
                    Row(Modifier.padding(horizontal = Gutter, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        p.chatRoomId?.let { r -> PcButton("Group chat", { nav.to(Routes.chat(r)) }, Modifier.weight(1f), kind = BtnKind.Outline, icon = PcIcons.ChatsCircle) }
                        PcButton("Trip page", { nav.to(Routes.trip(p.trip.slug)) }, Modifier.weight(1f), kind = BtnKind.Outline)
                    }
                }
            }
        }
    }
}

@Composable
private fun PackSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().raisedCard().padding(16.dp)) {
        Text(title.uppercase(), style = Pc.type.label.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.sp), color = Pc.colors.ink3, modifier = Modifier.padding(bottom = 8.dp))
        content()
    }
}

@Composable
private fun PackRow(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(k, style = Pc.type.body, color = Pc.colors.ink2, modifier = Modifier.width(110.dp)); Text(v, style = Pc.type.bodyStrong, color = Pc.colors.ink)
    }
}

// ======================= Review with photos =======================

/** "How was it?": two star ratings, a few words, up to 6 photos. */
@Composable
fun ReviewScreen(nav: AppNav, bookingId: String) {
    val g = nav.graph
    val c = Pc.colors
    val scope = rememberCoroutineScope()
    val tick = rememberTick()
    val trips by g.explore.observeMyTrips().collectAsStateWithLifecycle(initialValue = null)
    val booking = trips?.let { t -> (t.past + t.upcoming).firstOrNull { it.id == bookingId } }
    var place by rememberSaveable { mutableIntStateOf(0) }
    var exp by rememberSaveable { mutableIntStateOf(0) }
    var title by rememberSaveable { mutableStateOf("") }
    var body by rememberSaveable { mutableStateOf("") }
    val photos = remember { mutableStateListOf<String>() }
    var uploading by remember { mutableIntStateOf(0) }
    var sending by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(6)) { uris ->
        uris.take(6 - photos.size).forEach { u ->
            uploading++
            scope.launch {
                val out = File(g.app.cacheDir, "review_${UUID.randomUUID()}.jpg")
                if (runCatching { g.compressor.compress(u, out) }.isSuccess) {
                    val part = MultipartBody.Part.createFormData("file", out.name, out.asRequestBody("image/jpeg".toMediaType()))
                    when (val r = apiCall { g.api.upload(part, "review".toRequestBody("text/plain".toMediaType())) }) {
                        is ApiResult.Ok -> if (photos.size < 6) photos += r.value.url
                        is ApiResult.Err -> g.events.emit(AppEvent.Message(r.message ?: "Couldn't upload a photo."))
                        ApiResult.Offline -> g.events.emit(AppEvent.Message("You're offline."))
                    }
                }
                out.delete(); uploading--
            }
        }
    }
    LaunchedEffect(Unit) { if (trips == null) g.explore.refreshMyTrips() }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Review", onBack = { nav.back() }, headerActions = false) {
            PcButton("Post", {
                sending = true
                scope.launch {
                    when (val r = g.trips.review(ReviewCreate(bookingId, place, exp, title.trim().ifBlank { null }, body.trim().ifBlank { null }, photos.toList()))) {
                        is ApiResult.Ok -> { tick(); g.events.emit(AppEvent.Message("Thanks. Your review helps the next traveller.")); g.explore.refreshMyTrips(); nav.back() }
                        is ApiResult.Err -> g.events.emit(AppEvent.Message(r.message ?: "Couldn't post it. Try again."))
                        ApiResult.Offline -> g.events.emit(AppEvent.Message("You're offline. Your review is still here."))
                    }
                    sending = false
                }
            }, kind = BtnKind.Accent, height = BtnSmall, enabled = place > 0 && exp > 0 && uploading == 0, loading = sending)
            Spacer(Modifier.width(8.dp))
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).imePadding().padding(Gutter), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            booking?.let { b ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ProgressiveImage(b.trip.image, Modifier.size(52.dp).clip(RoundedCornerShape(12.dp))); Spacer(Modifier.width(12.dp))
                    Column { Text(b.trip.title, style = Pc.type.title3, color = c.ink); Text("Went ${Fmt.dayMonth(b.travelDate)}", style = Pc.type.small, color = c.ink2) }
                }
            }
            Stars("The place", place) { place = it; tick() }
            Stars("The trip and the group", exp) { exp = it; tick() }
            BoxedInput(title, { title = it.take(120) }, "Sum it up (optional)", Modifier.fillMaxWidth())
            BoxedInput(body, { body = it.take(3000) }, "What should the next traveller know?", Modifier.fillMaxWidth(), singleLine = false, minLines = 4)
            Column {
                Text("Photos · ${photos.size}/6", style = Pc.type.smallStrong, color = c.ink)
                Spacer(Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(photos, key = { it }) { url ->
                        Box(Modifier.size(84.dp).clip(RoundedCornerShape(12.dp))) {
                            coil3.compose.AsyncImage(url, null, Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
                            IconTap(PcIcons.Close, "Remove photo", { photos.remove(url) }, Modifier.align(Alignment.TopEnd).size(30.dp), tint = Color.White)
                        }
                    }
                    if (uploading > 0) item { Box(Modifier.size(84.dp).clip(RoundedCornerShape(12.dp)).background(c.tonal), contentAlignment = Alignment.Center) { androidx.compose.material3.CircularProgressIndicator(Modifier.size(22.dp), color = c.ink2, strokeWidth = 2.dp) } }
                    if (photos.size + uploading < 6) item {
                        Box(Modifier.size(84.dp).clip(RoundedCornerShape(12.dp)).border(1.dp, c.rule, RoundedCornerShape(12.dp)).clickable { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                            contentAlignment = Alignment.Center) { PcIcon(PcIcons.Camera, "Add photos", tint = c.ink2) }
                    }
                }
            }
        }
    }
}

@Composable
private fun Stars(label: String, value: Int, onPick: (Int) -> Unit) {
    val c = Pc.colors
    Column {
        Text(label, style = Pc.type.smallStrong, color = c.ink)
        Row(Modifier.padding(top = 4.dp)) {
            (1..5).forEach { i ->
                PcIcon(if (i <= value) PcIcons.StarFilled else PcIcons.Star, "$i stars", tint = if (i <= value) c.gold else c.rule2, size = 34.dp,
                    modifier = Modifier.clip(CircleShape).clickable { onPick(i) }.padding(4.dp))
            }
        }
    }
}

// ======================= Travel buddies =======================

/** People to travel with: same departure, same place and dates, same saved trips. */
@Composable
fun BuddiesScreen(nav: AppNav) {
    val g = nav.graph
    val c = Pc.colors
    var data by remember { mutableStateOf<List<Buddy>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(attempt) {
        error = null
        if (data == null) g.trips.cachedBuddies()?.let { data = it.items }
        when (val r = g.trips.buddies()) {
            is ApiResult.Ok -> data = r.value.items
            ApiResult.Offline -> if (data == null) error = "You're offline. Connect and try again."
            is ApiResult.Err -> if (data == null) error = "Couldn't load matches right now. Try again in a moment."
        }
    }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Travel buddies", onBack = { nav.back() })
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            item {
                // What this is, in one glance.
                Row(Modifier.padding(horizontal = Gutter, vertical = 8.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.goldBg).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(48.dp).clip(CircleShape).background(c.raised), contentAlignment = Alignment.Center) { PcIcon(PcIcons.UsersThree, null, tint = c.ink, size = 26.dp) }
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text("Going your way", style = Pc.type.title3, color = c.ink)
                        Text("People on your departures, planning the same place around your dates, or eyeing the same trips.", style = Pc.type.small, color = c.ink2)
                    }
                }
            }
            val d = data
            when {
                d == null && error != null -> item {
                    EmptyState("No matches loaded", error!!, Modifier.padding(top = 8.dp), action = "Try again") { attempt++ }
                }
                d == null -> items(5) { BuddySkeleton() }
                d.isEmpty() -> item {
                    EmptyState("No matches yet", "Book a trip, save a few, or post a plan. We'll match you with people going the same way at the same time.", action = "Explore trips") { nav.tab(Routes.EXPLORE) }
                }
                else -> items(d, key = { it.user.id }) { b ->
                    Row(Modifier.padding(horizontal = Gutter, vertical = 5.dp).fillMaxWidth().raisedCard().clickable { if (b.user.username.isNotBlank()) nav.to(Routes.profile(b.user.username)) }.padding(14.dp),
                        verticalAlignment = Alignment.Top) {
                        com.unsolo.app.ui.status.StatusAvatar(nav, b.user, 52.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(b.user.name, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                if (b.user.isIdVerified) { Spacer(Modifier.width(4.dp)); VerifiedMark() }
                            }
                            Spacer(Modifier.height(4.dp))
                            b.reasons.forEach { reason ->
                                Row(Modifier.padding(vertical = 1.dp), verticalAlignment = Alignment.Top) {
                                    Box(Modifier.padding(top = 7.dp).size(5.dp).clip(CircleShape).background(c.pine)); Spacer(Modifier.width(8.dp))
                                    Text(reason, style = Pc.type.small, color = c.ink2)
                                }
                            }
                            Spacer(Modifier.height(10.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                PcButton("Say hi", {
                                    if (nav.requireSignIn()) scope.launch { (g.tribe.openDirectChat(b.user.id) as? ApiResult.Ok)?.let { nav.to(Routes.chat(it.value.roomId)) } }
                                }, kind = BtnKind.Accent, height = BtnSmall, icon = PcIcons.Chat)
                                b.trip?.let { t -> PcButton("The trip", { nav.to(Routes.trip(t.slug)) }, kind = BtnKind.Outline, height = BtnSmall) }
                                    ?: b.planId?.let { p -> PcButton("Their plan", { nav.to(Routes.post(p)) }, kind = BtnKind.Outline, height = BtnSmall) }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BuddySkeleton() {
    val c = Pc.colors
    val a by androidx.compose.animation.core.rememberInfiniteTransition(label = "sk").animateFloat(0.4f, 0.9f,
        androidx.compose.animation.core.infiniteRepeatable(tween(800), androidx.compose.animation.core.RepeatMode.Reverse), label = "a")
    Row(Modifier.padding(horizontal = Gutter, vertical = 5.dp).fillMaxWidth().raisedCard().padding(14.dp)) {
        Box(Modifier.size(52.dp).clip(CircleShape).background(c.tonal.copy(alpha = a)))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.fillMaxWidth(0.5f).height(14.dp).clip(CircleShape).background(c.tonal.copy(alpha = a)))
            Box(Modifier.fillMaxWidth(0.85f).height(10.dp).clip(CircleShape).background(c.tonal.copy(alpha = a)))
            Box(Modifier.width(90.dp).height(30.dp).clip(CircleShape).background(c.tonal.copy(alpha = a)))
        }
    }
}

// ======================= Explore map =======================

/** Trips, stays, activities, rentals and open plans on an OpenStreetMap. Tap a pin for its card. */
@Composable
fun ExploreMapScreen(nav: AppNav, startCategory: String) {
    val g = nav.graph
    val c = Pc.colors
    var category by rememberSaveable { mutableStateOf(startCategory) }
    var pins by remember { mutableStateOf<List<MapPin>?>(null) }
    var selected by remember { mutableStateOf<String?>(null) }
    var failed by remember { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }
    LaunchedEffect(category, attempt) {
        selected = null; failed = false; pins = null
        g.trips.cachedPins(category)?.let { pins = it.pins }
        when (val r = g.trips.mapPins(category)) {
            is ApiResult.Ok -> pins = r.value.pins
            else -> if (pins == null) failed = true
        }
    }
    val colorFor = { k: String -> when (k) { "trip" -> c.pine; "stay" -> Color(0xFF3F51B5); "activity" -> Color(0xFF00897B); "rental" -> Color(0xFF6D4C41); else -> c.rose } }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Map", onBack = { nav.back() }, headerActions = false)
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = Gutter, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("all" to "All", "trips" to "Trips", "stays" to "Stays", "activities" to "Activities", "rentals" to "Rentals", "plans" to "Plans").forEach { (k, l) ->
                val on = k == category
                Text(l, style = Pc.type.smallStrong, color = if (on) c.onInk else c.ink, modifier = Modifier.clip(CircleShape).background(if (on) c.ink else c.tonal).clickable { category = k }.padding(horizontal = 14.dp, vertical = 8.dp))
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            val list = pins.orEmpty()
            OsmMap(list.map { p -> MapMarker(p.kind + p.id, p.lat, p.lng, if (p.kind == "plan") Fmt.dayMonth(p.date).ifEmpty { "Plan" } else shortRupees(p.priceFromPaise), if (p.past) c.ink3 else colorFor(p.kind), selected == p.kind + p.id) },
                Modifier.fillMaxSize(), fitKey = category) { selected = it }
            if (pins == null && failed) Row(Modifier.align(Alignment.TopCenter).padding(10.dp).clip(CircleShape).background(c.raised).clickable { attempt++ }.padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Text("Couldn't load the places. ", style = Pc.type.small, color = c.ink2)
                Text("Try again", style = Pc.type.smallStrong, color = c.ink)
            }
            else if (pins == null) Text("Loading places…", style = Pc.type.small, color = c.ink2, modifier = Modifier.align(Alignment.TopCenter).padding(10.dp).clip(CircleShape).background(c.raised).padding(horizontal = 12.dp, vertical = 6.dp))
            else if (list.isEmpty()) Text("Nothing on the map here yet", style = Pc.type.small, color = c.ink2, modifier = Modifier.align(Alignment.TopCenter).padding(10.dp).clip(CircleShape).background(c.raised).padding(horizontal = 12.dp, vertical = 6.dp))
            list.firstOrNull { it.kind + it.id == selected }?.let { p ->
                Row(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(12.dp).fillMaxWidth().raisedCard().clickable {
                    if (p.kind == "plan") p.postId?.let { nav.to(Routes.post(it)) } else p.slug?.let { nav.to(Routes.trip(it)) }
                }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    ProgressiveImage(p.image, Modifier.size(64.dp).clip(RoundedCornerShape(12.dp)), p.title)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(p.title, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(listOfNotNull(p.place, p.date?.let { Fmt.dowDayMonth(it) }).joinToString(" · "), style = Pc.type.small, color = c.ink2, maxLines = 1)
                        Text(when (p.kind) {
                            "plan" -> p.spotsTotal?.takeIf { it > 0 }?.let { com.unsolo.app.core.util.SeatCopy.short(it, p.spotsLeft ?: it) } ?: "Plan"
                            "trip" -> "${MoneyFormat.rupees(p.priceFromPaise ?: 0)}/person" + (if (p.past) " · Ask for dates" else p.seatsLeft?.let { l -> p.seatsTotal?.takeIf { it > 0 }?.let { " · " + com.unsolo.app.core.util.SeatCopy.short(it, l) } } ?: "")
                            else -> "${MoneyFormat.rupees(p.priceFromPaise ?: 0)}/${p.unit ?: "booking"}"
                        }, style = Pc.type.smallStrong, color = c.ink)
                    }
                    PcIcon(PcIcons.ChevronRight, null, tint = c.ink3)
                }
            }
        }
    }
}

// ======================= Group map (live location) =======================

private val SHARE_TIMES = listOf(30 to "30 min", 60 to "1 hour", 120 to "2 hours", 240 to "4 hours")

/**
 * Who in the trip group is sharing their location, on a map, refreshed every 20 seconds. Start or
 * stop sharing yours (it keeps going with the screen off until the time is up).
 */
@Composable
fun GroupMapScreen(nav: AppNav, roomId: String) {
    val g = nav.graph
    val c = Pc.colors
    val context = LocalContext.current
    val active by LiveLocationService.active.collectAsStateWithLifecycle()
    val sharing = active?.roomId == roomId
    var items by remember { mutableStateOf<List<LiveLocationItem>?>(null) }
    var choose by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<Int?>(null) }
    var denied by remember { mutableStateOf(false) }
    val chats by g.chat.observeChats().collectAsStateWithLifecycle(initialValue = emptyList())
    val name = chats.firstOrNull { it.id == roomId }?.name
    val notifAsk = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { _ -> pending?.let { LiveLocationService.start(context, roomId, it, name) }; pending = null }
    val ask = rememberLocationAsk { ok ->
        if (!ok) { denied = true; pending = null; return@rememberLocationAsk }
        val m = pending ?: return@rememberLocationAsk
        if (android.os.Build.VERSION.SDK_INT >= 33) notifAsk.launch(Manifest.permission.POST_NOTIFICATIONS) else { LiveLocationService.start(context, roomId, m, name); pending = null }
    }
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(roomId) {
        lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED) {
            while (true) { (g.trips.liveLocations(roomId) as? ApiResult.Ok)?.let { items = it.value.items }; delay(30_000) }
        }
    }
    if (choose) PcSheet({ choose = false }) {
        SheetTitle("Share your live location", "Everyone in ${name ?: "this group"} can see where you are until the time is up. You can stop any time.")
        Column(Modifier.padding(horizontal = Gutter, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SHARE_TIMES.forEach { (m, l) ->
                PcButton("For $l", { choose = false; pending = m; ask.launch(LOCATION_PERMS) }, Modifier.fillMaxWidth(), kind = if (m == 120) BtnKind.Primary else BtnKind.Outline)
            }
        }
        Spacer(Modifier.height(12.dp))
    }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar(name ?: "Group map", onBack = { nav.back() }, headerActions = false)
        val list = items.orEmpty()
        Box(Modifier.weight(1f).fillMaxWidth()) {
            OsmMap(list.map { MapMarker(it.user.id, it.lat, it.lng, if (it.mine) "You" else it.user.firstName, if (it.mine) c.pine else c.rose) }, Modifier.fillMaxSize(), fitKey = list.size)
            if (items != null && list.isEmpty()) Text("No one is sharing right now", style = Pc.type.small, color = c.ink2,
                modifier = Modifier.align(Alignment.TopCenter).padding(10.dp).clip(CircleShape).background(c.raised).padding(horizontal = 12.dp, vertical = 6.dp))
        }
        Column(Modifier.fillMaxWidth().background(c.raised).navigationBarsPadding().padding(Gutter)) {
            list.forEach { l ->
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(l.user, 30.dp); Spacer(Modifier.width(10.dp))
                    Text(if (l.mine) "You" else l.user.name, style = Pc.type.bodyStrong, color = c.ink, modifier = Modifier.weight(1f), maxLines = 1)
                    Text("updated ${Fmt.ago(l.updatedAt)}", style = Pc.type.small, color = c.ink2)
                }
            }
            if (denied) Text("Location is off for UnSOLO. Turn it on in your phone's settings to share.", style = Pc.type.small, color = c.red, modifier = Modifier.padding(vertical = 6.dp))
            Spacer(Modifier.height(8.dp))
            if (sharing) PcButton("Stop sharing (until ${java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(active!!.until))})",
                { LiveLocationService.stop(context, roomId) }, Modifier.fillMaxWidth(), kind = BtnKind.Danger, icon = PcIcons.Close)
            else PcButton("Share my live location", { choose = true }, Modifier.fillMaxWidth(), kind = BtnKind.Accent, icon = PcIcons.Pin)
        }
    }
}
