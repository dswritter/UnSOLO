package com.unsolo.app.ui.profile

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.animation.core.animateFloat
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.unsolo.app.core.model.*
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.net.apiCall
import com.unsolo.app.data.AppEvent
import com.unsolo.app.data.MoneyFormat
import com.unsolo.app.ui.Fmt
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import com.unsolo.app.ui.nav.Routes
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID

private val longFmt = java.time.format.DateTimeFormatter.ofPattern("d MMM yyyy")
private fun longDate(s: String?) = Fmt.date(s)?.format(longFmt) ?: s.orEmpty()

@Composable
private fun LoadingBlock(modifier: Modifier) {
    val a by androidx.compose.animation.core.rememberInfiniteTransition(label = "ld").animateFloat(0.45f, 1f,
        androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(800), androidx.compose.animation.core.RepeatMode.Reverse), label = "a")
    Box(modifier.clip(RoundedCornerShape(16.dp)).background(Pc.colors.tonal.copy(alpha = a)))
}

// ---------------- Edit profile ----------------

/**
 * Everything the web's Edit profile has: photo, name, username (once every 40 days), bio, status,
 * location, Instagram, website, birthday, and what others can see. Save stays off until something
 * changes; leaving with changes asks first.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditProfileScreen(nav: AppNav) {
    val g = nav.graph
    val c = Pc.colors
    val me by g.account.me.collectAsStateWithLifecycle()
    val u = me?.user
    val scope = rememberCoroutineScope()
    if (u == null) {
        Column(Modifier.fillMaxSize().background(c.paper)) {
            DetailTopBar("Edit profile", onBack = { nav.back() })
            EmptyState("Sign in to edit your profile", "Your photo, name, bio and links live on your UnSOLO account.", action = "Sign in") { nav.requireSignIn() }
        }
        return
    }

    var name by rememberSaveable { mutableStateOf(u.name) }
    var username by rememberSaveable { mutableStateOf(u.username) }
    var bio by rememberSaveable { mutableStateOf(u.bio.orEmpty()) }
    var status by rememberSaveable { mutableStateOf(u.statusText.orEmpty()) }
    var statusFollowers by rememberSaveable { mutableStateOf(u.statusVisibility == "followers") }
    var location by rememberSaveable { mutableStateOf(u.location.orEmpty()) }
    var instagram by rememberSaveable { mutableStateOf(u.instagram.orEmpty()) }
    var website by rememberSaveable { mutableStateOf(u.website.orEmpty()) }
    var dob by rememberSaveable { mutableStateOf(u.dateOfBirth.orEmpty()) }
    var tripsPrivate by rememberSaveable { mutableStateOf(u.tripsPrivate) }
    var statesPrivate by rememberSaveable { mutableStateOf(u.statesPrivate) }
    var phonePublic by rememberSaveable { mutableStateOf(u.phonePublic) }
    var avatarUrl by rememberSaveable { mutableStateOf(u.avatarUrl) }
    var uploading by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<Pair<String?, String>?>(null) } // field to message
    var confirmLeave by remember { mutableStateOf(false) }
    var pickDate by remember { mutableStateOf(false) }

    val patch = PatchMeRequest(
        name = name.trim().takeIf { it != u.name },
        username = username.trim().takeIf { it != u.username },
        bio = bio.trim().takeIf { it != u.bio.orEmpty() },
        statusText = status.trim().takeIf { it != u.statusText.orEmpty() },
        statusVisibility = (if (statusFollowers) "followers" else "public").takeIf { it != (u.statusVisibility ?: "public") },
        location = location.trim().takeIf { it != u.location.orEmpty() },
        instagram = instagram.trim().takeIf { it != u.instagram.orEmpty() },
        website = website.trim().takeIf { it != u.website.orEmpty() },
        dateOfBirth = dob.takeIf { it.isNotEmpty() && it != u.dateOfBirth.orEmpty() },
        avatarUrl = avatarUrl.takeIf { it != u.avatarUrl },
        tripsPrivate = tripsPrivate.takeIf { it != u.tripsPrivate },
        statesPrivate = statesPrivate.takeIf { it != u.statesPrivate },
        phonePublic = phonePublic.takeIf { it != u.phonePublic },
    )
    val dirty = patch != PatchMeRequest()
    val usernameLocked = u.usernameChangeAfter != null
    val haptics = LocalHapticFeedback.current

    fun save() {
        if (name.isBlank()) { error = "name" to "Add your name"; return }
        saving = true; error = null
        scope.launch {
            when (val r = g.account.saveProfile(patch)) {
                is ApiResult.Ok -> {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    g.events.emit(AppEvent.Message("Profile saved"))
                    g.tribe.refreshProfile(r.value.user.username)
                    nav.back()
                }
                is ApiResult.Err -> error = r.field to (r.message ?: "Couldn't save. Try again.")
                ApiResult.Offline -> error = null to "You're offline. Your changes are still here; save when you're connected."
            }
            saving = false
        }
    }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        uploading = true
        scope.launch {
            val out = File(g.app.cacheDir, "avatar_${UUID.randomUUID()}.jpg")
            val ok = runCatching { g.compressor.compress(uri, out) }.isSuccess
            if (!ok) { g.events.emit(AppEvent.Message("Couldn't read that photo. Try another.")); uploading = false; return@launch }
            val part = MultipartBody.Part.createFormData("file", out.name, out.asRequestBody("image/jpeg".toMediaType()))
            when (val r = apiCall { g.api.upload(part, "avatar".toRequestBody("text/plain".toMediaType())) }) {
                is ApiResult.Ok -> avatarUrl = r.value.url
                is ApiResult.Err -> g.events.emit(AppEvent.Message(r.message ?: "Couldn't upload that photo."))
                ApiResult.Offline -> g.events.emit(AppEvent.Message("You're offline."))
            }
            out.delete()
            uploading = false
        }
    }

    BackHandler(enabled = dirty && !saving) { confirmLeave = true }
    if (confirmLeave) AlertDialog(onDismissRequest = { confirmLeave = false },
        title = { Text("Discard changes?") }, text = { Text("Your edits haven't been saved.") },
        confirmButton = { TextButton({ confirmLeave = false; nav.back() }) { Text("Discard") } },
        dismissButton = { TextButton({ confirmLeave = false }) { Text("Keep editing") } })
    if (pickDate) {
        val initial = runCatching { LocalDate.parse(dob) }.getOrNull() ?: LocalDate.now().minusYears(25)
        val state = rememberDatePickerState(initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            yearRange = (LocalDate.now().year - 100)..(LocalDate.now().year - 18))
        DatePickerDialog(onDismissRequest = { pickDate = false },
            confirmButton = { TextButton({ state.selectedDateMillis?.let { dob = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }; pickDate = false }) { Text("Done") } },
            dismissButton = { TextButton({ pickDate = false }) { Text("Cancel") } }) { DatePicker(state) }
    }

    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Edit profile", onBack = { if (dirty) confirmLeave = true else nav.back() }, headerActions = false) {
            PcButton("Save", { save() }, kind = BtnKind.Accent, height = BtnSmall, enabled = dirty && !uploading, loading = saving)
            Spacer(Modifier.width(8.dp))
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).imePadding().padding(bottom = 32.dp)) {
            // Photo
            Column(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.clip(CircleShape).clickable(onClickLabel = "Change photo") { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                    Avatar(u.copy(avatarUrl = avatarUrl), 96.dp)
                    if (uploading) Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = 0.4f)), contentAlignment = Alignment.Center) {
                        androidx.compose.material3.CircularProgressIndicator(Modifier.size(28.dp), color = Color.White, strokeWidth = 2.5.dp)
                    }
                    Box(Modifier.align(Alignment.BottomEnd).size(30.dp).clip(CircleShape).background(c.paper).padding(2.dp).clip(CircleShape).background(c.ink), contentAlignment = Alignment.Center) {
                        PcIcon(PcIcons.Camera, null, tint = c.onInk, size = 16.dp)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(if (uploading) "Uploading…" else "Change photo", style = Pc.type.smallStrong, color = c.ink2)
            }
            error?.takeIf { it.first == null }?.let { ErrorNote(it.second) }

            FormGroup("About you") {
                Field("Name", error, "name") { BoxedInput(name, { name = it.take(80) }, "Your name", Modifier.fillMaxWidth()) }
                Field("Username", error, "username",
                    help = if (usernameLocked) "You can change it again on ${longDate(u.usernameChangeAfter)}." else "Letters, numbers and _. You can change it once every 40 days.") {
                    BoxedInput(username, { username = it.filter { ch -> ch.isLetterOrDigit() || ch == '_' }.take(30) }, "username", Modifier.fillMaxWidth(), leadingIcon = PcIcons.User)
                }
                Field("Bio", error, "bio", help = "${bio.length}/500") { BoxedInput(bio, { bio = it.take(500) }, "Where you've been, where you're headed, what you're like on a trip", Modifier.fillMaxWidth(), singleLine = false, minLines = 3) }
                Field("Status", error, "statusText", help = "Shows under your name for everyone, or just your followers.") {
                    BoxedInput(status, { status = it.take(140) }, "Off to Spiti next week", Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    Segmented(listOf("public" to "Everyone", "followers" to "Followers"), if (statusFollowers) "followers" else "public", { statusFollowers = it == "followers" })
                }
            }
            FormGroup("Details") {
                Field("Location", error, "location") { BoxedInput(location, { location = it.take(80) }, "City, state", Modifier.fillMaxWidth(), leadingIcon = PcIcons.Pin) }
                Field("Instagram", error, "instagram", help = "Just the username, no link needed.") { BoxedInput(instagram, { instagram = it.take(60) }, "yourhandle", Modifier.fillMaxWidth()) }
                Field("Website", error, "website") { BoxedInput(website, { website = it.take(200) }, "https://…", Modifier.fillMaxWidth(), keyboardType = KeyboardType.Uri) }
                Field("Date of birth", error, "dateOfBirth", help = "Not shown on your profile. Used for age-matched plans.") {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.raised).clickable { pickDate = true }.padding(horizontal = 14.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        PcIcon(PcIcons.Calendar, null, tint = c.ink2, size = 18.dp); Spacer(Modifier.width(10.dp))
                        Text(if (dob.isEmpty()) "Add your birthday" else longDate(dob), style = Pc.type.body, color = if (dob.isEmpty()) c.ink3 else c.ink)
                    }
                }
            }
            FormGroup("What others see", inset = false) {
                SwitchRow("Hide my trips", "Your travel log stays off your profile.", tripsPrivate, { tripsPrivate = it })
                SwitchRow("Hide states explored", "The India map on your profile is hidden.", statesPrivate, { statesPrivate = it })
                if (!u.phone.isNullOrBlank()) SwitchRow("Show my phone number", "Off: people ask and you approve each one.", phonePublic, { phonePublic = it })
            }
        }
    }
}

@Composable
private fun FormGroup(title: String, inset: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.padding(top = 8.dp)) {
        Text(title.uppercase(), style = Pc.type.label.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.sp), color = Pc.colors.ink3, modifier = Modifier.padding(horizontal = Gutter, vertical = 8.dp))
        Column(Modifier.padding(horizontal = if (inset) Gutter else 0.dp), verticalArrangement = Arrangement.spacedBy(if (inset) 14.dp else 0.dp), content = content)
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun Field(label: String, error: Pair<String?, String>?, key: String, help: String? = null, content: @Composable ColumnScope.() -> Unit) {
    val c = Pc.colors
    val err = error?.takeIf { it.first == key }?.second
    Column {
        Text(label, style = Pc.type.smallStrong, color = c.ink, modifier = Modifier.padding(bottom = 6.dp))
        content()
        when {
            err != null -> Text(err, style = Pc.type.small, color = c.red, modifier = Modifier.padding(top = 4.dp))
            help != null -> Text(help, style = Pc.type.small, color = c.ink3, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun ErrorNote(text: String) {
    Text(text, style = Pc.type.small, color = Pc.colors.red, modifier = Modifier.padding(horizontal = Gutter, vertical = 6.dp).fillMaxWidth()
        .clip(RoundedCornerShape(12.dp)).background(Pc.colors.red.copy(alpha = 0.08f)).padding(12.dp))
}

// ---------------- Invite friends ----------------

/** Your invite code and link (copy, WhatsApp, share), credits earned, and who joined with it. */
@Composable
fun ReferralsScreen(nav: AppNav) {
    val c = Pc.colors
    var data by remember { mutableStateOf<ReferralsResponse?>(null) }
    var failed by remember { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }
    val clip = LocalClipboardManager.current
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(attempt) {
        failed = false
        when (val r = nav.graph.account.referrals()) { is ApiResult.Ok -> data = r.value; else -> failed = true }
    }
    val d = data
    val message = d?.link?.let { "Join me on UnSOLO, India's solo travel community. Sign up with my code ${d.code} and get ₹200 off your first trip: $it" }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Invite friends", onBack = { nav.back() })
        when {
            d == null && failed -> EmptyState("Couldn't load your invites", "Check your connection and try again.", action = "Try again") { attempt++ }
            d == null -> Column(Modifier.padding(Gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) { repeat(3) { LoadingBlock(Modifier.fillMaxWidth().height(if (it == 0) 150.dp else 70.dp)) } }
            else -> LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
                item {
                    Column(Modifier.padding(Gutter).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.goldBg).padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Give ₹200, get ₹200", style = Pc.type.title1, color = c.ink)
                        Text("Friends get ₹200 off their first trip. You get ₹200 in credits when they travel.", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(top = 4.dp))
                        Spacer(Modifier.height(16.dp))
                        if (d.code != null) {
                            Row(Modifier.clip(RoundedCornerShape(14.dp)).background(c.paper).clickable(onClickLabel = "Copy code") {
                                clip.setText(AnnotatedString(d.code)); haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                nav.graph.events.emit(AppEvent.Message("Code copied"))
                            }.padding(horizontal = 18.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(d.code, style = Pc.type.num.copy(fontSize = 24.sp, letterSpacing = 3.sp), color = c.ink)
                                Spacer(Modifier.width(10.dp)); Text("Copy", style = Pc.type.smallStrong, color = c.goldInk)
                            }
                            Spacer(Modifier.height(14.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                PcButton("WhatsApp", { nav.openUrl("https://wa.me/?text=" + Uri.encode(message)) }, Modifier.weight(1f), kind = BtnKind.Primary, icon = PcIcons.Chat)
                                PcButton("Share link", { message?.let(nav::share) }, Modifier.weight(1f), kind = BtnKind.Outline, icon = PcIcons.Share)
                            }
                        } else Text("Your code is on its way. Check back in a bit.", style = Pc.type.body, color = c.ink2)
                    }
                }
                item {
                    Row(Modifier.padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile(MoneyFormat.rupees(d.creditsPaise), "Credits", Modifier.weight(1f))
                        StatTile("${d.total}", "Joined", Modifier.weight(1f))
                        StatTile("${d.credited}", "Travelled", Modifier.weight(1f))
                    }
                }
                item { SectionHeader("People you invited", Modifier.padding(top = 14.dp)) }
                if (d.people.isEmpty()) item { Text("No one yet. Your first invite is one message away.", style = Pc.type.body, color = c.ink2, modifier = Modifier.padding(horizontal = Gutter)) }
                items(d.people, key = { it.username }) { p ->
                    Row(Modifier.fillMaxWidth().clickable(enabled = p.username.isNotEmpty()) { nav.to(Routes.profile(p.username)) }.padding(horizontal = Gutter, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(UserLite(id = p.username, username = p.username, name = p.name, avatarUrl = p.avatarUrl), 40.dp); Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(p.name, style = Pc.type.bodyStrong, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("@${p.username}", style = Pc.type.small, color = c.ink2)
                        }
                        Tag(if (p.status == "credited") "Travelled" else "Joined", if (p.status == "credited") TagKind.Host else TagKind.Muted)
                    }
                }
            }
        }
    }
}

@Composable
private fun StatTile(value: String, label: String, modifier: Modifier = Modifier) {
    val c = Pc.colors
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(c.raised).padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = Pc.type.num.copy(fontSize = 20.sp), color = c.ink)
        Text(label, style = Pc.type.label, color = c.ink2)
    }
}

// ---------------- Offers ----------------

/** Live deals (same as unsolo.in/offers): promo codes to copy and combos that open the listings in the app. */
@Composable
fun OffersScreen(nav: AppNav) {
    val c = Pc.colors
    var data by remember { mutableStateOf<OffersResponse?>(null) }
    var failed by remember { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }
    val clip = LocalClipboardManager.current
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(attempt) { failed = false; when (val r = nav.graph.account.offers()) { is ApiResult.Ok -> data = r.value; else -> failed = true } }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Offers", onBack = { nav.back() })
        val d = data
        when {
            d == null && failed -> EmptyState("Couldn't load offers", "Check your connection and try again.", action = "Try again") { attempt++ }
            d == null -> Column(Modifier.padding(Gutter), verticalArrangement = Arrangement.spacedBy(12.dp)) { repeat(3) { LoadingBlock(Modifier.fillMaxWidth().height(96.dp)) } }
            d.sections.isEmpty() -> EmptyState("No live offers right now", "New deals show up here. Check back soon.", action = "Explore trips") { nav.tab(Routes.EXPLORE) }
            else -> LazyColumn(contentPadding = PaddingValues(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                d.sections.forEach { s ->
                    item(key = "h" + s.id) {
                        Column(Modifier.padding(start = Gutter, end = Gutter, top = 14.dp, bottom = 4.dp)) {
                            s.badge?.let { Text(it.uppercase(), style = Pc.type.label.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.sp), color = c.goldInk) }
                            Text(s.title, style = Pc.type.title2, color = c.ink)
                            s.subtitle?.let { Text(it, style = Pc.type.small, color = c.ink2) }
                        }
                    }
                    items(s.offers, key = { "o" + s.id + it.id }) { o ->
                        Row(Modifier.padding(horizontal = Gutter).fillMaxWidth().pencilledCard().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(o.label, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink)
                                Text(o.name, style = Pc.type.small, color = c.ink2)
                                o.validUntil?.let { Text("Till ${longDate(it)}", style = Pc.type.label, color = c.ink3, modifier = Modifier.padding(top = 2.dp)) }
                            }
                            o.promoCode?.let { code ->
                                Column(Modifier.clip(RoundedCornerShape(12.dp)).background(c.goldBg).clickable(onClickLabel = "Copy code $code") {
                                    clip.setText(AnnotatedString(code)); haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                    nav.graph.events.emit(AppEvent.Message("$code copied. Use it at checkout."))
                                }.padding(horizontal = 12.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(code, style = Pc.type.num, color = c.ink)
                                    Text("Tap to copy", style = Pc.type.label.copy(fontSize = 10.sp), color = c.goldInk)
                                }
                            }
                        }
                    }
                    items(s.combos, key = { "c" + s.id + it.id }) { cb ->
                        Column(Modifier.padding(horizontal = Gutter).fillMaxWidth().pencilledCard().padding(14.dp)) {
                            Text(cb.title, style = Pc.type.bodyStrong.copy(fontWeight = FontWeight.Bold), color = c.ink)
                            cb.subtitle?.let { Text(it, style = Pc.type.small, color = c.ink2) }
                            Spacer(Modifier.height(8.dp))
                            listOf(cb.primary, cb.secondary).filter { it.path.isNotEmpty() }.forEach { l ->
                                NavRow(l.label, null, PcIcons.ArrowRight, { nav.openPath(l.path) })
                            }
                        }
                    }
                }
            }
        }
    }
}
