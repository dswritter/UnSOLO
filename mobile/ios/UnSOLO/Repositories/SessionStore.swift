import Foundation
import Observation

/// Signed-in user, preferences and auth flows.
@MainActor
@Observable
final class SessionStore: AppBound {
    @ObservationIgnored weak var app: AppModel?
    var isSignedIn = false
    var me: MeResponse?
    var preferences: Preferences = .defaults
    var unreadNotifications = 0
    var unreadMessages = 0

    var isPhoneVerified: Bool { me?.user.isPhoneVerified ?? false }
    /// Enough to post, comment, vote and join plans: a confirmed email or a verified phone.
    var canParticipate: Bool { me.map { $0.canParticipate ?? $0.user.isPhoneVerified } ?? false }
    var user: UserLite? { me?.user.lite }
    var initials: String { me?.user.lite.initials ?? "" }

    func bind(_ app: AppModel) {
        self.app = app
        app.outbox.register("prefs", OutboxHandler(success: { [weak self] _, data in
            if let p = try? JSON.decoder().decode(Preferences.self, from: data) { self?.applyPreferences(p, fromServer: true) }
        }))
        app.outbox.register("me.patch", OutboxHandler(success: { [weak self] _, data in
            if let me = try? JSON.decoder().decode(MeResponse.self, from: data) { self?.setMe(me) }
        }))
        app.outbox.register("device", OutboxHandler(success: { _, _ in }))
        app.outbox.register("landing.dismiss", OutboxHandler(success: { _, _ in }))
    }

    func loadCached() {
        if let me = app?.store.entry(MeResponse.self, "me") {
            self.me = me
            unreadNotifications = me.counts.unreadNotifications
            unreadMessages = me.counts.unreadMessages
        }
        if let prefs = app?.store.entry(Preferences.self, "prefs") { preferences = prefs }
    }

    func authChanged(_ signedIn: Bool) {
        // Any sign-out, not only the button (e.g. Auth rejected the refresh token): nothing of the account stays.
        if !signedIn, isSignedIn || me != nil {
            Task {
                await wipeLocal()
                await app?.tribe.refreshFeed(key: "all")
            }
        }
        isSignedIn = signedIn
    }

    func refreshMe() async {
        guard let app else { return }
        do {
            let me = try await app.api.me()
            setMe(me)
        } catch {
            // Never signs out here: only a refresh token Auth rejects does (AuthManager.refreshedToken).
        }
    }

    private func setMe(_ me: MeResponse) {
        self.me = me
        unreadNotifications = me.counts.unreadNotifications
        unreadMessages = me.counts.unreadMessages
        app?.store.setEntry("me", me, isPrivate: true)
        // Only adopt server preferences when nothing local is waiting to sync.
        if app?.outbox.item("prefs") == nil { applyPreferences(me.preferences, fromServer: true) }
    }

    private func applyPreferences(_ p: Preferences, fromServer: Bool) {
        preferences = p
        app?.store.setEntry("prefs", p, isPrivate: true)
        app?.landing.landingTab = p.landingTab
    }

    /// Optimistic: apply locally, then PUT the partial object through the outbox (coalesced).
    func updatePreferences(_ patch: PreferencesPatch, local: (inout Preferences) -> Void) {
        var p = preferences
        local(&p)
        applyPreferences(p, fromServer: false)
        guard isSignedIn, let app else { return }
        let full = PreferencesPatch(landingTab: p.landingTab, notify: p.notify, interests: p.interests, suggestByLocation: p.suggestByLocation,
                                    suggestByGender: p.suggestByGender, shareLocation: p.shareLocation, dataSaver: p.dataSaver)
        app.outbox.enqueue(kind: "prefs", method: .put, path: "/me/preferences", body: app.outbox.encodeBody(full), clientId: "prefs", coalesce: true)
        Task { await app.outbox.drain() }
    }

    func updateMe(_ patch: PatchMeBody, local: (inout MeUser) -> Void) {
        guard var me, let app else { return }
        local(&me.user)
        self.me = me
        app.store.setEntry("me", me, isPrivate: true)
        app.outbox.enqueue(kind: "me.patch", method: .patch, path: "/me", body: app.outbox.encodeBody(patch), clientId: "me.patch", coalesce: true)
        Task { await app.outbox.drain() }
    }

    /// PATCH /me with the extended profile fields, straight to the server (not queued: the editor waits for it).
    /// Returns nil on success, else the field the server rejected (if any) and a message to show.
    func saveProfileDetailed(_ patch: ProfilePatch) async -> (field: String?, message: String)? {
        guard let app else { return (nil, "Couldn't save. Try again.") }
        guard !patch.isEmpty else { return nil }
        do {
            let me = try await app.api.patchProfile(patch)
            setMe(me)
            return nil
        } catch APIError.offline {
            return (nil, "You're offline. Your changes are still here; save when you're connected.")
        } catch APIError.badRequest(let m, let field) {
            return (field, m ?? "Couldn't save. Try again.")
        } catch APIError.decoding {
            // Saved (2xx), just a reply shape we didn't expect: reload instead of saying it failed.
            await refreshMe()
            return nil
        } catch {
            return (nil, error.localizedDescription)
        }
    }

    func saveProfile(_ patch: ProfilePatch) async -> String? { await saveProfileDetailed(patch)?.message }

    // MARK: Auth flows (Supabase direct)

    func signIn(email: String, password: String) async throws {
        try await app?.auth.signIn(email: email, password: password)
        await didSignIn()
    }

    func signUp(email: String, password: String) async throws {
        try await app?.auth.signUp(email: email, password: password)
        await didSignIn()
    }

    func sendEmailCode(_ email: String) async throws { try await app?.auth.sendEmailCode(email) }

    func verifyEmailCode(email: String, code: String) async throws {
        try await app?.auth.verifyEmailCode(email: email, code: code)
        await didSignIn()
    }

    /// Phone sign-in step 1: `POST /api/v1/auth/phone/start` (2factor.in SMS). Returns the challenge to verify against.
    func startPhoneSignIn(_ phone: String) async throws -> PhoneAuthStart {
        guard let app else { throw APIError.offline }
        return try await app.api.authPhoneStart(phone)
    }

    /// Phone sign-in step 2: `POST /api/v1/auth/phone/verify` → a Supabase session, stored like every other sign-in
    /// (refresh stays on Supabase `/auth/v1/token?grant_type=refresh_token`). Returns `is_new`.
    @discardableResult
    func verifyPhoneSignIn(challenge: String, code: String) async throws -> Bool {
        guard let app else { throw APIError.offline }
        let r = try await app.api.authPhoneVerify(challenge: challenge, code: code)
        await app.auth.adopt(r.session)
        await didSignIn()
        return r.isNew
    }

    /// "Continue with Google": Supabase OAuth + PKCE in ASWebAuthenticationSession (no Google SDK).
    /// Tokens land in the Keychain like every other sign-in. Demo mode signs in the demo traveller.
    func signInWithGoogle() async throws {
        guard let app else { return }
        let verifier = PKCE.makeVerifier()
        let code: String
        if app.isDemo {
            code = "demo-google-code"
        } else {
            let supabase = await app.auth.supabaseURL
            guard let url = OAuth.authorizeURL(supabaseURL: supabase, challenge: PKCE.challenge(for: verifier)) else {
                throw APIError.transport("Sign-in isn't configured")
            }
            let callback = try await WebAuthenticator().authenticate(url: url, callbackScheme: OAuth.callbackScheme)
            switch OAuth.parseCallback(callback) {
            case .code(let c): code = c
            case .error(let message): throw APIError.badRequest(message, field: nil)
            case nil: throw APIError.transport("Unexpected sign-in response")
            }
        }
        try await app.auth.exchangePKCE(code: code, verifier: verifier)
        await didSignIn()
    }

    func resetPassword(_ email: String) async throws { try await app?.auth.recover(email: email) }

    private func didSignIn() async {
        isSignedIn = true
        guard let app else { return }
        app.transportCacheReset()
        await refreshMe()
        await app.tribe.refreshFeed(key: "all")
        await app.trips.refresh()
        await app.activity.refresh()
        await app.statuses.refresh()
        await app.safety.refreshSos()
        await app.safety.syncSavedTrips()
        await app.checkLandingSuggestion()
        PushManager.shared.refreshRegistration { [weak app] token in app?.registerDevice(token) }
    }

    /// Phone verification for an existing account (POST /me/phone/start + /verify).
    func startPhoneVerification(_ phone: String) async throws -> String? {
        guard let app else { return nil }
        return try await app.api.phoneStart(phone).devCode
    }

    func verifyPhone(_ phone: String, code: String) async throws {
        guard let app else { return }
        _ = try await app.api.phoneVerify(phone, code: code)
        if var me {
            me.user.isPhoneVerified = true
            me.user.phone = phone
            self.me = me
            app.store.setEntry("me", me, isPrivate: true)
        }
        await refreshMe()
    }

    /// Deletes the account on the server, then clears this device (the server session is gone).
    func deleteAccount() async throws {
        guard let app else { return }
        _ = try await app.api.deleteAccount()
        UserDefaults.standard.removeObject(forKey: "push.token")
        await signOut()
    }

    func signOut() async {
        guard let app else { return }
        if let token = UserDefaults.standard.string(forKey: "push.token") {
            try? await app.api.unregisterDevice(token: token)
        }
        await app.safety.stopSharing()
        await wipeLocal()
        await app.auth.signOut()
        await app.tribe.refreshFeed(key: "all")
    }

    /// Clears everything this account left on the phone: cached profile (name, photo), trips, requests and
    /// offers, notifications, chats, the outbox, account settings, stories and the widget.
    func wipeLocal() async {
        guard let app else { return }
        app.store.wipePrivate()
        app.transportCacheReset()
        await ImagePipeline.shared.clearAll()
        me = nil
        isSignedIn = false
        unreadMessages = 0
        unreadNotifications = 0
        app.trips.myTrips = .empty
        app.activity.items = []
        app.chat.close()
        app.chat.chats = []
        app.chat.lines = [:]
        app.statuses.clear()
        WidgetBridge.clear()
        app.safety.endLocally()
        app.safety.sos = nil
        app.safety.buddies = nil
        app.pendingOutbox = app.outbox.pendingCount
    }
}

extension AppModel {
    /// URLCache may hold responses personalised for the previous user.
    func transportCacheReset() { transport.live.clearCache() }
}
