import Foundation
import Observation

/// Device-only marks with no API behind them yet:
/// - saved trips (the heart on trip cards; the API only has saves for posts),
/// - which stories you've watched (story rail rings turn from pine to "seen").
@MainActor
@Observable
final class LocalMarks {
    static let savedKey = "marks.savedTrips"
    static let seenKey = "marks.seenStories"

    private(set) var savedTrips: Set<String>
    private(set) var seenStories: Set<String>
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        savedTrips = Set(defaults.stringArray(forKey: Self.savedKey) ?? [])
        seenStories = Set(defaults.stringArray(forKey: Self.seenKey) ?? [])
    }

    func isSaved(_ slug: String) -> Bool { savedTrips.contains(slug) }

    func toggleSaved(_ slug: String) {
        if savedTrips.contains(slug) { savedTrips.remove(slug) } else { savedTrips.insert(slug) }
        defaults.set(Array(savedTrips), forKey: Self.savedKey)
    }

    func markSeen(_ postId: String) {
        guard !seenStories.contains(postId) else { return }
        seenStories.insert(postId)
        defaults.set(Array(seenStories), forKey: Self.seenKey)
    }

    func reset() {
        savedTrips = []
        seenStories = []
        defaults.removeObject(forKey: Self.savedKey)
        defaults.removeObject(forKey: Self.seenKey)
    }
}
