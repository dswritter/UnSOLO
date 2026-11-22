import Foundation
import Observation

/// Marks kept on the device:
/// - saved trips (the heart on trip cards; also saved on the server when signed in, for price-drop and seats-left alerts),
/// - which stories you've watched (story rail rings turn from pine to "seen").
@MainActor
@Observable
final class LocalMarks {
    static let savedKey = "marks.savedTrips"
    static let seenKey = "marks.seenStories"

    private(set) var savedTrips: Set<String>
    private(set) var seenStories: Set<String>
    @ObservationIgnored private let defaults: UserDefaults
    /// Told about every heart tap (slug, saved) so the server copy follows.
    @ObservationIgnored var onToggle: ((String, Bool) -> Void)?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        savedTrips = Set(defaults.stringArray(forKey: Self.savedKey) ?? [])
        seenStories = Set(defaults.stringArray(forKey: Self.seenKey) ?? [])
    }

    func isSaved(_ slug: String) -> Bool { savedTrips.contains(slug) }

    func toggleSaved(_ slug: String) {
        let on = !savedTrips.contains(slug)
        if on { savedTrips.insert(slug) } else { savedTrips.remove(slug) }
        defaults.set(Array(savedTrips), forKey: Self.savedKey)
        onToggle?(slug, on)
    }

    /// Adds trips saved elsewhere (the server's list); never removes.
    func merge(_ slugs: [String]) {
        let next = savedTrips.union(slugs)
        guard next != savedTrips else { return }
        savedTrips = next
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
