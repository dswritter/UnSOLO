import Foundation

/// How a trip or plan talks about its spots (same rule as the web's src/lib/seats.ts and Android's SeatCopy).
/// "8/12 spots left" on a trip nobody has booked reads as "nobody wants this", so the total only shows once it helps:
///  - nobody booked yet  → "12 spots open"
///  - under half booked  → "3 going" (the group size only on the trip page)
///  - half or more       → "4/12 spots left"
///  - none left          → "Full"
enum SeatCopy {
    enum Stage: Equatable { case open, going, filling, full }

    struct Center: Equatable {
        let big: String
        /// The tiny "/12", only once half are booked (and when full).
        let of: String?
        let small: String
    }

    static func stage(total: Int, left: Int) -> Stage {
        let n = max(0, total), l = min(max(0, left), n)
        let booked = n - l
        if n > 0 && l <= 0 { return .full }
        if booked <= 0 { return .open }
        if booked * 2 < n { return .going }
        return .filling
    }

    private static func spots(_ k: Int) -> String { k == 1 ? "spot" : "spots" }
    private static func clamp(_ total: Int, _ left: Int) -> (Int, Int) { let n = max(0, total); return (n, min(max(0, left), n)) }

    /// Cards, rows, map pins, stories.
    static func short(total: Int, left: Int) -> String {
        let (n, l) = clamp(total, left)
        switch stage(total: n, left: l) {
        case .full: return "Full"
        case .open: return "\(n) \(spots(n)) open"
        case .going: return "\(n - l) going"
        case .filling: return "\(l)/\(n) \(spots(l)) left"
        }
    }

    /// Date pills (narrow): "12 open", "3 going", "4/12 left", "Full".
    static func tiny(total: Int, left: Int) -> String {
        let (n, l) = clamp(total, left)
        switch stage(total: n, left: l) {
        case .full: return "Full"
        case .open: return "\(n) open"
        case .going: return "\(n - l) going"
        case .filling: return "\(l)/\(n) left"
        }
    }

    /// The trip page itself: same rule, plus the group size while it's under half booked.
    static func long(total: Int, left: Int) -> String {
        let (n, l) = clamp(total, left)
        switch stage(total: n, left: l) {
        case .full: return "Full"
        case .open: return "\(n) \(spots(n)) open"
        case .going: return "\(n - l) going · group of \(n)"
        case .filling: return "\(l) of \(n) \(spots(l)) left"
        }
    }

    /// Ring centre: big number, the tiny "/12" (nil until half booked), and the word under it.
    static func center(total: Int, left: Int) -> Center {
        let (n, l) = clamp(total, left)
        switch stage(total: n, left: l) {
        case .full: return Center(big: "\(n)", of: "/\(n)", small: "full")
        case .open: return Center(big: "\(n)", of: nil, small: "\(spots(n)) open")
        case .going: return Center(big: "\(n - l)", of: nil, small: "going")
        case .filling: return Center(big: "\(l)", of: "/\(n)", small: "\(spots(l)) left")
        }
    }

    /// Worth an urgency line only once half the spots are gone.
    static func scarce(total: Int?, left: Int?) -> Bool {
        guard let total, total > 0, let left else { return false }
        return stage(total: total, left: left) == .filling
    }
}
