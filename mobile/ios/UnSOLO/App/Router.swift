import Foundation
import Observation

enum AppTab: String, Hashable, CaseIterable {
    case explore, tribe, post, trips, you

    var title: String {
        switch self {
        case .explore: "Explore"
        case .tribe: "Tribe"
        case .post: "Post"
        case .trips: "My trips"
        case .you: "You"
        }
    }
    var symbol: String {
        switch self {
        case .explore: "safari"
        case .tribe: "person.3"
        case .post: "plus"
        case .trips: "ticket"
        case .you: "person.crop.circle"
        }
    }
    var selectedSymbol: String {
        switch self {
        case .explore: "safari.fill"
        case .tribe: "person.3.fill"
        case .post: "plus"
        case .trips: "ticket.fill"
        case .you: "person.crop.circle.fill"
        }
    }
    var landing: LandingTab? {
        switch self {
        case .explore: .explore
        case .tribe: .tribe
        case .trips: .trips
        default: nil
        }
    }
    var screenName: String {
        switch self {
        case .explore: "explore"
        case .tribe: "tribe"
        case .trips: "trips"
        case .you: "you"
        case .post: "compose"
        }
    }
    init(_ landing: LandingTab) {
        switch landing {
        case .explore: self = .explore
        case .tribe: self = .tribe
        case .trips: self = .trips
        }
    }
}

enum Route: Hashable {
    case trip(slug: String)
    case post(id: String)
    case profile(username: String)
    case chat(roomId: String, title: String?)
    case activity
    case messages
    case settings
    case hostHub
    case offerForm(postId: String)
    case offerReview(postId: String)
}

enum ComposeKind: String, Identifiable {
    case plan, story, ask
    var id: String { rawValue }
}

struct SafariItem: Identifiable, Equatable {
    let url: URL
    var id: String { url.absoluteString }
}

@MainActor
@Observable
final class Router {
    var tab: AppTab = .explore
    var paths: [AppTab: [Route]] = [:]
    var showPostSheet = false
    var composer: ComposeKind?
    var composerTripSlug: String?
    var safari: SafariItem?
    var authSheet = false
    var authReason: String?
    var phoneSheet = false
    var landingPrompt: LandingTab?
    /// Set by "Ask to join" on a feed card; the plan detail opens the intro sheet.
    var pendingJoinPostId: String?
    @ObservationIgnored var afterGate: (() -> Void)?
    /// Whether the pending gated action also needs a verified phone.
    @ObservationIgnored var gateNeedsPhone = false

    func path(_ tab: AppTab) -> [Route] { paths[tab] ?? [] }

    func push(_ route: Route) {
        paths[tab, default: []].append(route)
    }

    func popToRoot(_ tab: AppTab) { paths[tab] = [] }

    var isAtRoot: Bool { path(tab).isEmpty }

    func select(_ newTab: AppTab) {
        if newTab == .post {
            showPostSheet = true
            return
        }
        if newTab == tab { popToRoot(tab) }
        tab = newTab
    }

    /// Opens a validated deep link.
    func open(_ link: DeepLink) {
        switch link {
        case .tribe: tab = .tribe; popToRoot(.tribe)
        case .explore: tab = .explore; popToRoot(.explore)
        case .bookings: tab = .trips; popToRoot(.trips)
        case .post(let id): push(.post(id: id))
        case .trip(let slug): push(.trip(slug: slug))
        case .profile(let u): push(.profile(username: u))
        case .chat(let r): push(.chat(roomId: r, title: nil))
        }
    }

    func openCompose(_ kind: ComposeKind, tripSlug: String? = nil) {
        showPostSheet = false
        composerTripSlug = tripSlug
        composer = kind
    }
}
