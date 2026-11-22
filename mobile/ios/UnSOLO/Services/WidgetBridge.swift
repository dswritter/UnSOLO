import Foundation
import WidgetKit

/// Hands the next trip to the countdown widget through the shared App Group
/// (UnSOLOWidget/CountdownWidget.swift reads the same JSON; keep the two in step).
enum WidgetBridge {
    struct Snapshot: Codable, Equatable {
        var title: String
        var place: String?
        var startDate: String
        var endDate: String?
        var slug: String
        var bookingId: String
        var travellers: Int?
    }

    static let appGroup = "group.in.unsolo.app"
    static let key = "widget.countdown"

    /// The soonest trip that hasn't ended (trips under way first).
    static func next(_ upcoming: [Booking], today: String = Fmt.ymd(Date())) -> Booking? {
        upcoming.filter { ($0.endDate ?? $0.travelDate) >= today }.min { $0.travelDate < $1.travelDate }
    }

    @MainActor
    static func update(upcoming: [Booking]) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        let old = defaults.data(forKey: key)
        var data: Data?
        if let b = next(upcoming) {
            let s = Snapshot(title: b.trip.title, place: b.trip.place?.name.components(separatedBy: ",").first, startDate: b.travelDate,
                             endDate: b.endDate, slug: b.trip.slug, bookingId: b.id, travellers: b.trip.seatsTotal.map { $0 - (b.trip.seatsLeft ?? 0) })
            data = try? JSONEncoder().encode(s)
        }
        guard data != old else { return }
        if let data { defaults.set(data, forKey: key) } else { defaults.removeObject(forKey: key) }
        WidgetCenter.shared.reloadTimelines(ofKind: "TripCountdown")
    }

    @MainActor
    static func clear() { update(upcoming: []) }
}
