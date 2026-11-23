package com.unsolo.app.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.unsolo.app.AppGraph
import com.unsolo.app.core.demo.DemoMode
import com.unsolo.app.core.model.Seat
import com.unsolo.app.core.model.SeatState
import com.unsolo.app.core.model.UserLite
import com.unsolo.app.core.net.ApiResult
import com.unsolo.app.core.auth.SMS_OTP_LENGTH
import com.unsolo.app.core.auth.SmsOtp
import com.unsolo.app.core.net.userMessage
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.shadow
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.animateFloat
import com.unsolo.app.ui.theme.PcTokens
import com.unsolo.app.ui.theme.Pc
import com.unsolo.app.ui.theme.PcIcons
import kotlinx.coroutines.launch

class AuthViewModel(private val g: AppGraph) : ViewModel() {
    var step by mutableStateOf("welcome") // welcome | email | phone
    var emailMode by mutableStateOf("password") // password | code
    var createAccount by mutableStateOf(false)
    var email by mutableStateOf("")
    var password by mutableStateOf("")
    var phone by mutableStateOf("")
    var code by mutableStateOf("")
    var codeSent by mutableStateOf(false)
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var info by mutableStateOf<String?>(null)
    /** Which button is working ("google", "phone", "email"), so only that one shows a spinner. */
    var pending by mutableStateOf<String?>(null)
    /** Signed in: the screen shows a short check before closing. */
    var success by mutableStateOf(false)
    /** Bumped on a wrong code so the boxes shake. */
    var shake by mutableIntStateOf(0)

    val e164: String get() = "+91" + phone.filter { it.isDigit() }.takeLast(10)
    val emailOk get() = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$").matches(email.trim())
    val phoneOk get() = phone.filter { it.isDigit() }.length == 10 && phone.filter { it.isDigit() }.first() in "6789"

    private fun run(block: suspend () -> ApiResult<Unit>, onOk: () -> Unit = {}) {
        if (busy) return
        busy = true; error = null
        viewModelScope.launch {
            when (val r = block()) {
                is ApiResult.Ok -> onOk()
                is ApiResult.Err -> { error = r.message ?: r.userMessage(); if (codeSent && r.status in 400..499) { code = ""; lastEmailTry = ""; shake++ } }
                ApiResult.Offline -> error = "You're offline. Check your connection."
            }
            busy = false
        }
    }

    fun submitEmail(done: () -> Unit) = when {
        emailMode == "password" && createAccount -> run({ g.account.signUp(email, password) }, done)
        emailMode == "password" -> run({ g.account.signInWithPassword(email, password) }, done)
        !codeSent -> run({ g.account.sendEmailCode(email) }) { codeSent = true; info = "We sent a 6-digit code to ${email.trim()}." }
        else -> run({ g.account.verifyEmailCode(email, code) }, done)
    }

    private var lastEmailTry = ""
    /** Typing, pasting or a keyboard suggestion that completes the 6 digits signs in straight away. */
    fun onEmailCode(v: String, done: () -> Unit) {
        code = v.filter(Char::isDigit).take(6)
        if (code.length == 6 && code != lastEmailTry && !busy) { lastEmailTry = code; submitEmail(done) }
    }

    // ---- Phone sign-in: POST /api/v1/auth/phone/start → challenge, then /verify with challenge + code ----
    val phoneFlow = com.unsolo.app.core.auth.PhoneSignInFlow()
    var phoneSent by mutableStateOf(false)
    var nowMs by mutableLongStateOf(System.currentTimeMillis())

    /** Send (or resend) a code; a resend replaces the challenge. */
    fun startPhone() {
        if (busy) return
        busy = true; error = null
        val digits = phoneFlow.normalized(phone)
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            when (val r = g.account.startPhoneSignIn(digits)) {
                is ApiResult.Ok -> {
                    phoneFlow.onStarted(digits, r.value.challenge, r.value.expiresIn, r.value.devCode, now)
                    phoneSent = true
                    val dev = r.value.devCode?.takeIf { com.unsolo.app.BuildConfig.DEBUG }
                    code = dev ?: ""
                    lastTried = ""
                    info = "We sent a $SMS_OTP_LENGTH-digit code to +91 $digits." + (dev?.let { " Test code: $it (debug build)." } ?: "")
                }
                is ApiResult.Err -> {
                    if (r.status == 429) phoneFlow.onRateLimited(r.retryAfterSec, now)
                    error = r.message ?: r.userMessage()
                }
                ApiResult.Offline -> error = "You're offline. Check your connection."
            }
            nowMs = System.currentTimeMillis()
            busy = false
        }
    }

    fun verifyPhone(done: () -> Unit) {
        val (challenge, digits) = phoneFlow.verifyBody(code) ?: return
        if (busy) return
        busy = true; error = null
        viewModelScope.launch {
            when (val r = g.account.verifyPhoneSignIn(challenge, digits)) {
                // is_new: there is no first-run (name) step in the app yet; new and returning users both land back where they were.
                is ApiResult.Ok -> done()
                is ApiResult.Err -> { error = r.message ?: r.userMessage(); if (r.status in 400..499) { code = ""; lastTried = ""; shake++ } }
                ApiResult.Offline -> error = "You're offline. Check your connection."
            }
            busy = false
        }
    }

    /** The code last sent for checking, so a wrong code isn't re-sent until it's edited. */
    private var lastTried = ""

    /** Any way the code gets complete (SMS consent, keyboard suggestion, paste, typing) signs in at once. */
    fun onPhoneCode(v: String, done: () -> Unit) {
        code = SmsOtp.filter(v)
        if (SmsOtp.isValid(code) && code != lastTried && !busy) { lastTried = code; verifyPhone(done) }
    }

    /** A number picked from the SIM hint sends the code at once: one tap instead of typing and a button. */
    fun onPhoneHint(raw: String) {
        val digits = raw.filter(Char::isDigit).takeLast(10)
        if (digits.length != 10) return
        phone = digits
        if (phoneOk && !phoneSent) startPhone()
    }

    fun changeNumber() { lastTried = ""; phoneFlow.reset(); phoneSent = false; code = ""; info = null; error = null }

    fun forgot() = run({ g.account.recover(email) }) { info = "If that email has an account, a reset link is on its way." }
    fun demo(done: () -> Unit) = run({ g.account.signInDemo() }, done)

    /**
     * Continue with Google: demo → demo traveller; Credential Manager when GOOGLE_WEB_CLIENT_ID is set;
     * otherwise (or when no Google account / Play services) Supabase OAuth in a Custom Tab with PKCE.
     */
    fun google(activity: android.content.Context, openAuthUrl: (String) -> Unit, done: () -> Unit) {
        if (busy) return
        if (DemoMode.enabled) { demo(done); return }
        busy = true; error = null
        viewModelScope.launch {
            when (val r = g.google.getIdToken(activity)) {
                is com.unsolo.app.core.auth.GoogleResult.Token -> {
                    when (val s = g.account.signInWithGoogleIdToken(r.idToken, r.rawNonce)) {
                        is ApiResult.Ok -> done()
                        is ApiResult.Err -> error = s.message ?: s.userMessage()
                        ApiResult.Offline -> error = "You're offline. Check your connection."
                    }
                }
                com.unsolo.app.core.auth.GoogleResult.Cancelled -> Unit
                is com.unsolo.app.core.auth.GoogleResult.Unavailable -> {
                    if (g.config.supabase().url.isBlank()) error = "Google sign-in isn't set up on this build yet."
                    else { info = "Finish signing in with Google in the browser."; openAuthUrl(g.account.startGoogleOAuth(g.pkce)) }
                }
            }
            busy = false
        }
    }
}

@Composable
fun AuthScreen(nav: AppNav) {
    val vm: AuthViewModel = viewModel { AuthViewModel(nav.graph) }
    val c = Pc.colors
    // Signed in: show the check for a beat, then go back to where the person was.
    val done: () -> Unit = { vm.success = true }
    LaunchedEffect(vm.success) { if (vm.success) { kotlinx.coroutines.delay(650); nav.back() } }
    val oauth by nav.graph.oauthResult.collectAsStateWithLifecycle()
    LaunchedEffect(oauth) {
        when (val r = oauth) {
            is ApiResult.Ok -> { nav.graph.oauthResult.value = null; done() }
            is ApiResult.Err -> { vm.error = r.message ?: r.userMessage(); vm.busy = false; vm.pending = null; nav.graph.oauthResult.value = null }
            else -> Unit
        }
    }
    val backToWelcome = { vm.step = "welcome"; vm.codeSent = false; vm.changeNumber(); vm.code = ""; vm.error = null; vm.info = null }
    androidx.activity.compose.BackHandler(enabled = vm.step != "welcome" && !vm.success) { backToWelcome() }

    val reduce = Pc.reduceMotion
    Box(Modifier.fillMaxSize().background(c.paper)) {
        Column(Modifier.fillMaxSize()) {
            DetailTopBar(null, headerActions = false, onBack = { if (vm.step == "welcome") nav.back() else backToWelcome() })
            androidx.compose.animation.AnimatedContent(
                targetState = vm.step, label = "auth-step", modifier = Modifier.weight(1f),
                transitionSpec = {
                    val fwd = targetState != "welcome"
                    val d = if (reduce) 0 else PcTokens.motionStandard
                    (androidx.compose.animation.slideInHorizontally(androidx.compose.animation.core.tween(d)) { w -> if (fwd) w / 5 else -w / 5 } + androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(d))) togetherWith
                        (androidx.compose.animation.slideOutHorizontally(androidx.compose.animation.core.tween(d)) { w -> if (fwd) -w / 5 else w / 5 } + androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(d / 2)))
                },
            ) { step ->
                when (step) {
                    "phone" -> PhoneStep(vm, done)
                    "email" -> EmailStep(vm, done)
                    else -> WelcomeStep(vm, nav, done)
                }
            }
        }
        SignedInOverlay(vm.success)
    }
}

/** Centred column that scrolls when the keyboard leaves too little room. */
@Composable
private fun CenteredStep(content: @Composable ColumnScope.() -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize().imePadding()) {
        Column(
            Modifier.fillMaxWidth().heightIn(min = maxHeight).verticalScroll(rememberScrollState()).padding(horizontal = Gutter, vertical = 16.dp),
            verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally, content = content,
        )
    }
}

@Composable
private fun StepTitle(title: String, sub: (@Composable () -> Unit)? = null) {
    Text(title, style = Pc.type.display, color = Pc.colors.ink, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    if (sub != null) { Spacer(Modifier.height(8.dp)); sub() }
    Spacer(Modifier.height(28.dp))
}

@Composable
private fun WelcomeStep(vm: AuthViewModel, nav: AppNav, done: () -> Unit) {
    val c = Pc.colors
    val activity = androidx.compose.ui.platform.LocalContext.current
    val center = androidx.compose.ui.text.style.TextAlign.Center
    Column(Modifier.fillMaxSize()) {
        // Top: why sign in. Scrolls on small screens; the actions below never move.
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = Gutter),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Spacer(Modifier.height(8.dp))
            Wordmark()
            Spacer(Modifier.height(20.dp))
            // Three travellers in, your gold seat drawing in, the rest open: take your place.
            SeatRing(total = 8, taken = 3, size = 156.dp, you = YouSeat.You,
                people = listOf(UserLite("h", name = "Tent It"), UserLite("a", name = "Ananya Singh"), UserLite("r", name = "Rohan Mehra")),
                spotsLabel = true, contentDescription = "A circle of 8 spots: 3 taken, yours, and 4 open")
            Spacer(Modifier.height(22.dp))
            Text("Meet your people\nbefore you go.", style = Pc.type.display.copy(fontSize = 32.sp, lineHeight = 36.sp), color = c.ink, textAlign = center)
            Spacer(Modifier.height(10.dp))
            Text("See who's going, save your seat, chat with your group and share stories from the road.", style = Pc.type.body, color = c.ink2, textAlign = center)
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Verified travellers", "Group chats", "Safe trips").forEach {
                    Text(it, style = Pc.type.label, color = c.ink, modifier = Modifier.clip(CircleShape).background(c.tonal).padding(horizontal = 10.dp, vertical = 6.dp))
                }
            }
            Spacer(Modifier.height(16.dp))
        }
        // Bottom: the actions, where your thumb is.
        Column(Modifier.fillMaxWidth().shadow(18.dp, RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp), clip = false)
            .clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(c.raised)
            .navigationBarsPadding().padding(start = Gutter, end = Gutter, top = 20.dp, bottom = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Join UnSOLO free", style = Pc.type.bodyStrong.copy(fontSize = 20.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold), color = c.ink)
            Text("Sign in or create an account in seconds", style = Pc.type.small, color = c.ink2, modifier = Modifier.padding(top = 2.dp, bottom = 14.dp))
            PcButton("Continue with Google", { vm.pending = "google"; vm.google(activity, { nav.openAuthUrl(it) }, done) }, Modifier.fillMaxWidth(),
                kind = BtnKind.Accent, height = 56.dp,
                enabled = !vm.busy || vm.pending == "google", loading = vm.busy && vm.pending == "google",
                leading = { androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(com.unsolo.app.R.drawable.ic_google), null, Modifier.size(22.dp).clip(CircleShape).background(androidx.compose.ui.graphics.Color.White).padding(2.dp)) })
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PcButton("Phone", { vm.error = null; vm.step = "phone" }, Modifier.weight(1f), kind = BtnKind.Outline, icon = PcIcons.Phone, enabled = !vm.busy)
                PcButton("Email", { vm.error = null; vm.step = "email" }, Modifier.weight(1f), kind = BtnKind.Outline, icon = PcIcons.Mail, enabled = !vm.busy)
            }
            vm.error?.let { Text(it, style = Pc.type.smallStrong, color = c.red, textAlign = center, modifier = Modifier.padding(top = 12.dp)) }
            if (DemoMode.enabled) {
                Spacer(Modifier.height(10.dp))
                PcButton("Use the demo traveller", { vm.demo(done) }, Modifier.fillMaxWidth(), kind = BtnKind.Outline, dashed = true, enabled = !vm.busy)
            }
            Spacer(Modifier.height(4.dp))
            PcButton("Not now", { nav.back() }, kind = BtnKind.Ghost)
            Text("By continuing you agree to the Terms and Refund policy. 18+ only.", style = Pc.type.label, color = c.ink3, textAlign = center)
        }
    }
}

@Composable
private fun PhoneStep(vm: AuthViewModel, done: () -> Unit) {
    val c = Pc.colors
    val reduce = Pc.reduceMotion
    PhoneNumberHint(enabled = !vm.phoneSent && vm.phone.isEmpty()) { vm.pending = "phone"; vm.onPhoneHint(it) }
    CenteredStep {
        androidx.compose.animation.AnimatedContent(vm.phoneSent, label = "phone-sent", transitionSpec = {
            val d = if (reduce) 0 else PcTokens.motionStandard
            (androidx.compose.animation.slideInVertically(androidx.compose.animation.core.tween(d)) { it / 6 } + androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(d))) togetherWith androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(d / 2))
        }) { sent ->
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                if (!sent) {
                    StepTitle("Your mobile number") { Text("We'll text you a $SMS_OTP_LENGTH-digit code.", style = Pc.type.body, color = c.ink2) }
                    PhoneField(vm.phone, { vm.phone = it.filter(Char::isDigit).take(10); vm.error = null }, onDone = { if (vm.phoneOk) { vm.pending = "phone"; vm.startPhone() } })
                    Spacer(Modifier.height(20.dp))
                    PcButton("Send code", { vm.pending = "phone"; vm.startPhone() }, Modifier.fillMaxWidth(), kind = BtnKind.Accent,
                        enabled = vm.phoneOk, loading = vm.busy)
                } else {
                    StepTitle("Enter the code") {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Sent to +91 ${vm.phoneFlow.phone}", style = Pc.type.body, color = c.ink2)
                            LinkText("  Edit", { vm.changeNumber() }, style = Pc.type.body)
                        }
                    }
                    LaunchedEffect(vm.phoneFlow.challenge) { while (true) { vm.nowMs = System.currentTimeMillis(); kotlinx.coroutines.delay(1000) } }
                    SmsCodeAutofill(active = true, restartKey = vm.phoneFlow.challenge) { vm.onPhoneCode(it, done) }
                    OtpBoxes(vm.code, SMS_OTP_LENGTH, { vm.onPhoneCode(it, done) }, error = vm.error != null, shakeKey = vm.shake, enabled = !vm.busy)
                    Spacer(Modifier.height(22.dp))
                    CodeStatus(vm, resendIn = vm.phoneFlow.resendInSec(vm.nowMs).toInt(), onResend = { vm.startPhone() })
                }
                if (!sent) vm.error?.let { Text(it, style = Pc.type.smallStrong, color = c.red, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 12.dp)) }
            }
        }
    }
}

/** Under the code boxes, one line at a time: signing in, the error, or resend. */
@Composable
private fun CodeStatus(vm: AuthViewModel, resendIn: Int, onResend: (() -> Unit)?) {
    val c = Pc.colors
    val state = when { vm.busy || vm.success -> "busy"; vm.error != null -> "error"; else -> "idle" }
    androidx.compose.animation.AnimatedContent(state, label = "code-status", modifier = Modifier.heightIn(min = 44.dp),
        transitionSpec = { androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(PcTokens.motionFast)) togetherWith androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(PcTokens.motionFast)) }) { s ->
        when (s) {
            "busy" -> Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.heightIn(min = 44.dp)) {
                androidx.compose.material3.CircularProgressIndicator(Modifier.size(16.dp), color = c.pine, strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp)); Text("Signing you in", style = Pc.type.bodyStrong, color = c.ink)
            }
            "error" -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(vm.error ?: "", style = Pc.type.smallStrong, color = c.red, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                if (onResend != null && resendIn <= 0) LinkText("Send a new code", onResend, style = Pc.type.smallStrong)
            }
            else -> if (onResend == null) Spacer(Modifier.height(44.dp))
                else if (resendIn > 0) Text("Resend in 0:%02d".format(resendIn), style = Pc.type.small, color = c.ink3, modifier = Modifier.padding(top = 12.dp))
                else LinkText("Resend code", onResend, style = Pc.type.smallStrong)
        }
    }
}

@Composable
private fun EmailStep(vm: AuthViewModel, done: () -> Unit) {
    val c = Pc.colors
    CenteredStep {
        if (vm.emailMode == "code" && vm.codeSent) {
            StepTitle("Check your email") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(vm.email.trim(), style = Pc.type.body, color = c.ink2, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    LinkText("  Edit", { vm.codeSent = false; vm.code = ""; vm.error = null }, style = Pc.type.body)
                }
            }
            OtpBoxes(vm.code, 6, { vm.onEmailCode(it, done) }, error = vm.error != null, shakeKey = vm.shake, enabled = !vm.busy)
            Spacer(Modifier.height(22.dp))
            CodeStatus(vm, resendIn = 0, onResend = null)
            return@CenteredStep
        }
        StepTitle(if (vm.emailMode == "password" && vm.createAccount) "Create your account" else "Sign in with email")
        Segmented(listOf("password" to "Password", "code" to "Email me a code"), vm.emailMode, { vm.emailMode = it; vm.codeSent = false; vm.error = null }, Modifier.fillMaxWidth())
        Spacer(Modifier.height(16.dp))
        BoxedInput(vm.email, { vm.email = it.take(120) }, "you@example.com", keyboardType = KeyboardType.Email, leadingIcon = PcIcons.Mail)
        if (vm.emailMode == "password") {
            Spacer(Modifier.height(10.dp))
            PasswordInput(vm.password) { vm.password = it.take(72) }
            Row(Modifier.fillMaxWidth()) {
                LinkText(if (vm.createAccount) "I have an account" else "Create an account", { vm.createAccount = !vm.createAccount }, style = Pc.type.smallStrong)
                Spacer(Modifier.weight(1f))
                if (!vm.createAccount) LinkText("Forgot password?", { vm.forgot() }, style = Pc.type.smallStrong)
            }
        } else Spacer(Modifier.height(12.dp))
        vm.info?.takeIf { vm.emailMode == "password" }?.let { Text(it, style = Pc.type.small, color = c.ink2, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(bottom = 8.dp)) }
        vm.error?.let { Text(it, style = Pc.type.smallStrong, color = c.red, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(bottom = 8.dp)) }
        Spacer(Modifier.height(8.dp))
        val label = when { vm.emailMode == "password" && vm.createAccount -> "Create account"; vm.emailMode == "password" -> "Sign in"; else -> "Send code" }
        val ok = vm.emailOk && (vm.emailMode != "password" || vm.password.length >= 6)
        PcButton(label, { vm.pending = "email"; vm.submitEmail(done) }, Modifier.fillMaxWidth(), enabled = ok, loading = vm.busy)
    }
}

/** +91 and a large number field, keyboard up on arrival. */
@Composable
private fun PhoneField(value: String, onValue: (String) -> Unit, onDone: () -> Unit) {
    val c = Pc.colors
    val focus = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(Unit) { kotlinx.coroutines.delay(250); runCatching { focus.requestFocus() } }
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp)
    Row(Modifier.fillMaxWidth().height(64.dp).clip(shape).background(c.raised).border(1.5.dp, c.ink, shape).padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("+91", style = Pc.type.numLarge, color = c.ink2)
        Box(Modifier.padding(horizontal = 14.dp).width(1.dp).height(28.dp).background(c.rule))
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (value.isEmpty()) Text("98765 43210", style = Pc.type.numLarge, color = c.ink3)
            androidx.compose.foundation.text.BasicTextField(value, onValue, singleLine = true, textStyle = Pc.type.numLarge.copy(color = c.ink),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = androidx.compose.ui.text.input.ImeAction.Done),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { onDone() }),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(c.ink), modifier = Modifier.fillMaxWidth().focusRequester(focus))
        }
    }
}

/**
 * One box per digit over a single hidden field (so paste, keyboard suggestions and autofill all work).
 * Digits pop in, the next box carries the caret, and [shakeKey] changing shakes the row.
 */
@Composable
private fun OtpBoxes(value: String, length: Int, onValue: (String) -> Unit, error: Boolean, shakeKey: Int, enabled: Boolean) {
    val c = Pc.colors
    val reduce = Pc.reduceMotion
    val focus = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(Unit) { kotlinx.coroutines.delay(250); runCatching { focus.requestFocus() } }
    val shake = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(shakeKey) {
        if (shakeKey > 0 && !reduce) for (x in listOf(14f, -11f, 8f, -5f, 2f, 0f)) shake.animateTo(x, androidx.compose.animation.core.tween(45))
    }
    val caret = androidx.compose.animation.core.rememberInfiniteTransition(label = "caret")
    val caretAlpha by caret.animateFloat(1f, 0f, androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(520), androidx.compose.animation.core.RepeatMode.Reverse), label = "caret-a")
    val boxW = if (length <= 4) 60.dp else 46.dp
    androidx.compose.foundation.text.BasicTextField(
        value, { onValue(it.filter(Char::isDigit).take(length)) }, enabled = enabled, singleLine = true,
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.focusRequester(focus).smsOtpContentType(),
        decorationBox = { _ ->
            Row(Modifier.offset { androidx.compose.ui.unit.IntOffset(shake.value.dp.roundToPx(), 0) }, horizontalArrangement = Arrangement.spacedBy(if (length <= 4) 12.dp else 8.dp)) {
                repeat(length) { i ->
                    val ch = value.getOrNull(i)
                    val active = enabled && i == value.length
                    val shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp)
                    val border by androidx.compose.animation.animateColorAsState(when { error -> c.red; active -> c.ink; ch != null -> c.ink2; else -> c.rule }, label = "otp-b")
                    Box(Modifier.size(boxW, 64.dp).clip(shape).background(if (ch != null) c.raised else c.tonal).border(if (active || error) 2.dp else 1.dp, border, shape), contentAlignment = Alignment.Center) {
                        androidx.compose.animation.AnimatedContent(ch, label = "otp-d", transitionSpec = {
                            (androidx.compose.animation.scaleIn(androidx.compose.animation.core.spring(0.55f, 700f), initialScale = if (reduce) 1f else 0.4f) + androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(90))) togetherWith androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(60))
                        }) { d -> if (d != null) Text(d.toString(), style = Pc.type.numLarge.copy(fontSize = 26.sp), color = c.ink) }
                        if (active && ch == null) Box(Modifier.width(2.dp).height(26.dp).graphicsLayer { alpha = if (reduce) 1f else caretAlpha }.background(c.ink))
                    }
                }
            }
        },
    )
}

/** "You're in": a check that pops in over the screen just before it closes. */
@Composable
private fun SignedInOverlay(show: Boolean) {
    val c = Pc.colors
    androidx.compose.animation.AnimatedVisibility(show, enter = androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(160)), exit = androidx.compose.animation.fadeOut()) {
        Box(Modifier.fillMaxSize().background(c.paper.copy(alpha = 0.96f)).clickable(enabled = false) {}, contentAlignment = Alignment.Center) {
            val reduce = Pc.reduceMotion
            val s = remember { androidx.compose.animation.core.Animatable(if (reduce) 1f else 0.3f) }
            LaunchedEffect(Unit) { s.animateTo(1f, androidx.compose.animation.core.spring(0.5f, 500f)) }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(76.dp).graphicsLayer { scaleX = s.value; scaleY = s.value }.clip(androidx.compose.foundation.shape.CircleShape).background(c.pine), contentAlignment = Alignment.Center) {
                    PcIcon(PcIcons.Check, null, tint = c.onPine, size = 36.dp)
                }
                Spacer(Modifier.height(16.dp))
                Text("You're in", style = Pc.type.title1, color = c.ink)
            }
        }
    }
}

@Composable private fun Label(t: String) { Text(t, style = Pc.type.small, color = Pc.colors.ink2, modifier = Modifier.padding(bottom = 6.dp)) }

@Composable
private fun Messages(vm: AuthViewModel) {
    vm.info?.let { Text(it, style = Pc.type.small, color = Pc.colors.ink2, modifier = Modifier.padding(top = 10.dp)) }
    vm.error?.let { Text(it, style = Pc.type.smallStrong, color = Pc.colors.red, modifier = Modifier.padding(top = 10.dp)) }
}

@Composable
private fun PasswordInput(value: String, onValue: (String) -> Unit) {
    val c = Pc.colors
    androidx.compose.foundation.layout.Box(Modifier.fillMaxWidth().defaultMinSize(minHeight = 52.dp).background(tonal(), androidx.compose.foundation.shape.RoundedCornerShape(com.unsolo.app.ui.theme.PcTokens.radiusButton))
        .padding(horizontal = 16.dp, vertical = 14.dp)) {
        if (value.isEmpty()) Text("At least 6 characters", style = Pc.type.body, color = c.ink3)
        androidx.compose.foundation.text.BasicTextField(value, onValue, singleLine = true, textStyle = Pc.type.body.copy(color = c.ink),
            visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Password),
            cursorBrush = androidx.compose.ui.graphics.SolidColor(c.ink), modifier = Modifier.fillMaxWidth())
    }
}

// ---------------- Phone verification for an existing account ----------------

class PhoneViewModel(private val g: AppGraph) : ViewModel() {
    var phone by mutableStateOf(g.account.me.value?.user?.phone?.removePrefix("+91") ?: "")
    var code by mutableStateOf("")
    var sent by mutableStateOf(false)
    var devCode by mutableStateOf<String?>(null)
    var sendCount by mutableIntStateOf(0)
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    val e164 get() = "+91" + phone.filter { it.isDigit() }.takeLast(10)

    fun start() { busy = true; error = null; viewModelScope.launch {
        when (val r = g.account.startPhoneVerification(e164)) {
            is ApiResult.Ok -> { sent = true; sendCount++; devCode = r.value.devCode }
            is ApiResult.Err -> error = r.userMessage()
            ApiResult.Offline -> error = "You're offline."
        }
        busy = false
    } }

    private var lastTried = ""
    fun onCode(v: String, done: () -> Unit) {
        code = SmsOtp.filter(v)
        if (SmsOtp.isValid(code) && code != lastTried && !busy) { lastTried = code; verify(done) }
    }

    fun verify(done: () -> Unit) { if (busy || !SmsOtp.isValid(code)) return; busy = true; error = null; viewModelScope.launch {
        when (val r = g.account.verifyPhone(e164, code)) {
            is ApiResult.Ok -> if (r.value.verified) done() else error = "That code didn't match."
            is ApiResult.Err -> error = r.message ?: r.userMessage()
            ApiResult.Offline -> error = "You're offline."
        }
        busy = false
    } }
}

@Composable
fun PhoneVerifyScreen(nav: AppNav) {
    if (!nav.graph.account.isSignedIn.value) { LaunchedEffect(Unit) { nav.to(com.unsolo.app.ui.nav.Routes.AUTH) }; return }
    val vm: PhoneViewModel = viewModel { PhoneViewModel(nav.graph) }
    val c = Pc.colors
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar("Verify your phone", onBack = { nav.back() }, headerActions = false)
        Column(Modifier.padding(16.dp)) {
            Text("One quick step before you post or join", style = Pc.type.title2, color = c.ink)
            Spacer(Modifier.height(6.dp))
            Text("A verified phone keeps the Tribe real. Your number is never shown to other travellers.", style = Pc.type.body, color = c.ink2)
            Spacer(Modifier.height(16.dp))
            Row {
                Text("+91", style = Pc.type.num, color = c.ink, modifier = Modifier.padding(top = 14.dp, end = 10.dp))
                BoxedInput(vm.phone, { vm.phone = it.filter(Char::isDigit).take(10) }, "98XXXXXXXX", Modifier.weight(1f), keyboardType = KeyboardType.Phone, style = Pc.type.num)
            }
            if (vm.sent) {
                Spacer(Modifier.height(12.dp))
                SmsCodeAutofill(active = true, restartKey = vm.sendCount) { vm.onCode(it) { nav.back() } }
                BoxedInput(vm.code, { vm.onCode(it) { nav.back() } }, "4-digit code", Modifier.smsOtpContentType(), keyboardType = KeyboardType.NumberPassword, style = Pc.type.numLarge)
                vm.devCode?.let { Text("Development code: $it (no SMS provider configured)", style = Pc.type.small, color = c.goldInk, modifier = Modifier.padding(top = 6.dp)) }
            }
            vm.error?.let { Text(it, style = Pc.type.smallStrong, color = c.red, modifier = Modifier.padding(top = 10.dp)) }
            Spacer(Modifier.height(16.dp))
            if (!vm.sent) PcButton("Send code", { vm.start() }, Modifier.fillMaxWidth(), enabled = !vm.busy && vm.phone.length == 10)
            else PcButton("Verify", { vm.verify { nav.back() } }, Modifier.fillMaxWidth(), enabled = !vm.busy && SmsOtp.isValid(vm.code))
        }
    }
}

/**
 * Signed out on a tab that needs an account (You, Bookings, chats): why it's worth it up top,
 * the sign-in button down where your thumb is.
 */
@Composable
fun SignInInvite(nav: AppNav, title: String = "Your trips start here", body: String = "Sign in to join trips and plans, chat with your group and share stories.", footer: (@Composable ColumnScope.() -> Unit)? = null) {
    val c = Pc.colors
    val center = androidx.compose.ui.text.style.TextAlign.Center
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = Gutter),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            SeatRing(total = 8, taken = 3, size = 150.dp, you = YouSeat.You,
                people = listOf(UserLite("h", name = "Tent It"), UserLite("a", name = "Ananya Singh"), UserLite("r", name = "Rohan Mehra")),
                spotsLabel = true, contentDescription = "A circle of 8 spots: 3 taken, yours, and 4 open")
            Spacer(Modifier.height(22.dp))
            Text(title, style = Pc.type.display.copy(fontSize = 28.sp, lineHeight = 32.sp), color = c.ink, textAlign = center)
            Spacer(Modifier.height(8.dp))
            Text(body, style = Pc.type.body, color = c.ink2, textAlign = center)
            Spacer(Modifier.height(18.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(PcIcons.User to "See who's going before you book", PcIcons.Chat to "Chat with your trip group", PcIcons.Camera to "Share stories from the road").forEach { (ic, t) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(30.dp).clip(CircleShape).background(c.tonal), contentAlignment = Alignment.Center) { PcIcon(ic, null, tint = c.ink, size = 16.dp) }
                        Spacer(Modifier.width(10.dp))
                        Text(t, style = Pc.type.bodyStrong, color = c.ink)
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
        Column(Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter, bottom = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            PcButton("Sign in or create account", { nav.to(com.unsolo.app.ui.nav.Routes.AUTH) }, Modifier.fillMaxWidth(), kind = BtnKind.Accent, height = 56.dp)
            Text("Free · Google, phone or email · takes a minute", style = Pc.type.label, color = c.ink3, modifier = Modifier.padding(top = 8.dp))
            footer?.invoke(this)
        }
    }
}
