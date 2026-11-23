import SwiftUI

/// Sign in: an illustration and why up top, a raised panel at the bottom with Google (big, gold), Phone, Email,
/// Not now and the terms. Sign in with Apple joins once UnSOLO has an Apple developer ID.
struct WelcomeView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @State private var googleBusy = false
    @State private var googleError: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: 14) {
                        Wordmark(height: 30).padding(.top, 8)
                        SignInRing(size: 150).padding(.vertical, 6)
                        Text(router.authReason ?? "Meet your people\nbefore you go.")
                            .font(.system(size: 32, weight: .heavy, design: .rounded)).foregroundStyle(Pc.ink)
                            .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                        Text("See who's going, save your seat, chat with your group and share stories from the road.")
                            .pcFont(.body).foregroundStyle(Pc.ink2).multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 6) {
                            ForEach(["Verified travellers", "Group chats", "Safe trips"], id: \.self) { t in
                                Text(t).font(.system(size: 12, weight: .semibold)).foregroundStyle(Pc.ink)
                                    .padding(.horizontal, 10).padding(.vertical, 6).background(Capsule().fill(Pc.tonal))
                                    .lineLimit(1).minimumScaleFactor(0.85)
                            }
                        }
                        if app.isDemo {
                            Text("Demo mode: any email + 6-character password works. Email codes are 123456 and SMS codes are 1234.")
                                .pcFont(.small).foregroundStyle(Pc.goldInk).padding(10).background(Pc.goldBg, in: Pc.shape(Pc.radius))
                        }
                    }
                    .padding(.horizontal, 20).padding(.bottom, 16)
                    .frame(maxWidth: .infinity)
                }
                panel
            }
            .pcScreen()
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    /// The raised panel at the bottom, within thumb reach.
    private var panel: some View {
        VStack(spacing: 10) {
            VStack(spacing: 2) {
                Text("Join UnSOLO free").font(.system(size: 20, weight: .heavy)).foregroundStyle(Pc.ink)
                Text("Sign in or create an account in seconds").pcFont(.small).foregroundStyle(Pc.ink2)
            }
            .padding(.bottom, 4)
            Button { google() } label: {
                HStack(spacing: 10) {
                    if googleBusy { ProgressView().tint(Pc.onPine) } else { GoogleMark() }
                    Text("Continue with Google").font(.system(size: 16, weight: .bold))
                }
                .frame(maxWidth: .infinity, minHeight: 56)
            }
            .buttonStyle(.pc(.accent, fullWidth: true))
            .disabled(googleBusy)
            HStack(spacing: 10) {
                NavigationLink { PhoneAuthView(onDone: finish) } label: {
                    Label("Phone", systemImage: "iphone").frame(maxWidth: .infinity)
                }
                .buttonStyle(.pc(.outline, fullWidth: true))
                NavigationLink { EmailAuthView(onDone: finish) } label: {
                    Label("Email", systemImage: "envelope").frame(maxWidth: .infinity)
                }
                .buttonStyle(.pc(.outline, fullWidth: true))
            }
            .disabled(googleBusy)
            if let googleError { Text(googleError).pcFont(.small).foregroundStyle(Pc.red).multilineTextAlignment(.center) }
            Button("Not now") { dismiss() }.buttonStyle(.pcLink)
            Text("By continuing you agree to the Terms and Refund policy. 18+ only.")
                .font(.system(size: 11)).foregroundStyle(Pc.ink2).multilineTextAlignment(.center)
        }
        .padding(.horizontal, 20).padding(.top, 20).padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: PcTokens.radiusSheet, topTrailingRadius: PcTokens.radiusSheet)
                .fill(Pc.raised)
                .shadow(color: .black.opacity(0.12), radius: 16, y: -4)
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private func google() {
        googleBusy = true
        googleError = nil
        Task {
            do {
                try await session.signInWithGoogle()
                finish()
            } catch is CancellationError {
                // User closed the sheet.
            } catch {
                googleError = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
            googleBusy = false
        }
    }

    private func finish() {
        dismiss()
        router.authReason = nil
        Task {
            try? await Task.sleep(for: .milliseconds(400))
            if app.session.canParticipate || !router.gateNeedsPhone {
                app.runAfterGate()
            } else {
                router.phoneSheet = true
            }
        }
    }
}

struct EmailAuthView: View {
    enum Mode: Hashable { case password, code }
    let onDone: () -> Void
    @Environment(SessionStore.self) private var session
    @State private var mode: Mode = .password
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var codeSent = false
    @State private var busy = false
    @State private var error: String?
    @State private var info: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Email").pcFont(.display).foregroundStyle(Pc.ink)
                PcSegmented(items: [(.password, "Password"), (.code, "Email code")], selection: $mode)
                field("Email") {
                    TextField("you@example.com", text: $email).keyboardType(.emailAddress).textContentType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                }
                if mode == .password {
                    field("Password") { SecureField("At least 6 characters", text: $password).textContentType(.password) }
                    Button(busy ? "Signing in…" : "Sign in") { run { try await session.signIn(email: email, password: password) } }
                        .buttonStyle(.pc(.primary, fullWidth: true)).disabled(busy || !validEmail || password.count < 6)
                    Button("Create account") { run { try await session.signUp(email: email, password: password) } }
                        .buttonStyle(.pc(.outline, fullWidth: true)).disabled(busy || !validEmail || password.count < 6)
                    Button("Forgot password?") {
                        Task {
                            try? await session.resetPassword(email)
                            info = "If that email has an account, a reset link is on its way."
                        }
                    }
                    .buttonStyle(.pcLink).disabled(!validEmail)
                } else {
                    if codeSent {
                        field("\(emailOtpLength)-digit code") { OTPField(code: $code, length: emailOtpLength, busy: busy) { verifyEmail() } }
                        Button(busy ? "Checking…" : "Verify") { verifyEmail() }
                            .buttonStyle(.pc(.primary, fullWidth: true)).disabled(busy || code.count != emailOtpLength)
                        Button("Send a new code") { sendCode() }.buttonStyle(.pcLink)
                    } else {
                        Button(busy ? "Sending…" : "Send code") { sendCode() }
                            .buttonStyle(.pc(.primary, fullWidth: true)).disabled(busy || !validEmail)
                    }
                }
                if let error { Text(error).pcFont(.small).foregroundStyle(Pc.red) }
                if let info { Text(info).pcFont(.small).foregroundStyle(Pc.ink2) }
            }
            .padding(16)
        }
        .pcScreen()
        .navigationBarTitleDisplayMode(.inline)
    }

    private var validEmail: Bool { email.range(of: #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#, options: .regularExpression) != nil }

    private func verifyEmail() {
        let c = code
        run { try await session.verifyEmailCode(email: email, code: c) }
    }

    private func sendCode() {
        run(finishOnSuccess: false) {
            try await session.sendEmailCode(email)
            codeSent = true
            info = "We sent a \(emailOtpLength)-digit code to \(email)."
            code = ""
        }
    }

    private func run(finishOnSuccess: Bool = true, _ work: @escaping () async throws -> Void) {
        busy = true
        error = nil
        Task {
            do {
                try await work()
                if finishOnSuccess { onDone() }
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
            busy = false
        }
    }
}

/// Phone sign-in through UnSOLO's own endpoints (2factor.in SMS): start → challenge, verify(challenge, code) → session.
/// "Change number" and "Resend" replace the challenge. Resend waits for `Retry-After` (30 s by default).
struct PhoneAuthView: View {
    let onDone: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(AppModel.self) private var app
    @State private var flow = PhoneSignInFlow()
    @State private var phone = ""
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    @State private var now = Date()

    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Phone").pcFont(.display).foregroundStyle(Pc.ink)
                Text("We'll text you a \(smsOtpLength)-digit code. Your number is never shown to other travellers.").pcFont(.body).foregroundStyle(Pc.ink2)
                PhoneField(phone: $phone)
                    .disabled(flow.challenge != nil)
                    .opacity(flow.challenge != nil ? 0.6 : 1)
                if flow.challenge != nil {
                    OTPField(code: $code, length: smsOtpLength, busy: busy) { verify() }
                    #if DEBUG
                    if let dev = flow.devCode { Text("Code (no SMS provider on this server): \(dev)").pcFont(.num).foregroundStyle(Pc.goldInk) }
                    #endif
                    Button(busy ? "Checking…" : "Verify and continue") { verify() }
                        .buttonStyle(.pc(.accent, fullWidth: true)).disabled(busy || code.count != smsOtpLength)
                    HStack {
                        Button("Change number") { flow.reset(); code = ""; error = nil }.buttonStyle(.pcLink)
                        Spacer()
                        let wait = flow.secondsUntilResend(now: now)
                        Button(wait > 0 ? "Resend in \(wait)s" : "Resend code") { start() }
                            .buttonStyle(.pcLink).disabled(busy || wait > 0)
                    }
                } else {
                    Button(busy ? "Sending…" : "Send code") { start() }
                        .buttonStyle(.pc(.accent, fullWidth: true)).disabled(busy || phone.count != 10 || flow.secondsUntilResend(now: now) > 0)
                }
                if let error { Text(error).pcFont(.small).foregroundStyle(Pc.red).fixedSize(horizontal: false, vertical: true) }
            }
            .padding(16)
        }
        .pcScreen()
        .navigationBarTitleDisplayMode(.inline)
        .onReceive(ticker) { now = $0 }
    }

    private func start() {
        busy = true
        error = nil
        Task {
            do {
                let r = try await session.startPhoneSignIn(phone)
                flow.started(r, at: Date())
                code = ""
                #if DEBUG
                if let dev = r.devCode { code = dev }
                #endif
            } catch let e as PhoneAuthError {
                error = e.message
                if let wait = e.retryAfter { flow.blockResend(for: wait, from: Date()) }
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
            busy = false
        }
    }

    private func verify() {
        guard let challenge = flow.challenge else { return }
        busy = true
        error = nil
        Task {
            do {
                // `is_new`: there is no separate first-run step on iOS yet; new and returning users continue the same way.
                _ = try await session.verifyPhoneSignIn(challenge: challenge, code: code)
                onDone()
            } catch let e as PhoneAuthError {
                error = e.message
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
            busy = false
        }
    }
}

/// The phone sign-in state the view keeps: the current challenge and the resend timer.
struct PhoneSignInFlow: Equatable {
    private(set) var challenge: String?
    private(set) var devCode: String?
    private(set) var resendAt: Date?
    static let defaultResend: TimeInterval = 30

    /// A new start (first send or resend) replaces the previous challenge.
    mutating func started(_ r: PhoneAuthStart, at date: Date) {
        challenge = r.challenge
        devCode = r.devCode
        resendAt = date.addingTimeInterval(Self.defaultResend)
    }

    mutating func blockResend(for seconds: TimeInterval, from date: Date) {
        resendAt = date.addingTimeInterval(seconds)
    }

    /// "Change number": forget the challenge so a new one is requested.
    mutating func reset() {
        challenge = nil
        devCode = nil
    }

    func secondsUntilResend(now: Date) -> Int {
        guard let resendAt else { return 0 }
        return max(0, Int(resendAt.timeIntervalSince(now).rounded(.up)))
    }
}

/// Phone verification for an existing account (needed to post, comment, react or join).
struct PhoneVerifyView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var phone = ""
    @State private var code = ""
    @State private var sent = false
    @State private var devCode: String?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Verify your phone").pcFont(.display).foregroundStyle(Pc.ink)
                    Text("Posting, joining plans and commenting need a verified number. It keeps the Tribe free of fake accounts, and it's never shown to anyone.")
                        .pcFont(.body).foregroundStyle(Pc.ink2)
                    PhoneField(phone: $phone)
                    if sent {
                        OTPField(code: $code, length: smsOtpLength, busy: busy) { verify() }
                        if let devCode { Text("Code (no SMS provider configured): \(devCode)").pcFont(.num).foregroundStyle(Pc.goldInk) }
                        Button(busy ? "Checking…" : "Verify") { verify() }
                            .buttonStyle(.pc(.primary, fullWidth: true)).disabled(busy || code.count != smsOtpLength)
                    } else {
                        Button(busy ? "Sending…" : "Send code") { start() }
                            .buttonStyle(.pc(.primary, fullWidth: true)).disabled(busy || phone.count != 10)
                    }
                    if let error { Text(error).pcFont(.small).foregroundStyle(Pc.red) }
                }
                .padding(16)
            }
            .pcScreen()
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Not now") { router.afterGate = nil; dismiss() }.tint(Pc.ink) } }
        }
    }

    private func start() {
        busy = true
        error = nil
        Task {
            do {
                devCode = try await session.startPhoneVerification("+91" + phone)
                code = ""
                sent = true
            } catch { self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription }
            busy = false
        }
    }

    private func verify() {
        busy = true
        error = nil
        Task {
            do {
                try await session.verifyPhone("+91" + phone, code: code)
                dismiss()
                try? await Task.sleep(for: .milliseconds(300))
                app.runAfterGate()
            } catch { self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription }
            busy = false
        }
    }
}

struct PhoneField: View {
    @Binding var phone: String
    var body: some View {
        HStack(spacing: 10) {
            Text("+91").pcFont(.num).foregroundStyle(Pc.ink)
            HairlineRule(color: Pc.rule2, vertical: true).frame(height: 24)
            TextField("98765 43210", text: $phone)
                .keyboardType(.numberPad)
                .textContentType(.telephoneNumber)
                .pcFont(.num)
                .onChange(of: phone) { _, v in
                    let digits = String(v.filter(\.isNumber).prefix(10))
                    if digits != v { phone = digits }
                }
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 52)
        .pcField()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Mobile number, India")
    }
}

/// SMS codes (phone sign-in and phone verification) are 4 digits; email codes (from Supabase) stay 6.
let smsOtpLength = 4
let emailOtpLength = 6

/// Decides when a code field should submit by itself: once when the code reaches its length, never twice for the
/// same code (a failed code stays blocked until the user edits it), and never while a request is running.
struct OTPAutoSubmit: Equatable {
    let length: Int
    private(set) var lastSubmitted: String?

    init(length: Int) { self.length = length }

    mutating func shouldSubmit(code: String, busy: Bool) -> Bool {
        guard code.count == length, code.allSatisfy(\.isNumber) else {
            if code.count < length { lastSubmitted = nil } // edited or cleared: the same code may be tried again
            return false
        }
        guard !busy, code != lastSubmitted else { return false }
        lastSubmitted = code
        return true
    }

    static func digits(_ raw: String, length: Int) -> String { String(raw.filter(\.isNumber).prefix(length)) }
}

/// One-time-code field shared by the SMS and email screens. `.oneTimeCode` lets iOS offer the code from the incoming
/// Messages notification in the QuickType bar (no clipboard, no entitlements). Reaching `length` digits submits once.
struct OTPField: View {
    @Binding var code: String
    var length: Int = smsOtpLength
    var busy = false
    var onComplete: () -> Void = {}
    @State private var gate: OTPAutoSubmit

    init(code: Binding<String>, length: Int = smsOtpLength, busy: Bool = false, onComplete: @escaping () -> Void = {}) {
        _code = code
        self.length = length
        self.busy = busy
        self.onComplete = onComplete
        _gate = State(initialValue: OTPAutoSubmit(length: length))
    }

    var body: some View {
        TextField("\(length)-digit code", text: $code)
            .keyboardType(.numberPad)
            .textContentType(.oneTimeCode)
            .font(.system(size: 21, weight: .semibold, design: .monospaced))
            .tracking(8)
            .padding(.horizontal, 12)
            .frame(minHeight: 56)
            .pcField()
            .onChange(of: code) { _, v in
                let digits = OTPAutoSubmit.digits(v, length: length)
                if digits != v { code = digits; return }
                if gate.shouldSubmit(code: digits, busy: busy) { onComplete() }
            }
    }
}

private extension EmailAuthView {
    func field<C: View>(_ label: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).pcFont(.small).foregroundStyle(Pc.ink2)
            content()
                .pcFont(.body)
                .padding(.horizontal, 12)
                .frame(minHeight: 52)
                .pcField()
        }
    }
}

/// Simple "G" mark (no brand asset is bundled).
struct GoogleMark: View {
    var body: some View {
        Text("G")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(Color(red: 0.26, green: 0.52, blue: 0.96))
            .frame(width: 24, height: 24)
            .background(Circle().fill(.white))
            .accessibilityHidden(true)
    }
}

/// The seat ring used on the sign-in pages: three people in, your spot, four open.
struct SignInRing: View {
    var size: CGFloat = 150

    var body: some View {
        SeatRing(seats: [.taken(nil), .taken(nil), .taken(nil), .you(nil), .open, .open, .open, .open], size: size, dots: .none,
                 centreLabel: ("4", "open"))
            .accessibilityElement()
            .accessibilityLabel("A circle of 8 spots: 3 taken, yours, and 4 open")
    }
}

/// What a signed-out tab shows: why an account helps. Pair it with `.signInBar()` for the button within thumb reach.
struct SignInInvite: View {
    var title = "Your trips start here"
    var message = "Sign in to join trips and plans, chat with your group and share stories."

    var body: some View {
                VStack(spacing: 14) {
                    SignInRing(size: 140).padding(.top, 24).padding(.bottom, 4)
                    Text(title).font(.system(size: 28, weight: .heavy, design: .rounded)).foregroundStyle(Pc.ink)
                        .multilineTextAlignment(.center)
                        .accessibilityAddTraits(.isHeader)
                    Text(message).pcFont(.body).foregroundStyle(Pc.ink2).multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    VStack(alignment: .leading, spacing: 12) {
                        perk("person.2", "See who's going before you book")
                        perk("bubble.left.and.bubble.right", "Chat with your trip group")
                        perk("camera", "Share stories from the road")
                    }
                    .padding(.top, 8)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
                .frame(maxWidth: .infinity)
    }

    private func perk(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 16, weight: .semibold)).foregroundStyle(Pc.ink)
                .frame(width: 40, height: 40).background(Circle().fill(Pc.tonal))
            Text(text).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The big gold sign-in button anchored near the bottom of a signed-out screen.
private struct SignInBar: View {
    @Environment(Router.self) private var router

    var body: some View {
        VStack(spacing: 8) {
            Button { router.authSheet = true } label: {
                Text("Sign in or create account").font(.system(size: 16, weight: .bold)).frame(maxWidth: .infinity, minHeight: 56)
            }
            .buttonStyle(.pc(.accent, fullWidth: true))
            Text("Free · Google, phone or email · takes a minute").font(.system(size: 12)).foregroundStyle(Pc.ink2)
        }
        .padding(.horizontal, 20).padding(.top, 10).padding(.bottom, 12)
        .frame(maxWidth: .infinity)
        .background(Pc.paper)
    }
}

extension View {
    /// Adds the sign-in button at the bottom while `show` is true.
    func signInBar(_ show: Bool) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) { if show { SignInBar() } }
    }
}
