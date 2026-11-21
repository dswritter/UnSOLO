package com.unsolo.app.ui.compose

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
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
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

// ---------------- Post sheet ----------------

/** Kinds offered by the centre + tab. "poll" is an ask that opens with the poll on. */
const val KIND_POLL = "poll"

@Composable
fun PostTypeSheet(onDismiss: () -> Unit, onPick: (String) -> Unit, onHosting: () -> Unit) {
    val c = Pc.colors
    PcSheet(onDismiss) {
        SheetTitle("What are you sharing?", "Everything goes to Tribe.")
        Column(Modifier.padding(horizontal = Gutter), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                KindTile(PcIcons.UsersThree, "Plan", "Find people for a trip you're planning", Modifier.weight(1f)) { onPick(PostKind.PLAN) }
                KindTile(PcIcons.Camera, "Story", "Photos from a trip, stays on your profile", Modifier.weight(1f)) { onPick(PostKind.STORY) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                KindTile(PcIcons.Question, "Question", "Ask travellers and hosts", Modifier.weight(1f)) { onPick(PostKind.ASK) }
                KindTile(PcIcons.ChartBar, "Poll", "Let the tribe vote", Modifier.weight(1f)) { onPick(KIND_POLL) }
            }
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(RadiusField)).background(c.tonal).clickable(role = Role.Button, onClick = onHosting).padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Tag("Host", TagKind.Host, height = 20.dp)
                Spacer(Modifier.width(10.dp))
                Text("Selling a trip, stay or rental? List it in Hosting.", style = Pc.type.small, color = c.ink, modifier = Modifier.weight(1f))
                PcIcon(PcIcons.ChevronRight, null, size = 18.dp, tint = c.ink3)
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun KindTile(icon: ImageVector, title: String, sub: String, modifier: Modifier, onClick: () -> Unit) {
    val c = Pc.colors
    val shape = RoundedCornerShape(22.dp)
    Column(modifier.heightIn(min = 112.dp).clip(shape).background(c.raised).border(1.dp, c.rule, shape).clickable(role = Role.Button, onClickLabel = "New $title", onClick = onClick).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(12.dp)).background(c.tonal), contentAlignment = Alignment.Center) { PcIcon(icon, null, tint = c.ink, size = 18.dp) }
        Text(title, style = Pc.type.bodyStrong.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, fontSize = 14.sp), color = c.ink)
        Text(sub, style = Pc.type.small, color = c.ink2)
    }
}

// ---------------- Composer ----------------

class ComposeViewModel(private val g: AppGraph, val kind: String, startWithPoll: Boolean = false) : ViewModel() {
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
    var pollOn by mutableStateOf(startWithPoll)
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
fun ComposeScreen(kindArg: String, nav: AppNav) {
    val isPoll = kindArg == KIND_POLL
    val kind = if (isPoll) PostKind.ASK else kindArg
    val vm: ComposeViewModel = viewModel(key = "compose-$kindArg") { ComposeViewModel(nav.graph, kind, startWithPoll = isPoll) }
    val c = Pc.colors
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(6)) { uris ->
        uris.forEach { if (vm.photos.size < 6 && it !in vm.photos) vm.photos += it }
    }
    var dates by remember { mutableStateOf(false) }
    var triedPublish by remember { mutableStateOf(false) }
    val posting = nav.graph.config.config.collectAsStateWithLifecycle().value.flags.tribePostingEnabled
    val title = when (kind) { PostKind.PLAN -> "New plan"; PostKind.STORY -> "New story"; else -> if (isPoll) "New poll" else "New question" }

    Column(Modifier.fillMaxSize().background(c.paper)) {
        ComposerTopBar(title) { nav.back() }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Spacer(Modifier.height(2.dp))
            when (kind) {
                PostKind.PLAN -> PlanForm(vm, onDates = { dates = true }, onPhotos = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) })
                PostKind.STORY -> StoryForm(vm, onPhotos = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) })
                else -> AskForm(vm, isPoll)
            }
            if (triedPublish && vm.error != null) Text(vm.error!!, style = Pc.type.smallStrong, color = c.red)
            Spacer(Modifier.height(16.dp))
        }
        val (barTitle, barSub) = when (kind) {
            PostKind.PLAN -> (if (vm.audience == "women") "Visible to women travellers" else if (vm.audience == "verified") "Visible to verified travellers" else "Visible to everyone") to "You can edit or cancel anytime"
            PostKind.STORY -> "Your group gets a note" to "Tagged people choose whether their face shows"
            else -> (if (vm.pollOn) "Open for 3 days" else "Most questions get a reply in ~3h") to "Hosts answer with their HOST tag"
        }
        BottomActionBar(if (posting) barTitle else "Posting is paused", if (posting) barSub else "Try again in a little while", "Publish", kind = BtnKind.Accent, enabled = posting && !vm.publishing, onAction = {
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
        val colors = DatePickerDefaults.colors(containerColor = c.raised, selectedDayContainerColor = c.ink, selectedDayContentColor = c.raised, todayDateBorderColor = c.ink, dayInSelectionRangeContainerColor = c.tonal, todayContentColor = c.ink)
        DatePickerDialog(onDismissRequest = { dates = false }, colors = colors, confirmButton = {
            TextButton({
                state.selectedStartDateMillis?.let { vm.startsOn = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                vm.endsOn = state.selectedEndDateMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() } ?: vm.startsOn
                dates = false
            }) { Text("Done", style = Pc.type.bodyStrong, color = c.accentInk) }
        }, dismissButton = { TextButton({ dates = false }) { Text("Cancel", style = Pc.type.body, color = c.ink) } }) {
            DateRangePicker(state, Modifier.weight(1f), colors = colors, showModeToggle = false)
        }
    }
}

/** One `.field` block: label + value, surface, 18dp radius. */
@Composable
private fun Field(label: String, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().fieldBox().then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier).padding(horizontal = 14.dp, vertical = 10.dp)) {
        Text(label, style = Pc.type.label.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Pc.colors.ink2)
        Spacer(Modifier.height(2.dp))
        content()
    }
}

@Composable
private fun InlineInput(value: String, onValue: (String) -> Unit, placeholder: String, maxLength: Int, singleLine: Boolean = true, style: androidx.compose.ui.text.TextStyle = Pc.type.bodyStrong.copy(fontSize = 14.sp), keyboardType: KeyboardType = KeyboardType.Text) {
    val c = Pc.colors
    Box(Modifier.fillMaxWidth().defaultMinSize(minHeight = 26.dp), contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Text(placeholder, style = style.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Medium), color = c.ink3.copy(alpha = 0.72f))
        androidx.compose.foundation.text.BasicTextField(value, { if (it.length <= maxLength) onValue(it) }, singleLine = singleLine, textStyle = style.copy(color = c.ink),
            cursorBrush = androidx.compose.ui.graphics.SolidColor(c.ink), keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = keyboardType), modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun PlanForm(vm: ComposeViewModel, onDates: () -> Unit, onPhotos: () -> Unit) {
    val c = Pc.colors
    val me by vm.me.collectAsStateWithLifecycle()
    val women = vm.audience == "women"
    // Live preview: you hold the first seat (gold); the ring grows with the group size and turns rose for women-only.
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        SeatRing(total = vm.spots, taken = 0, size = 112.dp, you = YouSeat.You, plan = true, women = women, centerUser = me?.user, me = me?.user,
            contentDescription = "Live preview: you plus ${vm.spots - 1} spots")
        Spacer(Modifier.height(6.dp))
        Text(buildAnnotatedString { append("Live preview · "); withStyle(SpanStyle(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = c.ink)) { append("you + ${vm.spots - 1} spots") } },
            style = Pc.type.smallStrong.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Medium), color = c.ink2)
    }
    Field("Title") { InlineInput(vm.title, { vm.title = it }, "Tosh & Kalga weekend", 90) }
    Field("Where to?") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PcIcon(PcIcons.PinFilled, null, size = 16.dp, tint = c.ink2); Spacer(Modifier.width(6.dp))
            InlineInput(vm.place, { vm.place = it }, "Spiti Valley", 80)
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Field("When", Modifier.weight(1.6f), onClick = onDates) {
            Text(vm.startsOn?.let { Fmt.range(it.toString(), (vm.endsOn ?: it).toString()) } ?: "Pick dates", style = Pc.type.bodyStrong.copy(fontSize = 14.sp), color = if (vm.startsOn == null) c.ink3 else c.ink, maxLines = 1)
        }
        val days = vm.startsOn?.let { s -> java.time.temporal.ChronoUnit.DAYS.between(s, vm.endsOn ?: s).toInt() + 1 }
        Field("Days", Modifier.weight(1f), onClick = onDates) {
            Text(days?.toString() ?: "–", style = Pc.type.bodyStrong.copy(fontSize = 14.sp), color = if (days == null) c.ink3 else c.ink)
        }
    }
    Row(Modifier.fillMaxWidth().fieldBox().padding(start = 14.dp, end = 4.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("People you're looking for", style = Pc.type.label.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink2)
            Text("${vm.spots - 1} more", style = Pc.type.bodyStrong.copy(fontSize = 14.sp), color = c.ink)
        }
        Stepper(vm.spots - 1, { vm.spots = it + 1 }, 1, 11)
    }
    Field("Budget each") {
        InlineInput(vm.cost, { vm.cost = it }, "~₹20,000", 60)
        Text("Split among yourselves. UnSOLO doesn't take payments for plans.", style = Pc.type.small, color = c.ink3)
    }
    Column(Modifier.fillMaxWidth().fieldBox().padding(vertical = 4.dp)) {
        SwitchRow("Women only", "Only women can see and join · ID check", women, { on -> vm.audience = if (on) "women" else "verified" }, onColor = c.rose, titleColor = c.rose, titleIcon = PcIcons.GenderFemale, modifier = Modifier.padding(start = 0.dp))
        if (!women) {
            Hairline(Modifier.padding(horizontal = 14.dp))
            Column(Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
                Text("Who can join", style = Pc.type.label.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink2)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("verified" to "Verified travellers", "anyone" to "Anyone").forEach { (k, l) -> PcChip(l, vm.audience == k, { vm.audience = k }) }
                }
            }
        }
    }
    Field("Meeting point · only approved members see it") { InlineInput(vm.meetingPoint, { vm.meetingPoint = it }, "Majnu ka Tilla bus stand, 21:30", 120) }
    Field("About the plan") { InlineInput(vm.body, { vm.body = it }, "Volvo up, two nights in Kalga, easy pace. Looking for…", 1500, singleLine = false, style = Pc.type.body.copy(fontSize = 14.sp)) }
    Column(Modifier.fillMaxWidth().fieldBox()) { PhotoStrip(vm.photos, onAdd = onPhotos, onRemove = { vm.photos.remove(it) }) }
}

@Composable
private fun PhotoStrip(photos: List<Uri>, onAdd: () -> Unit, onRemove: (Uri) -> Unit) {
    val c = Pc.colors
    Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text("Photos · ${photos.size}/6", style = Pc.type.label.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink2)
        Spacer(Modifier.height(8.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            photos.forEachIndexed { i, u ->
                Box(Modifier.size(84.dp).clip(RoundedCornerShape(16.dp))) {
                    AsyncImage(u, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    if (i == 0) Text("COVER", style = Pc.type.code.copy(fontSize = 7.5.sp), color = c.raised, modifier = Modifier.padding(5.dp).clip(CircleShape).background(c.ink).padding(horizontal = 6.dp, vertical = 2.dp))
                    Box(Modifier.align(Alignment.TopEnd).size(28.dp).clickable(onClickLabel = "Remove photo") { onRemove(u) }, contentAlignment = Alignment.Center) {
                        Box(Modifier.size(22.dp).clip(CircleShape).background(c.scrim), contentAlignment = Alignment.Center) { PcIcon(PcIcons.Close, null, tint = Color.White, size = 13.dp) }
                    }
                }
            }
            if (photos.size < 6) Column(Modifier.size(84.dp).pencilledCard(radius = 16.dp).clickable(role = Role.Button, onClickLabel = "Add photos", onClick = onAdd), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                PcIcon(PcIcons.Camera, null, size = 20.dp, tint = c.ink)
                Text("Add photos", style = Pc.type.label, color = c.ink2)
            }
        }
    }
}

@Composable
private fun StoryForm(vm: ComposeViewModel, onPhotos: () -> Unit) {
    val c = Pc.colors
    val past by vm.pastTrips.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxWidth().fieldBox()) { PhotoStrip(vm.photos, onAdd = onPhotos, onRemove = { vm.photos.remove(it) }) }
    Field("Title") { InlineInput(vm.title, { vm.title = it }, "Rafting, Ganga aarti and 9 new friends", 90) }
    Column(Modifier.fillMaxWidth().fieldBox().padding(horizontal = 14.dp, vertical = 10.dp)) {
        Text("Which trip?", style = Pc.type.label.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink2)
        Spacer(Modifier.height(8.dp))
        if (past.isEmpty()) Text("No past UnSOLO trips yet. Tag a place instead.", style = Pc.type.small, color = c.ink2)
        past.forEach { b ->
            val sel = vm.trip?.id == b.trip.id
            val shape = RoundedCornerShape(16.dp)
            Row(Modifier.padding(bottom = 8.dp).fillMaxWidth().clip(shape).background(if (sel) c.tonal else c.raised).border(if (sel) 2.dp else 1.dp, if (sel) c.ink else c.rule, shape)
                .clickable { vm.trip = if (sel) null else b.trip; vm.tagged.clear() }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                ProgressiveImage(b.trip.image, Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)))
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(b.trip.title, style = Pc.type.bodyStrong.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink)
                    Text("Went · ${Fmt.dayMonth(b.travelDate)} · ${b.trip.host?.name.orEmpty()}", style = Pc.type.small, color = c.ink2)
                }
                if (sel) PcIcon(PcIcons.CheckCircleFilled, "Selected", size = 22.dp, tint = c.ink)
            }
        }
        if (vm.trip == null) { Spacer(Modifier.height(4.dp)); BoxedInput(vm.place, { vm.place = it.take(80) }, "Or a place", leadingIcon = PcIcons.Pin) }
    }
    vm.trip?.let { t ->
        Column(Modifier.fillMaxWidth().fieldBox().padding(horizontal = 14.dp, vertical = 10.dp)) {
            Text("Who went with you", style = Pc.type.label.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink2)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                t.goingFaces.forEach { u ->
                    val on = u in vm.tagged
                    Column(Modifier.clip(RoundedCornerShape(12.dp)).clickable(role = Role.Checkbox, onClickLabel = if (on) "Untag ${u.firstName}" else "Tag ${u.firstName}") { if (on) vm.tagged.remove(u) else vm.tagged.add(u) }.padding(4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(Modifier.size(50.dp).clip(CircleShape).border(2.dp, if (on) c.ink else Color.Transparent, CircleShape).padding(3.dp)) {
                            Avatar(u, 44.dp, Modifier.alpha(if (on) 1f else 0.55f))
                            if (on) Box(Modifier.align(Alignment.BottomEnd).size(18.dp).clip(CircleShape).background(c.ink), contentAlignment = Alignment.Center) { PcIcon(PcIcons.Check, null, tint = c.raised, size = 11.dp) }
                        }
                        Text(u.firstName, style = Pc.type.label, color = if (on) c.ink else c.ink2)
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Text("Tagged people are asked first. Faces show only for those who say yes.", style = Pc.type.small, color = c.ink2)
        }
        Column(Modifier.fillMaxWidth().fieldBox()) {
            SwitchRow("Show on the trip page", "Under \"From people who went\" on ${t.title}", vm.showOnTripPage, { vm.showOnTripPage = it })
        }
    }
    Field("Tell it") { InlineInput(vm.body, { vm.body = it }, "Day 1 we were 10 strangers on a Volvo…", 4000, singleLine = false, style = Pc.type.body.copy(fontSize = 14.sp)) }
}

@Composable
private fun AskForm(vm: ComposeViewModel, isPoll: Boolean) {
    val c = Pc.colors
    Field("Question") { InlineInput(vm.title, { vm.title = it }, if (isPoll) "Pickup point for the 27 Nov Bir trip?" else "Kasol solo in early December: which stay is better for meeting people?", 200, singleLine = false) }
    if (!isPoll) Column(Modifier.fillMaxWidth().fieldBox()) { SwitchRow("Add a poll", "2–4 options, open for 3 days", vm.pollOn, { vm.pollOn = it }) }
    if (vm.pollOn) {
        vm.pollOptions.forEachIndexed { i, o ->
            Row(Modifier.fillMaxWidth().fieldBox().padding(start = 14.dp, end = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f).padding(vertical = 12.dp)) {
                    InlineInput(o, { vm.pollOptions[i] = it }, if (i < 2) "Option ${i + 1}" else "Option ${i + 1} (optional)", 60, style = Pc.type.body.copy(fontSize = 13.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold))
                }
                if (vm.pollOptions.size > 2) IconTap(PcIcons.Close, "Remove option ${i + 1}", { vm.pollOptions.removeAt(i) }, tint = c.ink3, iconSize = 18.dp)
            }
        }
        if (vm.pollOptions.size < 4) Row(Modifier.clip(CircleShape).clickable(role = Role.Button) { vm.pollOptions.add("") }.defaultMinSize(minHeight = 44.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            PcIcon(PcIcons.PlusCircle, null, size = 20.dp, tint = c.accentInk)
            Spacer(Modifier.width(6.dp))
            Text("Add option", style = Pc.type.bodyStrong.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, fontSize = 12.sp), color = c.accentInk)
        }
        Text("Polls stay open for 3 days. Everyone sees the results after voting.", style = Pc.type.small, color = c.ink2)
    }
    Field("Place") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PcIcon(PcIcons.PinFilled, null, size = 16.dp, tint = c.ink2); Spacer(Modifier.width(6.dp))
            InlineInput(vm.place, { vm.place = it }, "Kasol, Parvati Valley", 80)
        }
    }
    Field("Details (optional)") { InlineInput(vm.body, { vm.body = it }, "Dates, budget, what you care about", 1500, singleLine = false, style = Pc.type.body.copy(fontSize = 14.sp)) }
    Text("No links or prices in answers. Hosts answer as people, with their HOST tag.", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(horizontal = 4.dp))
}
