import SafariServices
import SwiftUI

/// Tab container: Explore · Tribe · (+) Post · My trips · You. Each tab keeps its own NavigationStack alive.
/// The Full Circle tab bar is drawn by hand (material bar, hairline, raised pine +) and hides on pushed screens.
struct RootView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    private let tabs: [AppTab] = [.explore, .tribe, .trips, .you]

    var body: some View {
        @Bindable var router = router
        @Bindable var app = app
        ZStack {
            ForEach(tabs, id: \.self) { tab in
                TabStack(tab: tab)
                    .opacity(router.tab == tab ? 1 : 0)
                    .allowsHitTesting(router.tab == tab)
                    .accessibilityHidden(router.tab != tab)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) { StatusBanners() }
        // The bar is an overlay; each tab's root view reserves its height with a safe-area inset
        // (insets on this ZStack don't reach into the UIKit-backed NavigationStacks).
        .overlay(alignment: .bottom) {
            if router.isAtRoot { PcTabBar() }
        }
        .overlay(alignment: .bottom) { ToastView().padding(.bottom, router.isAtRoot ? 140 : 96) }
        .pcScreen()
        .sheet(isPresented: $router.showPostSheet) {
            PostTypeSheet().presentationDetents([.height(470), .large]).presentationDragIndicator(.visible).pcSheet()
        }
        .fullScreenCover(item: $router.composer) { kind in
            ComposerHost(kind: kind).environment(app).environment(router).environment(session)
        }
        .fullScreenCover(item: $router.storyViewer) { item in
            StoryViewer(item: item).environment(app).environment(router).environment(session)
        }
        .sheet(item: $router.safari) { item in SafariView(url: item.url).ignoresSafeArea().presentationCornerRadius(PcTokens.radiusSheet) }
        .sheet(isPresented: $router.authSheet, onDismiss: { if !session.isSignedIn { router.afterGate = nil } }) {
            WelcomeView().environment(app).environment(router).environment(session).pcSheet()
        }
        .sheet(isPresented: $router.phoneSheet) {
            PhoneVerifyView().environment(app).environment(router).environment(session).presentationDetents([.large]).pcSheet()
        }
        .sheet(item: Binding(get: { router.landingPrompt.map(LandingPromptItem.init) }, set: { if $0 == nil { router.landingPrompt = nil } })) { item in
            LandingPromptSheet(tab: item.tab).presentationDetents([.height(320)]).presentationDragIndicator(.visible).pcSheet()
        }
        .sheet(item: $app.moderationNotice) { notice in
            HeldPostSheet(notice: notice).presentationDetents([.medium, .large]).pcSheet()
        }
        .onChange(of: router.tab, initial: true) { _, tab in app.recordTabOpen(tab) }
        .onAppear {
            #if DEBUG
            if DebugLaunch.startScreen != nil { return }
            #endif
            if !session.isSignedIn && !UserDefaults.standard.bool(forKey: "welcome.seen") {
                Task {
                    try? await Task.sleep(for: .milliseconds(600))
                    if !(await app.auth.isSignedIn) { router.authSheet = true }
                    UserDefaults.standard.set(true, forKey: "welcome.seen")
                }
            }
        }
        .alert("Update UnSOLO", isPresented: .constant(app.upgradeRequired)) {
            Button("Open App Store") {}
        } message: {
            Text("This version is no longer supported. Please update to keep using UnSOLO.")
        }
    }
}

private struct LandingPromptItem: Identifiable {
    let tab: LandingTab
    var id: String { tab.rawValue }
}

/// One NavigationStack per tab with every destination registered.
struct TabStack: View {
    let tab: AppTab
    @Environment(Router.self) private var router

    var body: some View {
        NavigationStack(path: Binding(get: { router.path(tab) }, set: { router.paths[tab] = $0 })) {
            root
                .safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: PcTokens.tabBar) }
                .navigationDestination(for: Route.self) { RouteView(route: $0) }
        }
        .tint(Pc.ink)
    }

    @ViewBuilder private var root: some View {
        switch tab {
        case .explore: ExploreView()
        case .tribe: TribeFeedView()
        case .trips: MyTripsView()
        case .you: YouView()
        case .post: EmptyView()
        }
    }
}

struct RouteView: View {
    let route: Route
    var body: some View {
        switch route {
        case .trip(let slug): TripDetailView(slug: slug)
        case .post(let id): PostDetailView(postId: id)
        case .profile(let u): ProfileView(username: u)
        case .chat(let roomId, let title): ChatRoomView(roomId: roomId, title: title)
        case .activity: ActivityView()
        case .messages: MessagesView()
        case .settings: SettingsView()
        case .hostHub: HostHubView()
        case .offerForm(let postId): OfferFormView(postId: postId)
        case .offerReview(let postId): OfferReviewView(postId: postId)
        }
    }
}

// MARK: - Tab bar

/// Explore · Tribe · (+) · My trips · You. The selected tab sits in a pale-yellow pill with an accentInk icon;
/// the centre + is a raised yellow circle that opens "What are you sharing?".
struct PcTabBar: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            item(.explore)
            item(.tribe, badge: app.tribe.pendingRequestCount + session.unreadNotifications)
            postButton
            item(.trips, badge: app.trips.myTrips.upcoming.count + app.trips.myTrips.plans.count)
            youItem
        }
        .padding(.horizontal, 6)
        .padding(.top, 7)
        .frame(height: PcTokens.tabBar, alignment: .top)
        .pcBarBackground()
    }

    private func item(_ tab: AppTab, badge: Int = 0) -> some View {
        let selected = router.tab == tab
        return Button { router.select(tab) } label: {
            VStack(spacing: 3) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: selected ? tab.selectedSymbol : tab.symbol)
                        .font(.system(size: 19, weight: .bold))
                        .foregroundStyle(selected ? Pc.ink : Pc.ink3)
                        .frame(width: 54, height: 30)
                        .background { if selected { Capsule().fill(Pc.tonal) } }
                    if badge > 0 {
                        Text("\(min(badge, 99))")
                            .font(.system(size: 10.5, weight: .heavy).monospacedDigit())
                            .foregroundStyle(Pc.raised)
                            .padding(.horizontal, 5)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Capsule().fill(Pc.red))
                            .background(Capsule().fill(Pc.paper).padding(-2))
                            .offset(x: 2, y: -4)
                    }
                }
                Text(tab.title).font(.system(size: 11, weight: .bold))
                    .foregroundStyle(selected ? Pc.ink : Pc.ink3)
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pcPress)
        .accessibilityLabel(badge > 0 ? "\(tab.title), \(badge) new" : tab.title)
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }

    private var postButton: some View {
        Button { app.requireVerified("Sign in to post") { router.showPostSheet = true } } label: {
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .heavy))
                .foregroundStyle(Pc.onPine)
                .frame(width: 56, height: 56)
                .background(Circle().fill(Pc.pine))
                .background(Circle().fill(Pc.paper).padding(-4))
                .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
                .offset(y: -14)
                .frame(maxWidth: .infinity, minHeight: 52)
                .contentShape(Rectangle())
        }
        .buttonStyle(.pcPress)
        .accessibilityLabel("Share a plan, story, question or poll")
    }

    private var youItem: some View {
        let selected = router.tab == .you
        return Button { router.select(.you) } label: {
            VStack(spacing: 3) {
                Group {
                    if let user = session.user {
                        Avatar(user: user, size: 26, ring: selected ? Pc.ink : .clear)
                    } else {
                        Image(systemName: selected ? "person.crop.circle.fill" : "person.crop.circle").font(.system(size: 20, weight: .bold))
                            .foregroundStyle(selected ? Pc.ink : Pc.ink3)
                    }
                }
                .frame(width: 54, height: 30)
                .background { if selected { Capsule().fill(Pc.tonal) } }
                Text("You").font(.system(size: 11, weight: .bold)).foregroundStyle(selected ? Pc.ink : Pc.ink3)
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pcPress)
        .accessibilityLabel("You")
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - Header

/// Root-screen header: wordmark or large rounded title, then the trailing slot and the
/// Activity + Messages glance icons (with badges).
struct AppHeader<Trailing: View>: View {
    var title: String?
    var showsWordmark = false
    @ViewBuilder var trailing: Trailing
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @Environment(AppModel.self) private var app

    var body: some View {
        HStack(spacing: 0) {
            if showsWordmark {
                Wordmark(height: 28)
            } else if let title {
                Text(title).pcFont(.display, weight: .heavy).foregroundStyle(Pc.ink).accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: 8)
            trailing
            Button { app.requireSignIn("Sign in to see your activity") { router.push(.activity) } } label: {
                BadgeIcon(systemName: "bell", count: 0, dot: session.unreadNotifications > 0 || app.tribe.pendingRequestCount > 0, label: "Activity")
            }
            .buttonStyle(.pcPress)
            Button { app.requireSignIn("Sign in to see your messages") { router.push(.messages) } } label: {
                BadgeIcon(systemName: "bubble.left.and.bubble.right", count: session.unreadMessages, label: "Messages")
            }
            .buttonStyle(.pcPress)
        }
        .padding(.leading, 20)
        .padding(.trailing, 8)
        .frame(minHeight: PcTokens.topBar)
    }
}

extension AppHeader where Trailing == EmptyView {
    init(title: String? = nil, showsWordmark: Bool = false) {
        self.title = title
        self.showsWordmark = showsWordmark
        trailing = EmptyView()
    }
}

// MARK: - Banners & toast

struct StatusBanners: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        VStack(spacing: 0) {
            if !app.connectivity.isOnline {
                OfflineBanner(text: app.pendingOutbox > 0 ? "Offline · showing saved · \(app.pendingOutbox) waiting to send" : "Offline · showing saved")
            } else if app.fellBackToDemo {
                OfflineBanner(text: "Server unreachable · showing demo data")
            }
        }
        .animation(.easeOut(duration: PcTokens.motionStandard), value: app.connectivity.isOnline)
    }
}

struct ToastView: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        if let text = app.toast {
            Text(text)
                .pcFont(.small, weight: .medium)
                .foregroundStyle(Pc.onInk)
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
                .background(Capsule().fill(Pc.ink))
                .padding(.horizontal, 20)
                .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .accessibilityAddTraits(.updatesFrequently)
        }
    }
}

// MARK: - Safari

struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let c = SFSafariViewController.Configuration()
        c.entersReaderIfAvailable = false
        let vc = SFSafariViewController(url: url, configuration: c)
        vc.preferredControlTintColor = UIColor(Pc.accentInk)
        vc.dismissButtonStyle = .close
        return vc
    }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

// MARK: - Shared navigation bar styling

extension View {
    /// Inline system navigation bar on paper for pushed screens.
    func pcNavigationBar(_ title: String = "") -> some View {
        navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Pc.paper, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}
