import Foundation

/// Counts tab opens locally and decides whether to offer "Start the app on Tribe?".
/// The server is authoritative (GET /me/landing-suggestion); the local rule mirrors it for guests and offline use:
/// the most-opened tab over the last 14 days, with at least 3 opens, that isn't already the landing tab,
/// and only if the prompt hasn't been dismissed.
struct LandingSuggestionLogic {
    static let windowDays = 14
    static let minOpens = 3

    struct Visit: Codable, Hashable, Sendable { var tab: LandingTab; var at: Date }

    static func localSuggestion(visits: [Visit], current: LandingTab, dismissed: Bool, now: Date = Date()) -> LandingTab? {
        guard !dismissed else { return nil }
        let cutoff = now.addingTimeInterval(-Double(windowDays) * 86_400)
        let recent = visits.filter { $0.at >= cutoff && $0.at <= now }
        var counts: [LandingTab: Int] = [:]
        for v in recent { counts[v.tab, default: 0] += 1 }
        // Ties break in tab order so the result is deterministic.
        let best = LandingTab.allCases.max { (counts[$0] ?? 0, -$0.order) < (counts[$1] ?? 0, -$1.order) }
        guard let best, (counts[best] ?? 0) >= minOpens, best != current else { return nil }
        return best
    }

    /// Whether to show the sheet given the server's answer. The local dismissal also suppresses it,
    /// in case the dismiss call is still queued.
    static func shouldPrompt(server: LandingSuggestion?, current: LandingTab, dismissedLocally: Bool, alreadyShownThisLaunch: Bool) -> LandingTab? {
        guard !dismissedLocally, !alreadyShownThisLaunch, let tab = server?.suggest, tab != current else { return nil }
        return tab
    }
}

extension LandingTab {
    var order: Int { LandingTab.allCases.firstIndex(of: self) ?? 0 }
}

@MainActor
final class LandingTracker {
    private let defaults: UserDefaults
    private let visitsKey = "landing.visits"
    private let landingKey = "landing.tab"
    private let dismissedKey = "landing.promptDismissed"

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    /// Saved landing tab, read synchronously at launch (no network wait).
    var landingTab: LandingTab {
        get { defaults.string(forKey: landingKey).flatMap(LandingTab.init(rawValue:)) ?? .explore }
        set { defaults.set(newValue.rawValue, forKey: landingKey) }
    }

    var dismissed: Bool {
        get { defaults.bool(forKey: dismissedKey) }
        set { defaults.set(newValue, forKey: dismissedKey) }
    }

    var visits: [LandingSuggestionLogic.Visit] {
        guard let data = defaults.data(forKey: visitsKey) else { return [] }
        return (try? JSONDecoder().decode([LandingSuggestionLogic.Visit].self, from: data)) ?? []
    }

    func recordOpen(_ tab: LandingTab, at date: Date = Date()) {
        let cutoff = date.addingTimeInterval(-Double(LandingSuggestionLogic.windowDays) * 86_400)
        var v = visits.filter { $0.at >= cutoff }
        v.append(.init(tab: tab, at: date))
        if v.count > 300 { v.removeFirst(v.count - 300) }
        defaults.set(try? JSONEncoder().encode(v), forKey: visitsKey)
    }

    var localSuggestion: LandingTab? {
        LandingSuggestionLogic.localSuggestion(visits: visits, current: landingTab, dismissed: dismissed)
    }
}
