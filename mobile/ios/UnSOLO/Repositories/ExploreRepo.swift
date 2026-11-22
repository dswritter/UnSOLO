import Foundation
import Observation

enum ExploreCategory: String, CaseIterable, Hashable {
    case trips, stays, activities, rentals
    var label: String { rawValue.capitalized }
    /// Non-trip categories use the same ruled row with a different meter (direction.md revision 6).
    func meter(left: Int?, total: Int?) -> String {
        let l = left ?? 0
        switch self {
        case .trips: return l == 0 ? "Full" : "\(l) of \(total ?? l) spots left"
        case .stays: return l == 1 ? "1 room left tonight" : "\(l) rooms left tonight"
        case .activities: return "\(l) slots left"
        case .rentals: return l == 1 ? "1 free" : "\(l) free"
        }
    }
}

enum LoadState: Equatable { case idle, loading, loaded, failed(String) }

/// Explore: hosted trips/stays/activities/rentals, trip details and suggestions (stale-while-revalidate).
@MainActor
@Observable
final class ExploreRepo: AppBound {
    @ObservationIgnored weak var app: AppModel?
    var lists: [ExploreCategory: [TripLite]] = [:]
    var details: [String: TripDetail] = [:]
    var suggestions: [Suggestion] = []
    var searchResults: [TripLite] = []
    var state: [ExploreCategory: LoadState] = [:]
    var detailState: [String: LoadState] = [:]

    func bind(_ app: AppModel) { self.app = app }

    func loadCached() {
        guard let store = app?.store else { return }
        for c in ExploreCategory.allCases {
            if let cache = store.entry(ExploreCache.self, "explore:\(c.rawValue)") { lists[c] = store.trips(cache.slugs) }
        }
        if let s = store.entry([Suggestion].self, "suggestions") { suggestions = s }
    }

    func refresh(_ category: ExploreCategory) async {
        guard let app else { return }
        state[category] = .loading
        do {
            let page = try await app.api.explore(q: nil, category: category.rawValue, month: nil, cursor: nil)
            app.store.upsertTrips(page.items)
            app.store.setEntry("explore:\(category.rawValue)", ExploreCache(slugs: page.items.map(\.slug), nextCursor: page.nextCursor))
            lists[category] = page.items
            state[category] = .loaded
            app.connectivity.markReachable()
        } catch APIError.offline {
            state[category] = .failed("offline")
            app.connectivity.markUnreachable()
        } catch {
            state[category] = .failed(error.localizedDescription)
        }
    }

    // MARK: "See all" (every card for a tab, 20 at a time)

    var all: [ExploreCategory: [TripLite]] = [:]
    var allCursor: [ExploreCategory: String] = [:]
    var allState: [ExploreCategory: LoadState] = [:]
    var allDone: Set<ExploreCategory> = []

    func loadAll(_ category: ExploreCategory, query: String? = nil, reset: Bool = false) async {
        guard let app, allState[category] != .loading || reset else { return }
        if reset { allCursor[category] = nil; allDone.remove(category) }
        guard !allDone.contains(category) else { return }
        allState[category] = .loading
        do {
            let q = query?.trimmingCharacters(in: .whitespaces)
            let page = try await app.api.explorePage(q: (q?.isEmpty ?? true) ? nil : q, category: category.rawValue, cursor: reset ? nil : allCursor[category])
            app.store.upsertTrips(page.items)
            var list = reset ? [] : (all[category] ?? [])
            let known = Set(list.map(\.slug))
            list += page.items.filter { !known.contains($0.slug) }
            all[category] = list
            if let c = page.nextCursor, !page.items.isEmpty { allCursor[category] = c } else { allDone.insert(category) }
            allState[category] = .loaded
        } catch {
            if all[category] == nil { all[category] = lists[category] ?? [] }
            allState[category] = .failed(error.localizedDescription)
        }
    }

    func search(_ q: String) async {
        guard let app, !q.isEmpty else { searchResults = []; return }
        if let page = try? await app.api.explore(q: q, category: nil, month: nil, cursor: nil) {
            searchResults = page.items
            app.store.upsertTrips(page.items)
        } else {
            // Offline: search what's cached.
            let all = lists.values.flatMap { $0 }
            searchResults = all.filter { $0.title.localizedCaseInsensitiveContains(q) || ($0.place?.name.localizedCaseInsensitiveContains(q) ?? false) }
        }
    }

    func detail(_ slug: String) -> TripDetail? {
        if let d = details[slug] { return d }
        if let d = app?.store.entry(TripDetail.self, "trip:\(slug)") { details[slug] = d; return d }
        return nil
    }

    func refreshDetail(_ slug: String) async {
        guard let app else { return }
        if details[slug] == nil, let cached = app.store.entry(TripDetail.self, "trip:\(slug)") { details[slug] = cached }
        detailState[slug] = .loading
        do {
            let d = try await app.api.trip(slug: slug)
            details[slug] = d
            app.store.setEntry("trip:\(slug)", d)
            app.store.upsertPosts(d.stories)
            app.tribe.absorb(d.stories)
            detailState[slug] = .loaded
        } catch {
            detailState[slug] = .failed(error.localizedDescription)
        }
    }

    func refreshSuggestions() async {
        guard let app else { return }
        var lat: Double?, lng: Double?
        if app.session.preferences.suggestByLocation {
            var loc = LocationService.shared.lastRounded
            if loc == nil, LocationService.shared.isAuthorized { loc = await LocationService.shared.currentRounded() }
            lat = loc?.lat
            lng = loc?.lng
        }
        if let s = try? await app.api.suggestions(lat: lat, lng: lng) {
            suggestions = s.items
            app.store.setEntry("suggestions", s.items)
            app.tribe.absorb(s.items.compactMap(\.post))
        }
    }

    func trip(slug: String) -> TripLite? {
        details[slug]?.lite ?? lists.values.flatMap { $0 }.first { $0.slug == slug } ?? app?.store.trips([slug]).first
    }
}
