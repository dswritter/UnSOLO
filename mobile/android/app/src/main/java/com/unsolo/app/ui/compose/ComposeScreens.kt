package com.unsolo.app.ui.compose

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.AsyncImage
import com.unsolo.app.AppGraph
import com.unsolo.app.core.model.*
import com.unsolo.app.data.PostDraft
import com.unsolo.app.data.PostItem
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import com.unsolo.app.ui.theme.PcTokens
import com.unsolo.app.ui.tribe.CardActions
import com.unsolo.app.ui.tribe.PlanCard
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

// ---------------- Post sheet ----------------

@Composable
fun PostTypeSheet(onDismiss: () -> Unit, onPick: (String) -> Unit, onHosting: () -> Unit) {
    val c = Pc.colors
    PcSheet(onDismiss) {
        Text("What are you posting?", style = Pc.type.title1, color = c.ink, modifier = Modifier.padding(horizontal = Gutter, vertical = 8.dp))
        Column(Modifier.padding(horizontal = Gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            TypeRow(PcIcons.Users, "Plan a trip or meetup", "People ask to join, and a group chat opens", dashed = true) { onPick(PostKind.PLAN) }
            TypeRow(PcIcons.Image, "Share a story", "Photos from a trip. Tag the trip and who went") { onPick(PostKind.STORY) }
            TypeRow(PcIcons.Question, "Ask the Tribe", "A question, with an optional poll") { onPick(PostKind.ASK) }
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(PcTokens.radiusCard)).background(c.goldBg).clickable(onClick = onHosting).padding(12.dp), verticalAlignment = Alignment.Top) {
                Tag("Host", TagKind.Host)
                Spacer(Modifier.width(10.dp))
                Text("Selling a trip, stay or rental? List it in Hosting. Tribe is for travellers, so promotional posts are removed.", style = Pc.type.small, color = c.ink)
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun TypeRow(icon: ImageVector, title: String, sub: String, dashed: Boolean = false, onClick: () -> Unit) {
    val c = Pc.colors
    Row(Modifier.fillMaxWidth().raisedCard().clickable(role = Role.Button, onClick = onClick).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(48.dp).then(if (dashed) Modifier.dashedBorder(c.rule2, radius = 24.dp, width = 1.5.dp) else Modifier.clip(androidx.compose.foundation.shape.CircleShape).background(tonal())), contentAlignment = Alignment.Center) { PcIcon(icon, null) }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = Pc.type.bodyStrong, color = c.ink)
            Text(sub, style = Pc.type.small, color = c.ink2)
        }
        PcIcon(PcIcons.ChevronRight, null, size = 18.dp)
    }
}

// ---------------- Composer ----------------

class ComposeViewModel(private val g: AppGraph, val kind: String) : ViewModel() {
    var title by mutableStateOf("")
    var body by mutableStateOf("")
    var place by mutableStateOf("")
    var startsOn by mutableStateOf<LocalDate?>(null)
    var endsOn by mutableStateOf<LocalDate?>(null)
    var spots by mutableIntStateOf(4)
    var audience by mutableStateOf("verified")
    var cost by mutableStateOf("")
    var meetingPoint by mutableStateOf("")
    val photos = mutableStateListOf<Uri>()
    var trip by mutableStateOf<TripLite?>(null)
    val tagged = mutableStateListOf<UserLite>()
    var showOnTripPage by mutableStateOf(true)
    var pollOn by mutableStateOf(false)
    val pollOptions = mutableStateListOf("", "")
    var publishing by mutableStateOf(false)

    val me = g.account.me
    val pastTrips = g.explore.observeMyTrips().map { it?.past.orEmpty() }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val idVerified get() = me.value?.user?.isIdVerified == true

    init { if (kind == PostKind.STORY) viewModelScope.launch { g.explore.refreshMyTrips() } }

    val error: String?
        get() = when (kind) {
            PostKind.PLAN -> when {
                title.isBlank() -> "Give the plan a title"
                place.isBlank() -> "Where are you going?"
                startsOn == null -> "Pick dates"
                (audience == "women" || spots >= 5) && !idVerified -> "Women-only plans and groups of 5+ need a verified ID"
                else -> null
            }
            PostKind.STORY -> when {
                photos.isEmpty() -> "Add at least one photo"
                title.isBlank() -> "Give your story a title"
                else -> null
            }
            else -> when {
                title.trim().length < 8 -> "Ask a full question"
                pollOn && pollOptions.count { it.isNotBlank() } < 2 -> "Polls need at least 2 options"
                else -> null
            }
        }

    fun draft() = PostDraft(
        kind = kind,
        title = title.trim().ifBlank { null },
        body = body.trim(),
        place = (trip?.place ?: place.trim().takeIf { it.isNotEmpty() }?.let { Place(it) }),
        startsOn = startsOn?.toString(), endsOn = (endsOn ?: startsOn)?.toString(),
        spotsTotal = if (kind == PostKind.PLAN) spots else null,
        audience = if (kind == PostKind.PLAN) audience else null,
        estCostText = cost.trim().ifBlank { null }?.let { c ->
            val amount = if (c.first().isDigit()) "₹$c" else c
            if (amount.startsWith("Est", true)) amount else "Est. $amount each, split among yourselves"
        },
        meetingPoint = meetingPoint.trim().ifBlank { null },
        trip = trip, showOnTripPage = if (kind == PostKind.STORY && trip != null) showOnTripPage else null,
        poll = if (kind == PostKind.ASK && pollOn) pollOptions.map { it.trim() }.filter { it.isNotEmpty() }.take(4) else null,
        tagUsers = tagged.toList(),
    )

    fun preview(): Post {
        val d = draft()
        val meUser = g.account.meLite()
        return Post(
            id = "preview", kind = kind, author = meUser, title = d.title ?: "Your plan title", body = d.body, place = d.place ?: Place("Somewhere good"),
            startsOn = d.startsOn ?: LocalDate.now().plusDays(14).toString(), endsOn = d.endsOn ?: LocalDate.now().plusDays(16).toString(),
            spotsTotal = spots, memberCount = 1, audience = audience, estCostText = d.estCostText,
            seats = listOf(Seat(SeatState.YOU, meUser)) + List(spots - 1) { Seat(SeatState.OPEN) },
            createdAt = Instant.now().toString(), viewer = Viewer(canJoin = true),
        )
    }

    fun publish(onDone: () -> Unit) {
        if (error != null || publishing) return
        publishing = true
        viewModelScope.launch {
            g.tribe.publish(draft(), photos.toList())
            onDone()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComposeScreen(kind: String, nav: AppNav) {
    val vm: ComposeViewModel = viewModel(key = "compose-$kind") { ComposeViewModel(nav.graph, kind) }
    val c = Pc.colors
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(6)) { uris ->
        uris.forEach { if (vm.photos.size < 6 && it !in vm.photos) vm.photos += it }
    }
    var dates by remember { mutableStateOf(false) }
    var triedPublish by remember { mutableStateOf(false) }
    val posting = nav.graph.config.config.collectAsStateWithLifecycle().value.flags.tribePostingEnabled
    val title = when (kind) { PostKind.PLAN -> "New plan"; PostKind.STORY -> "New story"; else -> "Ask the Tribe" }

    Column(Modifier.fillMaxSize().background(c.paper)) {
        ComposerTopBar(title) { nav.back() }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            when (kind) {
                PostKind.PLAN -> PlanForm(vm, onDates = { dates = true }, onPhotos = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) })
                PostKind.STORY -> StoryForm(vm, onPhotos = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) })
                else -> AskForm(vm)
            }
            if (triedPublish && vm.error != null) Text(vm.error!!, style = Pc.type.smallStrong, color = c.red, modifier = Modifier.padding(16.dp))
            Spacer(Modifier.height(24.dp))
        }
        val (barTitle, barSub, action) = when (kind) {
            PostKind.PLAN -> Triple(if (vm.audience == "women") "Visible to women travellers" else if (vm.audience == "verified") "Visible to verified travellers" else "Visible to everyone", "You can edit or cancel anytime", "Publish plan")
            PostKind.STORY -> Triple("Your group gets a note", "Tagged people choose whether their face shows", "Publish")
            else -> Triple("Most asks get a reply in ~3h", "The best answer is pinned to the top", "Post")
        }
        BottomActionBar(if (posting) barTitle else "Posting is paused", if (posting) barSub else "Try again in a little while", action, enabled = posting && !vm.publishing, onAction = {
            triedPublish = true
            vm.publish { nav.popToTab(Routes.TRIBE) }
        })
    }

    if (dates) {
        val today = LocalDate.now().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val state = rememberDateRangePickerState(
            initialSelectedStartDateMillis = vm.startsOn?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli(),
            initialSelectedEndDateMillis = vm.endsOn?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli(),
            selectableDates = object : androidx.compose.material3.SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis >= today
                override fun isSelectableYear(year: Int) = year >= LocalDate.now().year
            },
        )
        val colors = DatePickerDefaults.colors(containerColor = c.paper, selectedDayContainerColor = c.ink, selectedDayContentColor = c.onInk, todayDateBorderColor = c.ink, dayInSelectionRangeContainerColor = c.goldBg, todayContentColor = c.ink)
        DatePickerDialog(onDismissRequest = { dates = false }, colors = colors, confirmButton = {
            TextButton({
                state.selectedStartDateMillis?.let { vm.startsOn = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                vm.endsOn = state.selectedEndDateMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() } ?: vm.startsOn
                dates = false
            }) { Text("Done", style = Pc.type.bodyStrong, color = c.ink) }
        }, dismissButton = { TextButton({ dates = false }) { Text("Cancel", style = Pc.type.body, color = c.ink) } }) {
            DateRangePicker(state, Modifier.weight(1f), colors = colors, showModeToggle = false)
        }
    }
}

@Composable
private fun PlanForm(vm: ComposeViewModel, onDates: () -> Unit, onPhotos: () -> Unit) {
    val c = Pc.colors
    Spacer(Modifier.height(8.dp))
    FormCard {
    FieldRow("Title", vm.title, { vm.title = it }, placeholder = "Tosh & Kalga weekend", style = Pc.type.title3, maxLength = 90)
    InsetRule()
    FieldRow("Where", vm.place, { vm.place = it }, placeholder = "Tosh, Parvati Valley", icon = PcIcons.Pin, maxLength = 80)
    InsetRule()
    Column(Modifier.fillMaxWidth().clickable(onClick = onDates).padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text("When", style = Pc.type.small, color = c.ink2)
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            PcIcon(PcIcons.Calendar, null, size = 18.dp)
            Spacer(Modifier.width(8.dp))
            Text(vm.startsOn?.let { Fmt.range(it.toString(), (vm.endsOn ?: it).toString()) } ?: "Pick dates", style = Pc.type.num.copy(fontSize = 16.sp), color = if (vm.startsOn == null) c.ink3 else c.ink)
        }
    }
    InsetRule()
    Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("Group size", style = Pc.type.small, color = c.ink2)
            Row(verticalAlignment = Alignment.Bottom) {
                Text("${vm.spots} people", style = Pc.type.bodyStrong.copy(fontSize = 16.sp), color = c.ink)
                Text("  including you", style = Pc.type.small, color = c.ink2)
            }
        }
        Stepper(vm.spots, { vm.spots = it }, 2, 12)
    }
    InsetRule()
    FieldRow("Rough cost each", vm.cost, { vm.cost = it }, placeholder = "₹4,500", keyboardType = KeyboardType.Text,
        helper = "Split among yourselves. UnSOLO doesn't take payments for plans.", maxLength = 60)
    InsetRule()
    Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text("Who can join", style = Pc.type.small, color = c.ink2)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            listOf("verified" to "Verified travellers", "women" to "Women only", "anyone" to "Anyone").forEach { (k, l) ->
                PcChip(l, vm.audience == k, { vm.audience = k })
            }
        }
        Spacer(Modifier.height(6.dp))
        Text("Women-only plans need everyone verified, joiners too. 18+ only.", style = Pc.type.small, color = c.ink2)
    }
    InsetRule()
    FieldRow("Meeting point (only approved members see it)", vm.meetingPoint, { vm.meetingPoint = it }, placeholder = "Majnu ka Tilla bus stand, 21:30", maxLength = 120)
    InsetRule()
    FieldRow("About the plan", vm.body, { vm.body = it }, placeholder = "Volvo up, two nights in Kalga, easy pace. Looking for…", singleLine = false, maxLength = 1500)
    }
    Spacer(Modifier.height(12.dp))
    FormCard {
    PhotoStrip(vm.photos, onAdd = onPhotos, onRemove = { vm.photos.remove(it) })
    }
    Column(Modifier.padding(vertical = 20.dp)) {
        Overline("Preview in the feed", Modifier.padding(start = Gutter + 4.dp, bottom = 4.dp))
        Box {
            val noop = remember { CardActions({}, {}, {}, { _, _ -> }, {}, {}, {}, { _, _ -> }, {}, {}) }
            PlanCard(PostItem(vm.preview()), null, noop)
        }
    }
}

@Composable
private fun PhotoStrip(photos: List<Uri>, onAdd: () -> Unit, onRemove: (Uri) -> Unit) {
    val c = Pc.colors
    Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text("Photos · ${photos.size}/6", style = Pc.type.small, color = c.ink2)
        Spacer(Modifier.height(8.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            photos.forEachIndexed { i, u ->
                Box(Modifier.size(84.dp).clip(RoundedCornerShape(PcTokens.radiusButton))) {
                    AsyncImage(u, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    if (i == 0) Text("COVER", style = Pc.type.code, color = c.onInk, modifier = Modifier.padding(4.dp).clip(RoundedCornerShape(3.dp)).background(c.ink.copy(alpha = 0.8f)).padding(horizontal = 4.dp, vertical = 2.dp))
                    Box(Modifier.align(Alignment.TopEnd).size(28.dp).clickable(onClickLabel = "Remove photo") { onRemove(u) }, contentAlignment = Alignment.Center) {
                        Box(Modifier.size(20.dp).clip(RoundedCornerShape(10.dp)).background(c.ink.copy(alpha = 0.8f)), contentAlignment = Alignment.Center) { PcIcon(PcIcons.Close, null, tint = c.onInk, size = 14.dp) }
                    }
                }
            }
            if (photos.size < 6) Column(Modifier.size(84.dp).pencilledCard(radius = PcTokens.radiusImage).clickable(role = Role.Button, onClickLabel = "Add photos", onClick = onAdd), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                PcIcon(PcIcons.Plus, null, size = 18.dp)
                Text("Add photos", style = Pc.type.label, color = c.ink2)
            }
        }
    }
}

@Composable
private fun StoryForm(vm: ComposeViewModel, onPhotos: () -> Unit) {
    val c = Pc.colors
    val past by vm.pastTrips.collectAsStateWithLifecycle()
    Spacer(Modifier.height(8.dp))
    FormCard {
    PhotoStrip(vm.photos, onAdd = onPhotos, onRemove = { vm.photos.remove(it) })
    InsetRule()
    FieldRow("Title", vm.title, { vm.title = it }, placeholder = "Rafting, Ganga aarti and 9 new friends", style = Pc.type.title3, maxLength = 90)
    InsetRule()
    Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text("Which trip?", style = Pc.type.small, color = c.ink2)
        Spacer(Modifier.height(8.dp))
        if (past.isEmpty()) Text("No past UnSOLO trips yet. Tag a place instead.", style = Pc.type.small, color = c.ink2)
        past.forEach { b ->
            val sel = vm.trip?.id == b.trip.id
            Row(Modifier.padding(bottom = 8.dp).fillMaxWidth().clip(RoundedCornerShape(PcTokens.radiusButton)).background(if (sel) c.goldBg else c.raised).ruledBox(if (sel) c.ink else c.rule2)
                .clickable { vm.trip = if (sel) null else b.trip; vm.tagged.clear() }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                ProgressiveImage(b.trip.image, Modifier.size(48.dp).clip(RoundedCornerShape(PcTokens.radiusImage)))
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("HOSTED TRIP · YOU WENT", style = Pc.type.code, color = c.ink2)
                    Text(b.trip.title, style = Pc.type.bodyStrong, color = c.ink)
                    Text("${Fmt.dayMonth(b.travelDate)} · ${b.trip.host?.name.orEmpty()}", style = Pc.type.small, color = c.ink2)
                }
                if (sel) PcIcon(PcIcons.Check, "Selected", size = 18.dp)
            }
        }
        if (vm.trip == null) FieldRowInline("Or a place", vm.place) { vm.place = it }
    }
    InsetRule()
    vm.trip?.let { t ->
        Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
            Text("Who went with you", style = Pc.type.small, color = c.ink2)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                t.goingFaces.forEach { u ->
                    val on = u in vm.tagged
                    Column(Modifier.clickable { if (on) vm.tagged.remove(u) else vm.tagged.add(u) }, horizontalAlignment = Alignment.CenterHorizontally) {
                        SeatCell(Seat(if (on) SeatState.MEMBER else SeatState.OPEN, u), 44.dp)
                        Text(u.firstName, style = Pc.type.label, color = if (on) c.ink else c.ink2)
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Text("Tagged people are asked first. Faces show only for those who say yes.", style = Pc.type.small, color = c.ink2)
        }
        InsetRule()
        SwitchRow("Show on the trip page", "Under \"From people who went\" on ${t.title}", vm.showOnTripPage, { vm.showOnTripPage = it })
        InsetRule()
    }
    FieldRow("Tell it", vm.body, { vm.body = it }, placeholder = "Day 1 we were 10 strangers on a Volvo…", singleLine = false, maxLength = 4000)
    }
}

@Composable
private fun FieldRowInline(label: String, value: String, onValue: (String) -> Unit) {
    Spacer(Modifier.height(6.dp))
    BoxedInput(value, { onValue(it.take(80)) }, label)
}

@Composable
private fun AskForm(vm: ComposeViewModel) {
    val c = Pc.colors
    Spacer(Modifier.height(8.dp))
    FormCard {
    FieldRow("Your question", vm.title, { vm.title = it }, placeholder = "Kasol solo in early December: which stay is better for meeting people?", style = Pc.type.title3, singleLine = false, maxLength = 200)
    InsetRule()
    FieldRow("Place", vm.place, { vm.place = it }, placeholder = "Kasol, Parvati Valley", icon = PcIcons.Pin, maxLength = 80)
    InsetRule()
    FieldRow("Details (optional)", vm.body, { vm.body = it }, placeholder = "Dates, budget, what you care about", singleLine = false, maxLength = 1500)
    InsetRule()
    SwitchRow("Add a poll", "2–4 options, open for 3 days", vm.pollOn, { vm.pollOn = it })
    if (vm.pollOn) Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        vm.pollOptions.forEachIndexed { i, o ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${i + 1}", style = Pc.type.code, color = c.ink2, modifier = Modifier.width(20.dp))
                BoxedInput(o, { vm.pollOptions[i] = it.take(60) }, "Option ${i + 1}", Modifier.weight(1f))
                if (vm.pollOptions.size > 2) IconTap(PcIcons.Close, "Remove option", { vm.pollOptions.removeAt(i) })
            }
        }
        if (vm.pollOptions.size < 4) Row(Modifier.fillMaxWidth().height(48.dp).dashedBorder(c.rule2, radius = PcTokens.radiusButton, width = 1.5.dp).clickable { vm.pollOptions.add("") }.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            PcIcon(PcIcons.Plus, null, size = 18.dp, tint = c.ink2)
            Spacer(Modifier.width(8.dp))
            Text("Add option", style = Pc.type.body, color = c.ink2)
        }
        Spacer(Modifier.height(12.dp))
    }
    }
    Text("No links or prices in answers. Hosts answer as people, with their HOST tag.", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(horizontal = Gutter, vertical = 12.dp))
}
