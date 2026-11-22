package com.unsolo.app.ui.host

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.apiCall
import com.unsolo.app.data.AppEvent
import com.unsolo.app.data.MoneyFormat
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.status.PhotoEditor
import com.unsolo.app.ui.status.TripAspects
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID

private val Steps = listOf("Basics", "Price and dates", "Photos", "Who can join", "Review")
private val IST = ZoneId.of("Asia/Kolkata")

private fun rupeesToPaise(s: String): Long? = s.filter(Char::isDigit).toLongOrNull()?.times(100)
private fun paiseToRupees(p: Long?): String = if (p == null || p <= 0) "" else (p / 100).toString()

/** What's missing on a step (empty = fine). Mirrors the server's rules so mistakes show before sending. */
private fun problems(step: Int, f: TripForm, images: Int, maxGroup: Int): List<String> = buildList {
    when (step) {
        0 -> {
            if (f.title.isBlank()) add("Add a title")
            if (f.destinationId.isBlank()) add("Pick where the trip goes")
            if (f.description.isBlank()) add("Describe the trip")
        }
        1 -> {
            val tiers = f.priceVariants
            if (tiers.isEmpty()) {
                if (f.pricePaise < 100) add("Set a price per person")
                if (f.compareAtPaise != null && f.compareAtPaise <= f.pricePaise) add("The 'was' price must be higher than the price")
            } else {
                if (tiers.size < 2) add("Add at least two price options, or remove the extra one")
                tiers.forEachIndexed { i, t ->
                    if (t.description.isBlank()) add("Name price option ${i + 1} (e.g. Triple sharing)")
                    if (t.pricePaise < 100) add("Set a price for option ${i + 1}")
                    if (t.compareAtPaise != null && t.compareAtPaise <= t.pricePaise) add("Option ${i + 1}: the 'was' price must be higher")
                }
            }
            if (f.tripDays !in 1..60) add("Days must be 1 to 60")
            if (f.tripNights !in 0..60) add("Nights must be 0 to 60")
            if (f.maxGroupSize !in 2..maxGroup) add("Group size must be 2 to $maxGroup")
            if (f.departures.isEmpty()) add("Add at least one date")
            if (f.departures.any { it.returnDate < it.date }) add("A return date is before its departure")
        }
        2 -> if (images == 0) add("Add at least one photo")
        3 -> {
            val p = f.joinPreferences
            val minPrice = (f.priceVariants.map { it.pricePaise }.minOrNull() ?: f.pricePaise)
            if (p.tokenDepositEnabled && ((p.tokenAmountPaise ?: 0) < 100 || (p.tokenAmountPaise ?: 0) > minPrice)) add("The token must be at least ₹1 and no more than the price")
            if (p.minAge != null && p.maxAge != null && p.minAge > p.maxAge) add("Minimum age is above the maximum")
        }
    }
}

/**
 * Create or edit a trip, in five steps (as on the web): basics, price and dates, photos (16:9 crop),
 * who can join, review. Saved on the phone as you go, so nothing is lost if you leave.
 */
@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun TripEditorScreen(nav: AppNav, tripId: String?) {
    val g = nav.graph
    val c = Pc.colors
    val scope = rememberCoroutineScope()
    val tick = rememberTick()
    val draftKey = tripId ?: "new"
    var form by remember { mutableStateOf<TripForm?>(null) }
    var original by remember { mutableStateOf<TripForm?>(null) }
    var options by remember { mutableStateOf(HostFormOptions()) }
    var step by remember { mutableIntStateOf(0) }
    var saving by remember { mutableStateOf(false) }
    var serverError by remember { mutableStateOf<String?>(null) }
    var showErrors by remember { mutableStateOf(false) }
    var leave by remember { mutableStateOf(false) }
    var restored by remember { mutableStateOf(false) }

    LaunchedEffect(tripId) {
        (g.host.formOptions() as? ApiResult.Ok)?.let { options = it.value }
        val draft = g.host.draft(draftKey)
        val server = tripId?.let { (g.host.tripForm(it) as? ApiResult.Ok)?.value }
        original = server
        form = draft ?: server ?: TripForm()
        restored = draft != null
    }
    // Keep a copy on the phone as you type.
    LaunchedEffect(form) { val f = form ?: return@LaunchedEffect; delay(800); if (f != original) g.host.saveDraft(draftKey, f) }
    BackHandler(enabled = step > 0) { step-- }

    val f = form
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar(if (tripId == null) "New trip" else "Edit trip", onBack = { if (step > 0) step-- else nav.back() }, headerActions = false)
        if (f == null) { Text("Loading…", style = Pc.type.body, color = c.ink2, modifier = Modifier.padding(Gutter)); return }
        // Step bar
        Row(Modifier.padding(horizontal = Gutter, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Steps.indices.forEach { i -> Box(Modifier.weight(1f).height(4.dp).clip(CircleShape).background(if (i <= step) c.ink else c.rule)) }
        }
        Text("${step + 1} of ${Steps.size} · ${Steps[step]}", style = Pc.type.smallStrong, color = c.ink2, modifier = Modifier.padding(horizontal = Gutter))
        if (restored && step == 0) Row(Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.tonal).padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Text("Picked up where you left off.", style = Pc.type.small, color = c.ink2, modifier = Modifier.weight(1f))
            LinkText("Start over", { scope.launch { g.host.clearDraft(draftKey) }; form = original ?: TripForm(); restored = false }, style = Pc.type.smallStrong)
        }
        val errs = problems(step, f, f.images.size, options.maxGroupSize)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).imePadding().padding(Gutter), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            when (step) {
                0 -> BasicsStep(f, options, nav, { form = it }) { d -> options = options.copy(destinations = (options.destinations + d).distinctBy { it.id }) }
                1 -> PriceDatesStep(f, options) { form = it }
                2 -> PhotosStep(f, nav) { form = it }
                3 -> PrefsStep(f, options) { form = it }
                else -> ReviewStep(f, options, tripId != null && original?.let { it.title != f.title || it.description != f.description || it.images != f.images || it.pricePaise != f.pricePaise || it.includes != f.includes } == true)
            }
            if (showErrors && errs.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.red.copy(alpha = 0.08f)).padding(12.dp)) {
                errs.forEach { Text("• $it", style = Pc.type.small, color = c.red) }
            }
            serverError?.let { Text(it, style = Pc.type.small, color = c.red) }
        }
        Row(Modifier.fillMaxWidth().background(c.raised).navigationBarsPadding().padding(horizontal = Gutter, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            if (step > 0) PcButton("Back", { step-- }, kind = BtnKind.Outline, height = BtnSmall)
            Spacer(Modifier.weight(1f))
            if (step < Steps.lastIndex) PcButton("Next", {
                if (errs.isEmpty()) { showErrors = false; step++; tick() } else showErrors = true
            }, kind = BtnKind.Primary, height = BtnSmall)
            else PcButton(if (tripId == null) "Send for review" else "Save changes", {
                val all = (0..3).flatMap { problems(it, f, f.images.size, options.maxGroupSize) }
                if (all.isNotEmpty()) { showErrors = true; step = (0..3).first { problems(it, f, f.images.size, options.maxGroupSize).isNotEmpty() }; return@PcButton }
                saving = true; serverError = null
                scope.launch {
                    val clean = f.copy(pricePaise = f.priceVariants.map { it.pricePaise }.minOrNull() ?: f.pricePaise,
                        shortDescription = f.shortDescription?.trim()?.ifBlank { null }, searchKeywords = f.searchKeywords?.trim()?.ifBlank { null })
                    val r = if (tripId == null) g.host.create(clean) else g.host.update(tripId, clean)
                    when (r) {
                        is ApiResult.Ok -> {
                            g.host.clearDraft(draftKey); tick()
                            g.events.emit(AppEvent.Message(when {
                                tripId == null -> "Sent for review. We'll let you know within a day."
                                r.value.needsReapproval -> "Saved. These changes go to review; the trip stays live meanwhile."
                                else -> "Saved"
                            }))
                            g.host.dashboard()
                            if (tripId == null) { nav.back(); nav.to(Routes.hostTrip(r.value.id)) } else nav.back()
                        }
                        is ApiResult.Err -> {
                            serverError = r.message ?: "Couldn't save."
                            if (r.field == "payout") nav.to(Routes.HOST_PAYOUT)
                            stepForField(r.field)?.let { step = it }
                        }
                        ApiResult.Offline -> serverError = "You're offline. Your trip is saved on this phone; send it when you're connected."
                    }
                    saving = false
                }
            }, kind = BtnKind.Accent, height = BtnSmall, loading = saving)
        }
    }
}

private fun stepForField(field: String?): Int? = when (field) {
    null -> null
    "title", "destinationId", "description", "shortDescription", "searchKeywords", "meetingAddress", "meetingPoint" -> 0
    "images" -> 2
    "joinPreferences", "tokenAmountPaise" -> 3
    else -> if (field.startsWith("joinPreferences")) 3 else 1
}

@Composable
private fun Label(text: String, help: String? = null) {
    Column {
        Text(text, style = Pc.type.smallStrong, color = Pc.colors.ink)
        help?.let { Text(it, style = Pc.type.label, color = Pc.colors.ink3) }
    }
}

@Composable
private fun Chip(text: String, on: Boolean, onClick: () -> Unit) {
    val c = Pc.colors
    Text(text, style = Pc.type.smallStrong, color = if (on) c.onInk else c.ink,
        modifier = Modifier.clip(CircleShape).background(if (on) c.ink else c.tonal).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp))
}

// ---- Step 1: basics ----

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun BasicsStep(f: TripForm, options: HostFormOptions, nav: AppNav, set: (TripForm) -> Unit, onNewDestination: (HostDestination) -> Unit) {
    val c = Pc.colors
    val scope = rememberCoroutineScope()
    var q by remember { mutableStateOf("") }
    var picking by remember { mutableStateOf(f.destinationId.isBlank()) }
    var newState by remember { mutableStateOf("") }
    var creating by remember { mutableStateOf(false) }
    Label("Title", "What travellers see first, e.g. Spiti Valley road trip")
    BoxedInput(f.title, { set(f.copy(title = it.take(100))) }, "Trip title", Modifier.fillMaxWidth())
    Label("Where")
    val chosen = options.destinations.firstOrNull { it.id == f.destinationId }
    if (!picking && chosen != null) Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.raised).clickable { picking = true }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        PcIcon(PcIcons.Pin, null, tint = c.ink2, size = 18.dp); Spacer(Modifier.width(8.dp))
        Text("${chosen.name}${chosen.state?.let { ", $it" } ?: ""}", style = Pc.type.body, color = c.ink, modifier = Modifier.weight(1f)); Text("Change", style = Pc.type.smallStrong, color = c.accentInk)
    } else {
        BoxedInput(q, { q = it.take(60) }, "Search a place", Modifier.fillMaxWidth(), leadingIcon = PcIcons.Search)
        val t = q.trim().lowercase()
        val hits = if (t.isEmpty()) emptyList() else options.destinations.filter { it.name.lowercase().contains(t) || it.state.orEmpty().lowercase().contains(t) }.take(8)
        hits.forEach { d ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { set(f.copy(destinationId = d.id)); picking = false; q = "" }.padding(vertical = 10.dp, horizontal = 4.dp)) {
                Text(d.name, style = Pc.type.bodyStrong, color = c.ink); Text("  ${d.state.orEmpty()}", style = Pc.type.small, color = c.ink2)
            }
        }
        if (t.length >= 3 && hits.none { it.name.equals(q.trim(), true) }) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.tonal).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Add “${q.trim()}” as a new place", style = Pc.type.smallStrong, color = c.ink)
            BoxedInput(newState, { newState = it.take(40) }, "State, e.g. Himachal Pradesh", Modifier.fillMaxWidth())
            PcButton("Add place", {
                creating = true
                scope.launch {
                    (nav.graph.host.createDestination(q.trim(), newState.trim()) as? ApiResult.Ok)?.value?.let { d -> onNewDestination(d); set(f.copy(destinationId = d.id)); picking = false; q = "" }
                        ?: nav.graph.events.emit(AppEvent.Message("Couldn't add that place."))
                    creating = false
                }
            }, kind = BtnKind.Outline, height = BtnSmall, enabled = newState.trim().length >= 3, loading = creating)
        }
    }
    Label("Short description", "One line for cards and search (optional)")
    BoxedInput(f.shortDescription.orEmpty(), { set(f.copy(shortDescription = it.take(150))) }, "e.g. 6 days through Kaza, Chandratal and Key", Modifier.fillMaxWidth())
    Label("Full description", "Day by day, what's included, what to bring. **bold**, ## headings and - lists work.")
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("Heading" to "\n## ", "Bold" to "****", "List" to "\n- ").forEach { (l, ins) -> Chip(l, false) { set(f.copy(description = (f.description + ins).take(20000))) } }
    }
    BoxedInput(f.description, { set(f.copy(description = it.take(20000))) }, "Day 1: Delhi to Manali…", Modifier.fillMaxWidth(), singleLine = false, minLines = 8)
    Label("Meeting point", "Where the group gathers (optional)")
    BoxedInput(f.meetingAddress.orEmpty(), { set(f.copy(meetingAddress = it.take(300))) }, "e.g. Majnu ka Tilla bus stand, Delhi", Modifier.fillMaxWidth(), leadingIcon = PcIcons.Pin)
    Label("Search words", "Places and things people might search for (optional)")
    BoxedInput(f.searchKeywords.orEmpty(), { set(f.copy(searchKeywords = it.take(1200))) }, "Chandratal, Key monastery, high-altitude lakes", Modifier.fillMaxWidth(), singleLine = false, minLines = 2)
}

// ---- Step 2: price and dates ----

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun PriceDatesStep(f: TripForm, options: HostFormOptions, set: (TripForm) -> Unit) {
    val c = Pc.colors
    var picking by remember { mutableStateOf(false) }
    var repeatWeeks by remember { mutableIntStateOf(0) }
    val tiers = f.priceVariants
    Label("Price per person", "What a traveller pays, including our ${options.platformFeePercent.toInt()}% fee")
    if (tiers.isEmpty()) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BoxedInput(paiseToRupees(f.pricePaise), { set(f.copy(pricePaise = rupeesToPaise(it) ?: 0)) }, "₹ Price", Modifier.weight(1f), keyboardType = KeyboardType.Number)
            BoxedInput(paiseToRupees(f.compareAtPaise), { set(f.copy(compareAtPaise = rupeesToPaise(it))) }, "₹ Was (optional)", Modifier.weight(1f), keyboardType = KeyboardType.Number)
        }
        if (f.pricePaise >= 100) {
            val fee = (f.pricePaise * options.platformFeePercent / 100).toLong()
            Text("You get about ${MoneyFormat.rupees(f.pricePaise - fee)} per traveller", style = Pc.type.small, color = c.ink2)
        }
        LinkText("Add price options (e.g. double vs triple sharing)", {
            set(f.copy(priceVariants = listOf(PriceVariant("Triple sharing", f.pricePaise.coerceAtLeast(0), f.compareAtPaise), PriceVariant("Double sharing", 0))))
        }, style = Pc.type.smallStrong)
    } else {
        tiers.forEachIndexed { i, t ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.raised).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Option ${i + 1}", style = Pc.type.smallStrong, color = c.ink, modifier = Modifier.weight(1f))
                    IconTap(PcIcons.Trash, "Remove option", { val n = tiers.toMutableList().also { it.removeAt(i) }; set(f.copy(priceVariants = if (n.size <= 1) emptyList() else n, pricePaise = n.firstOrNull()?.pricePaise ?: f.pricePaise)) })
                }
                BoxedInput(t.description, { v -> set(f.copy(priceVariants = tiers.toMutableList().also { it[i] = t.copy(description = v.take(80)) })) }, "e.g. Double sharing", Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BoxedInput(paiseToRupees(t.pricePaise), { v -> set(f.copy(priceVariants = tiers.toMutableList().also { it[i] = t.copy(pricePaise = rupeesToPaise(v) ?: 0) })) }, "₹ Price", Modifier.weight(1f), keyboardType = KeyboardType.Number)
                    BoxedInput(paiseToRupees(t.compareAtPaise), { v -> set(f.copy(priceVariants = tiers.toMutableList().also { it[i] = t.copy(compareAtPaise = rupeesToPaise(v)) })) }, "₹ Was", Modifier.weight(1f), keyboardType = KeyboardType.Number)
                }
            }
        }
        if (tiers.size < 10) LinkText("Add another option", { set(f.copy(priceVariants = tiers + PriceVariant())) }, style = Pc.type.smallStrong)
    }
    Label("Length")
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Stepper("Days", f.tripDays, 1..60) { set(f.copy(tripDays = it, tripNights = f.tripNights.coerceAtMost(it))) }
        Stepper("Nights", f.tripNights, 0..60) { set(f.copy(tripNights = it)) }
    }
    SwitchRow("First day is travel", "Day 1 is the journey there (not counted as a trip day)", f.excludeFirstDayTravel, { set(f.copy(excludeFirstDayTravel = it)) })
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) { Label("Leaves"); Segmented(listOf("morning" to "Morning", "evening" to "Evening"), f.departureTime, { set(f.copy(departureTime = it)) }) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) { Label("Returns"); Segmented(listOf("morning" to "Morning", "evening" to "Evening"), f.returnTime, { set(f.copy(returnTime = it)) }) }
    }
    Label("Group size", "Most travellers on one departure (up to ${options.maxGroupSize})")
    Stepper("People", f.maxGroupSize, 2..options.maxGroupSize) { set(f.copy(maxGroupSize = it)) }
    Label("Difficulty")
    Segmented(listOf("easy" to "Easy", "moderate" to "Moderate", "challenging" to "Challenging"), f.difficulty, { set(f.copy(difficulty = it)) })
    Label("Dates", "Return is set from the trip length; change it if needed")
    f.departures.sortedBy { it.date }.forEach { d ->
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.raised).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${Fmt.dowDayMonth(d.date)} → ${Fmt.dowDayMonth(d.returnDate)}", style = Pc.type.bodyStrong, color = c.ink, modifier = Modifier.weight(1f))
            IconTap(PcIcons.Close, "Remove ${d.date}", { set(f.copy(departures = f.departures - d)) })
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PcButton("Add a date", { picking = true }, kind = BtnKind.Outline, height = BtnSmall, icon = PcIcons.Calendar)
        Text("Repeat weekly:", style = Pc.type.small, color = c.ink2)
        listOf(0, 4, 8, 12).forEach { n -> Chip(if (n == 0) "No" else "$n wk", repeatWeeks == n) { repeatWeeks = n } }
    }
    if (picking) {
        val state = rememberDatePickerState(selectableDates = object : androidx.compose.material3.SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis >= LocalDate.now(IST).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        })
        DatePickerDialog(onDismissRequest = { picking = false }, confirmButton = {
            TextButton({
                state.selectedDateMillis?.let { ms ->
                    val start = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()
                    val span = (f.tripDays - 1).coerceAtLeast(0).toLong()
                    val added = (0..repeatWeeks).map { w -> start.plusWeeks(w.toLong()) }.map { DeparturePair(it.toString(), it.plusDays(span).toString()) }
                    set(f.copy(departures = (f.departures + added).distinctBy { it.date }.sortedBy { it.date }.take(732)))
                }
                picking = false
            }) { Text("Add") }
        }, dismissButton = { TextButton({ picking = false }) { Text("Cancel") } }) { DatePicker(state) }
    }
    Label("What's included")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        (options.includes + f.includes).distinct().forEach { inc -> Chip(inc, inc in f.includes) { set(f.copy(includes = if (inc in f.includes) f.includes - inc else (f.includes + inc).take(30))) } }
    }
    var custom by remember { mutableStateOf("") }
    Row(verticalAlignment = Alignment.CenterVertically) {
        BoxedInput(custom, { custom = it.take(60) }, "Something else", Modifier.weight(1f))
        Spacer(Modifier.width(8.dp))
        PcButton("Add", { if (custom.isNotBlank()) { set(f.copy(includes = (f.includes + custom.trim()).distinct().take(30))); custom = "" } }, kind = BtnKind.Outline, height = BtnSmall)
    }
}

@Composable
private fun Stepper(label: String, value: Int, range: IntRange, onChange: (Int) -> Unit) {
    val c = Pc.colors
    Row(Modifier.clip(RoundedCornerShape(12.dp)).background(c.raised).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        IconTap(PcIcons.Minus, "Fewer $label", { if (value > range.first) onChange(value - 1) })
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthIn(min = 56.dp)) {
            Text("$value", style = Pc.type.num.copy(fontSize = 18.sp), color = c.ink); Text(label, style = Pc.type.label, color = c.ink2)
        }
        IconTap(PcIcons.Plus, "More $label", { if (value < range.last) onChange(value + 1) })
    }
}

// ---- Step 3: photos ----

@Composable
private fun PhotosStep(f: TripForm, nav: AppNav, set: (TripForm) -> Unit) {
    val g = nav.graph
    val c = Pc.colors
    val scope = rememberCoroutineScope()
    var queue by remember { mutableStateOf<List<Uri>>(emptyList()) }
    var uploading by remember { mutableIntStateOf(0) }
    val current by rememberUpdatedState(f)
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(12)) { uris -> queue = uris.take(12 - f.images.size) }
    Label("Photos", "Up to 12, cropped to 16:9. The first one is the cover.")
    // Crop each picked photo in turn, then upload it.
    queue.firstOrNull()?.let { src ->
        androidx.compose.ui.window.Dialog({ queue = queue.drop(1) }, androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
            PhotoEditor(src, onCancel = { queue = queue.drop(1) }, aspects = TripAspects) { out ->
                queue = queue.drop(1)
                uploading++
                scope.launch {
                    val file = File(g.app.cacheDir, "trip_${UUID.randomUUID()}.jpg")
                    if (runCatching { g.compressor.compress(out, file) }.isSuccess) {
                        val part = MultipartBody.Part.createFormData("file", file.name, file.asRequestBody("image/jpeg".toMediaType()))
                        when (val r = apiCall { g.api.upload(part, "host".toRequestBody("text/plain".toMediaType())) }) {
                            is ApiResult.Ok -> set(current.copy(images = (current.images + r.value.url).take(12)))
                            is ApiResult.Err -> g.events.emit(AppEvent.Message(r.message ?: "Couldn't upload a photo."))
                            ApiResult.Offline -> g.events.emit(AppEvent.Message("You're offline."))
                        }
                    }
                    file.delete(); uploading--
                }
            }
        }
    }
    f.images.forEachIndexed { i, url ->
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(14.dp))) {
            coil3.compose.AsyncImage(url, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            if (i == 0) Text("Cover", style = Pc.type.label.copy(fontWeight = FontWeight.Bold), color = Color.Black,
                modifier = Modifier.align(Alignment.TopStart).padding(8.dp).clip(CircleShape).background(Color.White).padding(horizontal = 10.dp, vertical = 4.dp))
            Row(Modifier.align(Alignment.TopEnd).padding(4.dp)) {
                if (i > 0) GlassButton(PcIcons.Star, "Make cover", { set(f.copy(images = listOf(url) + (f.images - url))) })
                GlassButton(PcIcons.Trash, "Remove photo", { set(f.copy(images = f.images - url)) })
            }
        }
    }
    if (uploading > 0) Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(14.dp)).background(c.tonal), contentAlignment = Alignment.Center) {
        androidx.compose.material3.CircularProgressIndicator(Modifier.size(28.dp), color = c.ink2, strokeWidth = 2.5.dp)
    }
    if (f.images.size + uploading < 12) Box(Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, c.rule, RoundedCornerShape(14.dp))
        .clickable { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            PcIcon(PcIcons.Camera, null, tint = c.ink2, size = 28.dp)
            Text(if (f.images.isEmpty()) "Add photos" else "Add more", style = Pc.type.smallStrong, color = c.ink2)
        }
    }
}

// ---- Step 4: who can join ----

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun PrefsStep(f: TripForm, options: HostFormOptions, set: (TripForm) -> Unit) {
    val c = Pc.colors
    val p = f.joinPreferences
    fun up(np: JoinPrefs) = set(f.copy(joinPreferences = np))
    Label("How people book")
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("pay_on_booking" to ("Book and pay straight away" to "Fastest; you see who's coming as they book"),
            "after_host_approval" to ("Request first, pay after you approve" to "You approve each traveller; they get 48 hours to pay")).forEach { (k, v) ->
            val on = p.paymentTiming == k
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(if (on) 2.dp else 1.dp, if (on) c.ink else c.rule, RoundedCornerShape(14.dp)).clickable { up(p.copy(paymentTiming = k)) }.padding(14.dp)) {
                Text(v.first, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink); Text(v.second, style = Pc.type.small, color = c.ink2)
            }
        }
    }
    SwitchRow("Token to hold a spot", "Travellers pay a part now and the rest later", p.tokenDepositEnabled, { up(p.copy(tokenDepositEnabled = it)) })
    if (p.tokenDepositEnabled) BoxedInput(paiseToRupees(p.tokenAmountPaise), { up(p.copy(tokenAmountPaise = rupeesToPaise(it))) }, "₹ Token amount", Modifier.fillMaxWidth(), keyboardType = KeyboardType.Number)
    Label("Who it's for")
    Segmented(listOf("all" to "Everyone", "women" to "Women", "men" to "Men"), p.genderPreference ?: "all", { up(p.copy(genderPreference = it.takeIf { g -> g != "all" })) })
    Label("Age", "Leave empty for any adult")
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        BoxedInput(p.minAge?.toString().orEmpty(), { up(p.copy(minAge = it.filter(Char::isDigit).take(2).toIntOrNull()?.coerceIn(18, 99))) }, "From", Modifier.weight(1f), keyboardType = KeyboardType.Number)
        BoxedInput(p.maxAge?.toString().orEmpty(), { up(p.copy(maxAge = it.filter(Char::isDigit).take(2).toIntOrNull()?.coerceIn(18, 99))) }, "To", Modifier.weight(1f), keyboardType = KeyboardType.Number)
    }
    Label("Experience", "Trips done on UnSOLO before joining (0 = anyone)")
    Stepper("Trips", p.minTripsCompleted ?: 0, 0..50) { up(p.copy(minTripsCompleted = it)) }
    Label("Vibe", "Helps the right people find it")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.interestTags.forEach { t -> Chip(t, t in p.interestTags) { up(p.copy(interestTags = if (t in p.interestTags) p.interestTags - t else (p.interestTags + t).take(20))) } }
    }
}

// ---- Step 5: review ----

@Composable
private fun ReviewStep(f: TripForm, options: HostFormOptions, contentChanged: Boolean) {
    val c = Pc.colors
    val place = options.destinations.firstOrNull { it.id == f.destinationId }
    f.images.firstOrNull()?.let { coil3.compose.AsyncImage(it, null, Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(14.dp)), contentScale = ContentScale.Crop) }
    Text(f.title, style = Pc.type.display.copy(fontSize = 22.sp), color = c.ink)
    Text(listOfNotNull(place?.name, "${f.tripDays}D/${f.tripNights}N", f.difficulty.replaceFirstChar { it.uppercase() }, "up to ${f.maxGroupSize}").joinToString(" · "), style = Pc.type.body, color = c.ink2)
    val min = f.priceVariants.map { it.pricePaise }.minOrNull() ?: f.pricePaise
    Text((if (f.priceVariants.isNotEmpty()) "From " else "") + MoneyFormat.rupees(min) + " per person", style = Pc.type.bodyStrong, color = c.ink)
    Text("${f.departures.size} date${if (f.departures.size == 1) "" else "s"}" + (f.departures.minByOrNull { it.date }?.let { ", first ${Fmt.dowDayMonth(it.date)}" } ?: ""), style = Pc.type.body, color = c.ink2)
    if (f.includes.isNotEmpty()) Text("Includes " + f.includes.joinToString(", "), style = Pc.type.small, color = c.ink2)
    Text(if (f.joinPreferences.paymentTiming == "after_host_approval") "You approve each traveller before they pay" else "Travellers book and pay straight away", style = Pc.type.small, color = c.ink2)
    Text(if (contentChanged) "Changes to the title, description, photos, price or what's included go to review again (the trip stays live)." else "New trips are reviewed within a day. We'll notify you.",
        style = Pc.type.small, color = c.goldInk, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.goldBg).padding(12.dp))
}
