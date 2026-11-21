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
import com.unsolo.app.core.net.userMessage
import com.unsolo.app.ui.components.*
import com.unsolo.app.ui.nav.AppNav
import androidx.compose.ui.draw.clip
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

    val e164: String get() = "+91" + phone.filter { it.isDigit() }.takeLast(10)
    val emailOk get() = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$").matches(email.trim())
    val phoneOk get() = phone.filter { it.isDigit() }.length == 10 && phone.filter { it.isDigit() }.first() in "6789"

    private fun run(block: suspend () -> ApiResult<Unit>, onOk: () -> Unit = {}) {
        if (busy) return
        busy = true; error = null
        viewModelScope.launch {
            when (val r = block()) {
                is ApiResult.Ok -> onOk()
                is ApiResult.Err -> error = r.message ?: r.userMessage()
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

    fun submitPhone(done: () -> Unit) =
        if (!codeSent) run({ g.account.sendPhoneCode(e164) }) { codeSent = true; info = "We sent a code to $e164." + if (DemoMode.enabled) " Demo: any 6 digits work." else "" }
        else run({ g.account.verifyPhoneCode(e164, code) }, done)

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
    val done = { nav.back() }
    val oauth by nav.graph.oauthResult.collectAsStateWithLifecycle()
    LaunchedEffect(oauth) {
        when (val r = oauth) {
            is ApiResult.Ok -> { nav.graph.oauthResult.value = null; done() }
            is ApiResult.Err -> { vm.error = r.message ?: r.userMessage(); vm.busy = false; nav.graph.oauthResult.value = null }
            else -> Unit
        }
    }
    Column(Modifier.fillMaxSize().background(c.paper)) {
        DetailTopBar(when (vm.step) { "email" -> "Continue with email"; "phone" -> "Continue with phone"; else -> null }, headerActions = false, onBack = {
            if (vm.step == "welcome") nav.back() else { vm.step = "welcome"; vm.codeSent = false; vm.code = ""; vm.error = null; vm.info = null }
        })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Gutter, vertical = 16.dp)) {
            when (vm.step) {
                "welcome" -> {
                    Wordmark()
                    Spacer(Modifier.height(20.dp))
                    Text("Meet your people before you go.", style = Pc.type.display, color = c.ink)
                    Spacer(Modifier.height(8.dp))
                    Text("Browse trips and the Tribe freely. An account lets you grab a spot, post and join plans.", style = Pc.type.body, color = c.ink2)
                    Spacer(Modifier.height(20.dp))
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        // Three travellers in, your gold seat drawing in, the rest open: take your place.
                        SeatRing(total = 8, taken = 3, size = 144.dp, you = YouSeat.You,
                            people = listOf(UserLite("h", name = "Tent It"), UserLite("a", name = "Ananya Singh"), UserLite("r", name = "Rohan Mehra")),
                            spotsLabel = true, contentDescription = "A circle of 8 spots: 3 taken, yours, and 4 open")
                    }
                    Spacer(Modifier.height(28.dp))
                    val activity = androidx.compose.ui.platform.LocalContext.current
                    PcButton("Continue with Google", { vm.google(activity, { nav.openAuthUrl(it) }, done) }, Modifier.fillMaxWidth(), enabled = !vm.busy,
                        leading = { androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(com.unsolo.app.R.drawable.ic_google), null, Modifier.size(20.dp).clip(androidx.compose.foundation.shape.CircleShape).background(androidx.compose.ui.graphics.Color.White).padding(2.dp)) })
                    Spacer(Modifier.height(10.dp))
                    PcButton("Continue with phone number", { vm.step = "phone" }, Modifier.fillMaxWidth(), kind = BtnKind.Outline, icon = PcIcons.Phone)
                    Spacer(Modifier.height(10.dp))
                    PcButton("Continue with email", { vm.step = "email" }, Modifier.fillMaxWidth(), kind = BtnKind.Outline, icon = PcIcons.Mail)
                    Messages(vm)
                    if (DemoMode.enabled) {
                        Spacer(Modifier.height(10.dp))
                        PcButton("Use the demo traveller", { vm.demo(done) }, Modifier.fillMaxWidth(), kind = BtnKind.Outline, dashed = true, enabled = !vm.busy)
                    }
                    Spacer(Modifier.height(10.dp))
                    PcButton("Keep browsing as a guest", done, Modifier.fillMaxWidth(), kind = BtnKind.Ghost)
                    Spacer(Modifier.height(12.dp))
                    Text("By continuing you agree to the Terms and the Refund policy. You must be 18 or older.", style = Pc.type.small, color = c.ink2)
                }
                "email" -> {
                    Segmented(listOf("password" to "Password", "code" to "Email code"), vm.emailMode, { vm.emailMode = it; vm.codeSent = false; vm.error = null }, Modifier.requiredWidth(androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp.dp))
                    Spacer(Modifier.height(16.dp))
                    Label("Email")
                    BoxedInput(vm.email, { vm.email = it.take(120) }, "you@example.com", keyboardType = KeyboardType.Email)
                    if (vm.emailMode == "password") {
                        Spacer(Modifier.height(12.dp))
                        Label("Password")
                        PasswordInput(vm.password) { vm.password = it.take(72) }
                        Spacer(Modifier.height(8.dp))
                        Row {
                            LinkText(if (vm.createAccount) "I have an account" else "Create an account", { vm.createAccount = !vm.createAccount }, style = Pc.type.smallStrong)
                            Spacer(Modifier.weight(1f))
                            if (!vm.createAccount) LinkText("Forgot password?", { vm.forgot() }, style = Pc.type.smallStrong)
                        }
                    } else if (vm.codeSent) {
                        Spacer(Modifier.height(12.dp))
                        Label("6-digit code")
                        BoxedInput(vm.code, { vm.code = it.filter(Char::isDigit).take(6) }, "••••••", keyboardType = KeyboardType.NumberPassword, style = Pc.type.numLarge)
                    }
                    Messages(vm)
                    Spacer(Modifier.height(16.dp))
                    val label = when { vm.emailMode == "password" && vm.createAccount -> "Create account"; vm.emailMode == "password" -> "Sign in"; !vm.codeSent -> "Send code"; else -> "Verify" }
                    val ok = vm.emailOk && when { vm.emailMode == "password" -> vm.password.length >= 6; vm.codeSent -> vm.code.length == 6; else -> true }
                    PcButton(label, { vm.submitEmail(done) }, Modifier.fillMaxWidth(), enabled = ok && !vm.busy)
                }
                "phone" -> {
                    Label("Mobile number")
                    Row {
                        Text("+91", style = Pc.type.num, color = c.ink, modifier = Modifier.padding(top = 14.dp, end = 10.dp))
                        BoxedInput(vm.phone, { vm.phone = it.filter(Char::isDigit).take(10) }, "98XXXXXXXX", Modifier.weight(1f), keyboardType = KeyboardType.Phone, style = Pc.type.num)
                    }
                    if (vm.codeSent) {
                        Spacer(Modifier.height(12.dp))
                        Label("6-digit code")
                        BoxedInput(vm.code, { vm.code = it.filter(Char::isDigit).take(6) }, "••••••", keyboardType = KeyboardType.NumberPassword, style = Pc.type.numLarge)
                    }
                    Messages(vm)
                    Spacer(Modifier.height(16.dp))
                    PcButton(if (vm.codeSent) "Verify" else "Send code", { vm.submitPhone(done) }, Modifier.fillMaxWidth(),
                        enabled = !vm.busy && vm.phoneOk && (!vm.codeSent || vm.code.length == 6))
                    Spacer(Modifier.height(8.dp))
                    Text("Phone sign-in also verifies your number, which you need to post and join plans.", style = Pc.type.small, color = c.ink2)
                }
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
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    val e164 get() = "+91" + phone.filter { it.isDigit() }.takeLast(10)

    fun start() { busy = true; error = null; viewModelScope.launch {
        when (val r = g.account.startPhoneVerification(e164)) {
            is ApiResult.Ok -> { sent = true; devCode = r.value.devCode }
            is ApiResult.Err -> error = r.userMessage()
            ApiResult.Offline -> error = "You're offline."
        }
        busy = false
    } }

    fun verify(done: () -> Unit) { busy = true; error = null; viewModelScope.launch {
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
                BoxedInput(vm.code, { vm.code = it.filter(Char::isDigit).take(6) }, "6-digit code", keyboardType = KeyboardType.NumberPassword, style = Pc.type.numLarge)
                vm.devCode?.let { Text("Development code: $it (no SMS provider configured)", style = Pc.type.small, color = c.goldInk, modifier = Modifier.padding(top = 6.dp)) }
            }
            vm.error?.let { Text(it, style = Pc.type.smallStrong, color = c.red, modifier = Modifier.padding(top = 10.dp)) }
            Spacer(Modifier.height(16.dp))
            if (!vm.sent) PcButton("Send code", { vm.start() }, Modifier.fillMaxWidth(), enabled = !vm.busy && vm.phone.length == 10)
            else PcButton("Verify", { vm.verify { nav.back() } }, Modifier.fillMaxWidth(), enabled = !vm.busy && vm.code.length == 6)
        }
    }
}
