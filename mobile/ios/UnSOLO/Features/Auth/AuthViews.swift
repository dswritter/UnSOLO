import AuthenticationServices
import SwiftUI

/// Welcome: Email (password or 6-digit code) · Phone (SMS code) · browse as guest.
/// Sign in with Apple is shown but disabled until UnSOLO has an Apple developer ID.
struct WelcomeView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @State private var googleBusy = false
    @State private var googleError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Wordmark(height: 34).padding(.top, 12)
                    Text(router.authReason ?? "Find your people, then grab a spot.").pcFont(.display).foregroundStyle(Pc.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Browse freely. You'll need an account to post, join plans, message and book.").pcFont(.body).foregroundStyle(Pc.ink2)
                    HStack(spacing: 14) {
                        SeatRing(seats: [.taken(nil), .taken(nil), .taken(nil), .you(nil), .open, .open, .open, .open], size: 96, dots: .none,
                                 centreLabel: ("4", "open"))
                        Text("Every trip is a circle of people you can see into before you join.").pcFont(.small).foregroundStyle(Pc.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 6)
                    .accessibilityHidden(true)
                    Button { google() } label: {
                        HStack(spacing: 10) {
                            if googleBusy { ProgressView().tint(Pc.ink2) } else { GoogleMark() }
                            Text("Continue with Google")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.pc(.outline, fullWidth: true))
                    .disabled(googleBusy)
                    if let googleError { Text(googleError).pcFont(.small).foregroundStyle(Pc.red) }
                    NavigationLink { PhoneAuthView(onDone: finish) } label: {
                        Label("Continue with phone number", systemImage: "iphone").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.pc(.primary, fullWidth: true))
                    NavigationLink { EmailAuthView(onDone: finish) } label: {
                        Label("Continue with email", systemImage: "envelope").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.pc(.outline, fullWidth: true))
                    VStack(alignment: .leading, spacing: 6) {
                        SignInWithAppleButton(.continue) { _ in } onCompletion: { _ in }
                            .signInWithAppleButtonStyle(.black)
                            .frame(height: PcTokens.buttonTall)
                            .clipShape(Capsule())
                            .disabled(true)
                            .opacity(0.35)
                        Text("Sign in with Apple arrives with the TestFlight build (needs UnSOLO's Apple developer ID).")
                            .pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                    Button("Browse as guest") { dismiss() }.buttonStyle(.pcLink).frame(maxWidth: .infinity)
                    if app.isDemo {
                        Text("Demo mode: any email + 6-character password works, and every code is 123456.")
                            .pcFont(.small).foregroundStyle(Pc.goldInk).padding(10).background(Pc.goldBg, in: Pc.shape(Pc.radius))
                    }
                    Text("By continuing you agree to the Terms and the Refund policy. UnSOLO is for travellers 18+.")
                        .pcFont(.small).foregroundStyle(Pc.ink2)
                }
                .padding(16)
            }
            .pcScreen()
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Not now") { dismiss() }.tint(Pc.ink) } }
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
            if app.session.isPhoneVerified || !router.gateNeedsPhone {
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
                        field("6-digit code") { OTPField(code: $code) }
                        Button(busy ? "Checking…" : "Verify") { run { try await session.verifyEmailCode(email: email, code: code) } }
                            .buttonStyle(.pc(.primary, fullWidth: true)).disabled(busy || code.count != 6)
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

    private func sendCode() {
        run(finishOnSuccess: false) {
            try await session.sendEmailCode(email)
            codeSent = true
            info = "We sent a 6-digit code to \(email)."
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

struct PhoneAuthView: View {
    let onDone: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(AppModel.self) private var app
    @State private var phone = ""
    @State private var code = ""
    @State private var sent = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Phone").pcFont(.display).foregroundStyle(Pc.ink)
                Text("We'll text you a 6-digit code. Your number is never shown to other travellers.").pcFont(.body).foregroundStyle(Pc.ink2)
                PhoneField(phone: $phone)
                if sent {
                    OTPField(code: $code)
                    Button(busy ? "Checking…" : "Verify and continue") {
                        run { try await session.verifyPhoneCode(phone: e164, code: code); onDone() }
                    }
                    .buttonStyle(.pc(.primary, fullWidth: true)).disabled(busy || code.count != 6)
                } else {
                    Button(busy ? "Sending…" : "Send code") {
                        run { try await session.sendPhoneCode(e164); sent = true }
                    }
                    .buttonStyle(.pc(.primary, fullWidth: true)).disabled(busy || phone.count != 10)
                }
                if app.isDemo && sent { Text("Demo code: 123456").pcFont(.num).foregroundStyle(Pc.goldInk) }
                if let error { Text(error).pcFont(.small).foregroundStyle(Pc.red) }
            }
            .padding(16)
        }
        .pcScreen()
        .navigationBarTitleDisplayMode(.inline)
    }

    private var e164: String { "+91" + phone }

    private func run(_ work: @escaping () async throws -> Void) {
        busy = true
        error = nil
        Task {
            do { try await work() } catch { self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription }
            busy = false
        }
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
                        OTPField(code: $code)
                        if let devCode { Text("Code (no SMS provider configured): \(devCode)").pcFont(.num).foregroundStyle(Pc.goldInk) }
                        Button(busy ? "Checking…" : "Verify") { verify() }
                            .buttonStyle(.pc(.primary, fullWidth: true)).disabled(busy || code.count != 6)
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

struct OTPField: View {
    @Binding var code: String
    var body: some View {
        TextField("6-digit code", text: $code)
            .keyboardType(.numberPad)
            .textContentType(.oneTimeCode)
            .font(.system(size: 21, weight: .semibold, design: .monospaced))
            .tracking(8)
            .padding(.horizontal, 12)
            .frame(minHeight: 56)
            .pcField()
            .onChange(of: code) { _, v in
                let digits = String(v.filter(\.isNumber).prefix(6))
                if digits != v { code = digits }
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
