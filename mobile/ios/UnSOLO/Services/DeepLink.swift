import Foundation

/// Routes the app can open from a universal link (https://unsolo.in/...), a `unsolo://` URL, a push `link`
/// or a notification row. Every parameter is validated before routing; anything else is ignored.
enum DeepLink: Equatable, Hashable, Sendable {
    case tribe
    case post(id: String)
    case trip(slug: String)
    case bookings
    case profile(username: String)
    case chat(roomId: String)
    case explore
    case editProfile
    case leaderboard
    case referrals
    case offers

    static let allowedHosts: Set<String> = ["unsolo.in", "www.unsolo.in"]

    static func parse(_ url: URL) -> DeepLink? {
        switch url.scheme?.lowercased() {
        case "https":
            guard let host = url.host?.lowercased(), allowedHosts.contains(host) else { return nil }
            return parse(path: url.path)
        case "unsolo":
            // unsolo://tribe/p/<id>  (host is the first segment) or unsolo:///tribe/p/<id>
            var segments: [String] = []
            if let host = url.host, !host.isEmpty { segments.append(host) }
            segments += url.path.split(separator: "/").map(String.init)
            return parse(segments: segments)
        default:
            return nil
        }
    }

    /// Internal paths from notifications, e.g. "/tribe/p/<id>".
    static func parse(path: String) -> DeepLink? {
        let clean = path.split(separator: "?").first.map(String.init) ?? path
        return parse(segments: clean.split(separator: "/").map(String.init))
    }

    static func parse(segments raw: [String]) -> DeepLink? {
        let s = raw.filter { !$0.isEmpty }
        guard s.count <= 4 else { return nil }
        switch s.first {
        case "tribe":
            if s.count == 1 { return .tribe }
            if s.count == 3, s[1] == "p", isUUID(s[2]) { return .post(id: s[2].lowercased()) }
            return nil
        case "p":
            // Short share links: unsolo.in/p/<id>
            if s.count == 2, isUUID(s[1]) { return .post(id: s[1].lowercased()) }
            return nil
        case "packages":
            if s.count == 2, isSlug(s[1]) { return .trip(slug: s[1]) }
            return nil
        case "bookings":
            return s.count == 1 ? .bookings : nil
        case "profile":
            if s.count == 2, s[1] == "edit" { return .editProfile }
            if s.count == 2, isUsername(s[1]) { return .profile(username: s[1]) }
            return nil
        case "chat":
            if s.count == 2, isUUID(s[1]) { return .chat(roomId: s[1].lowercased()) }
            return nil
        case "listings":
            // Stays, activities and rentals open the same native page as trips.
            if s.count == 3, ["stays", "activities", "rentals"].contains(s[1]), isSlug(s[2]) { return .trip(slug: s[2]) }
            return nil
        case "leaderboard": return s.count == 1 ? .leaderboard : nil
        case "referrals": return s.count == 1 ? .referrals : nil
        case "offers": return s.count == 1 ? .offers : nil
        case "explore", nil:
            return s.count <= 1 ? .explore : nil
        default:
            return nil
        }
    }

    /// Notification / push `link`s are only followed when they are same-site paths: they start with "/" but not
    /// "//" or "/\\" (protocol-relative or backslash tricks), and contain no whitespace or control characters.
    static func isSameSitePath(_ link: String) -> Bool {
        guard link.hasPrefix("/"), !link.hasPrefix("//"), !link.hasPrefix("/\\") else { return false }
        let banned = CharacterSet.whitespacesAndNewlines.union(.controlCharacters).union(.illegalCharacters)
        return link.unicodeScalars.allSatisfy { !banned.contains($0) }
    }

    /// Route for a notification or push link: a known same-site path, else nil (callers open Activity).
    static func notificationRoute(_ link: String?) -> DeepLink? {
        guard let link, isSameSitePath(link) else { return nil }
        return parse(path: link)
    }

    static func isUUID(_ s: String) -> Bool { UUID(uuidString: s) != nil }
    static func isSlug(_ s: String) -> Bool { s.range(of: #"^[a-z0-9]+(?:-[a-z0-9]+)*$"#, options: .regularExpression) != nil && s.count <= 120 }
    static func isUsername(_ s: String) -> Bool { s.range(of: #"^[A-Za-z0-9_.]{2,32}$"#, options: .regularExpression) != nil }

    /// Canonical web URL, used for sharing.
    var webURL: URL {
        let base = "https://unsolo.in"
        switch self {
        case .tribe: return URL(string: "\(base)/tribe")!
        case .post(let id): return URL(string: "\(base)/tribe/p/\(id)")!
        case .trip(let slug): return URL(string: "\(base)/packages/\(slug)")!
        case .bookings: return URL(string: "\(base)/bookings")!
        case .profile(let u): return URL(string: "\(base)/profile/\(u)")!
        case .chat(let r): return URL(string: "\(base)/chat/\(r)")!
        case .explore: return URL(string: base)!
        case .editProfile: return URL(string: "\(base)/profile/edit")!
        case .leaderboard: return URL(string: "\(base)/leaderboard")!
        case .referrals: return URL(string: "\(base)/referrals")!
        case .offers: return URL(string: "\(base)/offers")!
        }
    }
}
