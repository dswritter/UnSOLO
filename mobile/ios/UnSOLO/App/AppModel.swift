import Foundation
import Observation
import SwiftData
import UIKit

struct ModerationNotice: Identifiable, Equatable {
    let id = UUID()
    let postId: String
    let prompts: [String]
    let held: Bool
}

/// Composition root: owns the transport, API client, cache, outbox, analytics and repositories.
@MainActor
@Observable
final class AppModel {
    @ObservationIgnored let transport: SwitchingTransport
    @ObservationIgnored let auth: AuthManager
    @ObservationIgnored let api: APIClient
    @ObservationIgnored let store: LocalStore
    @ObservationIgnored let outbox: OutboxEngine
    @ObservationIgnored let analytics: Analytics
    @ObservationIgnored let landing: LandingTracker
    @ObservationIgnored let uploads: UploadCoordinator

    let connectivity: Connectivity
    let router: Router
    let session: SessionStore
    let explore: ExploreRepo
    let tribe: TribeRepo
    let trips: TripsRepo
    let activity: ActivityRepo
    let chat: ChatRepo
    let profiles: ProfileRepo
    let statuses: StatusRepo
    let safety: SafetyRepo
    /// Saved trips and watched stories (device only).
    let marks = LocalMarks()

    var isDemo: Bool
    /// First launch could not reach the server, so demo data is shown.
    var fellBackToDemo = false
    var flags = ConfigResponse.Flags(tribeEnabled: true, tribePostingEnabled: true, hostOffersEnabled: true, pushEnabled: true)
    var upgradeRequired = false
    var moderationNotice: ModerationNotice?
    var toast: String?
    var pendingOutbox = 0

    @ObservationIgnored private var lastSync: Date?
    @ObservationIgnored private var landingShownThisLaunch = false
    @ObservationIgnored private var configTask: Task<Void, Never>?
    @ObservationIgnored private(set) var launched = false

    init(inMemory: Bool = false) {
        let demo = AppInfo.demoModeRequested
        let transport = SwitchingTransport(useDemo: demo)
        self.transport = transport
        isDemo = demo
        let secrets: any SecretStore = inMemory ? InMemorySecretStore() : ResilientSecretStore()
        let supaURL = demo ? "https://demo.supabase.co" : AppInfo.supabaseFallbackURL
        auth = AuthManager(transport: transport, secrets: secrets, supabaseURL: supaURL, anonKey: AppInfo.supabaseFallbackKey)
        api = APIClient(transport: transport, baseURL: AppInfo.apiBaseURL, auth: auth)
        let container = Schema1.makeContainer(inMemory: inMemory)
        store = LocalStore(container: container)
        outbox = OutboxEngine(context: container.mainContext, sender: api)
        let api = self.api
        analytics = Analytics(send: { events in try await api.sendEvents(events) })
        landing = LandingTracker()
        connectivity = Connectivity()
        router = Router()
        let uploader: any MediaUploading = demo ? DemoUploader() : BackgroundUploader.shared
        uploads = UploadCoordinator(uploader: uploader)
        session = SessionStore()
        explore = ExploreRepo()
        tribe = TribeRepo()
        trips = TripsRepo()
        activity = ActivityRepo()
        chat = ChatRepo()
        profiles = ProfileRepo()
        statuses = StatusRepo()
        safety = SafetyRepo()

        router.tab = AppTab(landing.landingTab)
        for repo in [session, explore, tribe, trips, activity, chat, profiles, statuses, safety] as [any AppBound] { repo.bind(self) }
        uploads.bind(self)
        outbox.isOnline = { [weak connectivity] in connectivity?.isOnline ?? true }
        outbox.onChange = { [weak self] in self?.pendingOutbox = self?.outbox.pendingCount ?? 0 }
        connectivity.onReconnect = { [weak self] in
            Task { await self?.outbox.drain() }
        }
        let session = self.session
        let auth = self.auth
        Task {
            await auth.onChange { [weak session] signedIn in
                Task { @MainActor in session?.authChanged(signedIn) }
            }
        }
    }

    /// Cold start: everything below renders from cache first; network work happens after.
    func launch(coldStart: Bool = true) async {
        guard !launched else { return }
        launched = true
        connectivity.start()
        session.loadCached()
        tribe.loadCached()
        explore.loadCached()
        trips.loadCached()
        activity.loadCached()
        chat.loadCached()
        statuses.loadCached()
        statuses.loadArchive()
        pendingOutbox = outbox.pendingCount

        #if DEBUG
        await DebugLaunch.prepare(self)
        #endif

        session.isSignedIn = await auth.isSignedIn
        await analytics.track("app.open", props: ["coldStart": coldStart ? "true" : "false", "landingTab": landing.landingTab.rawValue])
        await analytics.foregrounded()

        await loadConfig()
        if session.isSignedIn {
            await session.refreshMe()
            await checkLandingSuggestion()
            await sync()
            Task { await statuses.refresh(); await safety.refreshSos(); await safety.syncSavedTrips() }
            PushManager.shared.refreshRegistration { [weak self] token in self?.registerDevice(token) }
        }
        uploads.resumeAll()
        await outbox.drain()
        startConfigTimer()
        #if DEBUG
        await DebugLaunch.navigate(self)
        #endif
    }

    // MARK: Config (+ first-launch demo fallback)

    func loadConfig() async {
        do {
            let config = try await api.config()
            flags = config.flags
            await auth.configure(supabaseURL: config.supabase.url, anonKey: config.supabase.anonKey)
            if Self.isVersion(AppInfo.version, below: config.minAppVersion.ios) { upgradeRequired = true }
            store.setEntry("config", config)
            connectivity.markReachable()
        } catch APIError.offline, APIError.transport {
            if let cached = store.entry(ConfigResponse.self, "config") {
                flags = cached.flags
                await auth.configure(supabaseURL: cached.supabase.url, anonKey: cached.supabase.anonKey)
                connectivity.markUnreachable()
            } else if !isDemo {
                // First launch and the server is unreachable: switch to bundled demo data so the app is usable.
                isDemo = true
                fellBackToDemo = true
                transport.useDemo = true
                await auth.configure(supabaseURL: "https://demo.supabase.co", anonKey: "demo-anon-key")
                if let config = try? await api.config() { flags = config.flags }
            }
        } catch {
            // Keep defaults.
        }
    }

    private func startConfigTimer() {
        configTask?.cancel()
        configTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15 * 60))
                await self?.loadConfig()
            }
        }
    }

    static func isVersion(_ a: String, below b: String) -> Bool {
        let pa = a.split(separator: ".").compactMap { Int($0) }
        let pb = b.split(separator: ".").compactMap { Int($0) }
        for i in 0..<max(pa.count, pb.count) {
            let x = i < pa.count ? pa[i] : 0, y = i < pb.count ? pb[i] : 0
            if x != y { return x < y }
        }
        return false
    }

    // MARK: Lifecycle

    func foregrounded() async {
        await analytics.foregrounded()
        guard launched else { return }
        if session.isSignedIn { await sync(); await statuses.refresh(); await safety.refreshSos() }
        await outbox.drain()
    }

    func backgrounded() async {
        BackgroundTasks.scheduleRefresh()
        if outbox.pendingCount > 0 { BackgroundTasks.scheduleOutbox() }
        await analytics.backgrounded()
    }

    // MARK: Sync

    func sync() async {
        guard session.isSignedIn else { return }
        do {
            let r = try await api.sync(since: lastSync ?? store.entry(Date.self, "sync.since"))
            lastSync = r.serverTime
            store.setEntry("sync.since", r.serverTime, isPrivate: true)
            for id in r.removedPosts { tribe.drop(postId: id) }
            // Only posts already on the phone, at most 8: the rest load when opened.
            for id in r.posts.filter({ tribe.post($0) != nil }).prefix(8) { await tribe.refreshPost(id) }
            for m in r.memberships { tribe.applyMembership(postId: m.postId, state: m.state) }
            if let n = r.unreadNotifications { session.unreadNotifications = n }
            connectivity.markReachable()
        } catch APIError.offline {
            connectivity.markUnreachable()
        } catch {}
    }

    // MARK: Landing tab prompt

    func recordTabOpen(_ tab: AppTab) {
        if let l = tab.landing { landing.recordOpen(l) }
        Task { await analytics.track("screen.view", screen: tab.screenName) }
    }

    func checkLandingSuggestion() async {
        let current = landing.landingTab
        var suggestion: LandingTab?
        if session.isSignedIn {
            let server = try? await api.landingSuggestion()
            suggestion = LandingSuggestionLogic.shouldPrompt(server: server, current: current, dismissedLocally: landing.dismissed,
                                                             alreadyShownThisLaunch: landingShownThisLaunch)
        } else {
            suggestion = landingShownThisLaunch ? nil : landing.localSuggestion
        }
        guard let suggestion else { return }
        landingShownThisLaunch = true
        router.landingPrompt = suggestion
        await analytics.track("landing.prompt_shown", props: ["tab": suggestion.rawValue])
    }

    func acceptLanding(_ tab: LandingTab) {
        landing.landingTab = tab
        router.landingPrompt = nil
        session.updatePreferences(PreferencesPatch(landingTab: tab)) { $0.landingTab = tab }
        Task { await analytics.track("landing.prompt_accepted", props: ["tab": tab.rawValue]) }
    }

    func dismissLanding() {
        landing.dismissed = true
        router.landingPrompt = nil
        guard session.isSignedIn else { return }
        outbox.enqueue(kind: "landing.dismiss", method: .post, path: "/me/landing-suggestion/dismiss", body: nil, clientId: "landing.dismiss")
        Task { await outbox.drain() }
    }

    // MARK: Push

    func registerDevice(_ token: String) {
        guard session.isSignedIn else { return }
        UserDefaults.standard.set(token, forKey: "push.token")
        let body = outbox.encodeBody(DeviceBody(platform: "ios", token: token, appVersion: AppInfo.version, locale: Locale.current.identifier))
        outbox.enqueue(kind: "device", method: .post, path: "/devices", body: body, clientId: "device:\(token)", coalesce: true)
        Task { await outbox.drain() }
    }

    /// Ask for notification permission after a meaningful action, once.
    func askPushAfterMeaningfulAction() {
        guard flags.pushEnabled, !PushManager.shared.hasAsked else { return }
        PushManager.shared.requestPermissionIfNeeded { [weak self] token in self?.registerDevice(token) }
    }

    func handlePushAction(_ action: PushManager.Action, payload: [AnyHashable: Any]) {
        let p = PushPayload(userInfo: payload)
        switch action {
        case .approve, .decline:
            guard let d = p.inlineDecision else { return openNotificationLink(p.link) }
            tribe.decide(postId: d.postId, userId: d.userId, approve: action == .approve)
            if let id = p.notificationId { activity.markRead([id]) }
        case .reply, .open:
            openNotificationLink(p.link)
        }
    }

    /// Notification and push links: only same-site paths are routed; anything else opens Activity.
    func openNotificationLink(_ link: String?) {
        if let route = DeepLink.notificationRoute(link) {
            router.open(route)
        } else {
            router.push(.activity)
        }
    }

    // MARK: Gating

    /// Posting, joining, reacting and commenting need sign-in and a confirmed email or verified phone.
    func requireVerified(_ reason: String, _ action: @escaping () -> Void) {
        if !session.isSignedIn {
            router.authReason = reason
            router.afterGate = action
            router.gateNeedsPhone = true
            router.authSheet = true
        } else if !session.canParticipate {
            router.afterGate = action
            router.gateNeedsPhone = true
            router.phoneSheet = true
        } else {
            action()
        }
    }

    func requireSignIn(_ reason: String, _ action: @escaping () -> Void) {
        if session.isSignedIn { action() } else {
            router.authReason = reason
            router.afterGate = action
            router.gateNeedsPhone = false
            router.authSheet = true
        }
    }

    func runAfterGate() {
        let action = router.afterGate
        router.afterGate = nil
        action?()
    }

    func showToast(_ text: String) {
        toast = text
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(3))
            if self?.toast == text { self?.toast = nil }
        }
    }

    /// Stays, activities and rentals book on their web page (`webPath`, a same-site path).
    func openListing(_ t: TripLite) {
        guard let path = t.webPath, DeepLink.isSameSitePath(path),
              let url = URL(string: path, relativeTo: AppInfo.webBaseURL)?.absoluteURL else { return }
        router.safari = SafariItem(url: url)
        Task { await analytics.track("trip.take_seat", props: ["slug": t.slug, "date": ""]) }
    }

    func openBooking(slug: String, date: String?) {
        guard DeepLink.isSlug(slug) else { return }
        var comps = URLComponents(url: AppInfo.webBaseURL.appendingPathComponent("packages/\(slug)"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "book", value: "1")] + (date.map { [URLQueryItem(name: "date", value: $0)] } ?? [])
        if let url = comps.url { router.safari = SafariItem(url: url) }
        Task { await analytics.track("trip.take_seat", props: ["slug": slug, "date": date ?? ""]) }
    }
}

/// Repositories get a weak back-reference to the app after construction.
@MainActor
protocol AppBound: AnyObject {
    func bind(_ app: AppModel)
}
