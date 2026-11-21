import Foundation

// Models mirror docs/revamp/api-v1.md ("Shared models"). Keys are camelCase on the wire,
// so the synthesized Codable keys match. Optional contract fields are Swift optionals;
// arrays that the server may omit use @DefaultEmpty so a missing key decodes as [].

struct UserLite: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var username: String
    var name: String
    var avatarUrl: String?
    var isPhoneVerified: Bool
    var isIdVerified: Bool
    var isHost: Bool

    var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map { String($0) }.joined()
        return letters.isEmpty ? String(username.prefix(2)).uppercased() : letters.uppercased()
    }
    var firstName: String { name.split(separator: " ").first.map(String.init) ?? name }
}

struct Media: Codable, Hashable, Sendable {
    var url: String
    var thumbUrl: String?
    var lqip: String?
    var width: Int?
    var height: Int?
}

struct Place: Codable, Hashable, Sendable {
    var name: String
    var slug: String?
    var lat: Double?
    var lng: Double?
}

enum SeatState: String, Codable, Sendable {
    case organiser, host, member, you, requested, held, open
}

struct Seat: Codable, Hashable, Sendable {
    var state: SeatState
    var user: UserLite?
}

struct TripLite: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var slug: String
    var title: String
    var place: Place?
    var image: Media?
    var priceFromPaise: Int
    var durationDays: Int
    var nextDeparture: String?
    var seatsLeft: Int?
    var seatsTotal: Int?
    var host: UserLite?
    @DefaultEmpty var goingFaces: [UserLite]
}

struct Departure: Codable, Hashable, Sendable {
    var date: String
    var seatsLeft: Int
    var seatsTotal: Int
}

struct Rating: Codable, Hashable, Sendable {
    var avg: Double
    var count: Int
}

/// `GET /trips/{slug}`: TripLite & { description, includes, images, departures, seats, rating, stories, planningCount }.
struct TripDetail: Codable, Hashable, Sendable {
    var id: String
    var slug: String
    var title: String
    var place: Place?
    var image: Media?
    var priceFromPaise: Int
    var durationDays: Int
    var nextDeparture: String?
    var seatsLeft: Int?
    var seatsTotal: Int?
    var host: UserLite?
    @DefaultEmpty var goingFaces: [UserLite]
    var description: String?
    @DefaultEmpty var includes: [String]
    @DefaultEmpty var images: [Media]
    @DefaultEmpty var departures: [Departure]
    @DefaultEmpty var seats: [Seat]
    var rating: Rating?
    @DefaultEmpty var stories: [Post]
    var planningCount: Int?

    var lite: TripLite {
        TripLite(id: id, slug: slug, title: title, place: place, image: image, priceFromPaise: priceFromPaise,
                 durationDays: durationDays, nextDeparture: nextDeparture, seatsLeft: seatsLeft,
                 seatsTotal: seatsTotal, host: host, goingFaces: goingFaces)
    }
}

enum PostKind: String, Codable, Sendable, CaseIterable {
    case plan, story, ask
    var label: String {
        switch self {
        case .plan: "Plan"
        case .story: "Story"
        case .ask: "Ask"
        }
    }
}

enum Audience: String, Codable, Sendable, CaseIterable {
    case anyone, women, verified
    var label: String {
        switch self {
        case .anyone: "Anyone"
        case .women: "Women only"
        case .verified: "Verified travellers"
        }
    }
}

enum PostStatus: String, Codable, Sendable {
    case live, held, hidden, removed, cancelled, past
}

enum ReactionKind: String, Codable, Sendable, CaseIterable {
    case wantToGo = "want_to_go"
    case helpful
    case love

    var label: String {
        switch self {
        case .wantToGo: "Want to go"
        case .helpful: "Helpful"
        case .love: "Love"
        }
    }
    var symbol: String {
        switch self {
        case .wantToGo: "mappin.and.ellipse"
        case .helpful: "lightbulb"
        case .love: "heart"
        }
    }
}

struct PollOption: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var label: String
    var votes: Int
}

struct Poll: Codable, Hashable, Sendable {
    var options: [PollOption]
    var myChoice: String?
    var totalVotes: Int { options.reduce(0) { $0 + $1.votes } }
}

struct Reactions: Codable, Hashable, Sendable {
    var wantToGo: Int
    var helpful: Int
    var love: Int

    subscript(kind: ReactionKind) -> Int {
        get {
            switch kind {
            case .wantToGo: wantToGo
            case .helpful: helpful
            case .love: love
            }
        }
        set {
            switch kind {
            case .wantToGo: wantToGo = newValue
            case .helpful: helpful = newValue
            case .love: love = newValue
            }
        }
    }
    static let zero = Reactions(wantToGo: 0, helpful: 0, love: 0)
}

enum Membership: String, Codable, Sendable {
    case requested, approved, declined, withdrawn, expired
}

enum JoinBlockedReason: String, Codable, Sendable {
    case full
    case womenOnly = "women_only"
    case verifiedOnly = "verified_only"
    case ownPlan = "own_plan"
    case phoneRequired = "phone_required"

    var message: String {
        switch self {
        case .full: "This plan is full"
        case .womenOnly: "Women-only plan"
        case .verifiedOnly: "Verified travellers only"
        case .ownPlan: "This is your plan"
        case .phoneRequired: "Verify your phone to join"
        }
    }
}

struct Viewer: Codable, Hashable, Sendable {
    var isAuthor: Bool
    var membership: Membership?
    var saved: Bool
    var canJoin: Bool
    var joinBlockedReason: JoinBlockedReason?

    static let guest = Viewer(isAuthor: false, membership: nil, saved: false, canJoin: true, joinBlockedReason: nil)
}

struct Post: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var kind: PostKind
    var author: UserLite
    var title: String?
    var body: String
    var place: Place?
    var startsOn: String?
    var endsOn: String?
    var spotsTotal: Int?
    var memberCount: Int
    var audience: Audience
    var estCostText: String?
    @DefaultEmpty var media: [Media]
    var trip: TripLite?
    var poll: Poll?
    var reactions: Reactions
    @DefaultEmpty var myReactions: [ReactionKind]
    var commentCount: Int
    var status: PostStatus
    @DefaultEmpty var seats: [Seat]
    var createdAt: Date
    var updatedAt: Date
    var viewer: Viewer?
    var meetingPoint: String?

    var displayTitle: String { title ?? String(body.prefix(80)) }
    var openSpots: Int {
        guard let total = spotsTotal else { return 0 }
        return max(0, total - memberCount)
    }
    var isLocal: Bool { id.hasPrefix(LocalID.prefix) }
}

enum LocalID {
    static let prefix = "local-"
    static func post(clientId: String) -> String { prefix + clientId }
}

/// `/feed` items are Posts, plus about 1 in 8 placed hosted-trip cards (`kind: "placed_trip"`).
enum FeedItem: Codable, Hashable, Sendable, Identifiable {
    case post(Post)
    case placedTrip(TripLite)

    var id: String {
        switch self {
        case .post(let p): "post:\(p.id)"
        case .placedTrip(let t): "trip:\(t.id)"
        }
    }

    private enum CodingKeys: String, CodingKey { case kind, trip }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        if kind == "placed_trip" {
            self = .placedTrip(try c.decode(TripLite.self, forKey: .trip))
        } else {
            self = .post(try Post(from: decoder))
        }
    }

    func encode(to encoder: Encoder) throws {
        switch self {
        case .post(let p): try p.encode(to: encoder)
        case .placedTrip(let t):
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode("placed_trip", forKey: .kind)
            try c.encode(t, forKey: .trip)
        }
    }
}

struct Comment: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var postId: String
    var parentId: String?
    var author: UserLite
    var body: String
    var pollChoice: String?
    var createdAt: Date
    @DefaultEmpty var replies: [Comment]
}

enum OfferState: String, Codable, Sendable {
    case pending, accepted, declined, expired, withdrawn
}

struct HostOffer: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var postId: String
    var host: UserLite
    var pricePaise: Int
    var includes: [String]
    var notes: String?
    var extraSeats: Int
    var state: OfferState
    var expiresAt: Date
    var packageSlug: String?
    var payBy: Date?
}

struct Booking: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var status: String
    var travelDate: String
    var guests: Int
    var totalPaise: Int
    var paidPaise: Int
    var balancePaise: Int
    var confirmationCode: String?
    var trip: TripLite
    var chatRoomId: String?
    var storyPrompt: Bool?
}

enum NotificationCategory: String, Codable, Sendable, CaseIterable {
    case plans, replies, messages, trips, tags, system
}

struct AppNotification: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var type: String
    var category: NotificationCategory
    var title: String
    var body: String?
    var link: String?
    var isRead: Bool
    var createdAt: Date
    /// Tribe events only (e.g. "tribe_join_request"): the plan and the user who acted, for inline actions.
    var postId: String?
    var actorId: String?

    static let joinRequestTypes: Set<String> = ["tribe_join_request", "join_request"]
    var isJoinRequest: Bool { Self.joinRequestTypes.contains(type) }
    /// Inline Approve/Decline is possible when the row names the plan and the requester.
    var inlineDecision: (postId: String, userId: String)? {
        guard isJoinRequest, let postId, let actorId, DeepLink.isUUID(postId), DeepLink.isUUID(actorId) else { return nil }
        return (postId.lowercased(), actorId.lowercased())
    }
}

enum LandingTab: String, Codable, Sendable, CaseIterable {
    case explore, tribe, trips
    var label: String {
        switch self {
        case .explore: "Explore"
        case .tribe: "Tribe"
        case .trips: "My trips"
        }
    }
}

struct NotifyChannel: Codable, Hashable, Sendable {
    var plans: Bool
    var replies: Bool
    var messages: Bool
    var trips: Bool
    var tags: Bool
    var marketing: Bool

    static let defaults = NotifyChannel(plans: true, replies: true, messages: true, trips: true, tags: true, marketing: false)
}

struct QuietHours: Codable, Hashable, Sendable {
    var from: String
    var to: String
}

struct NotifyPrefs: Codable, Hashable, Sendable {
    var push: NotifyChannel
    var email: NotifyChannel?
    var quietHours: QuietHours?
}

struct Preferences: Codable, Hashable, Sendable {
    var landingTab: LandingTab
    var notify: NotifyPrefs
    @DefaultEmpty var interests: [String]
    var suggestByLocation: Bool
    var suggestByGender: Bool
    var shareLocation: Bool
    var dataSaver: Bool

    static let defaults = Preferences(
        landingTab: .explore,
        notify: NotifyPrefs(push: .defaults, email: .defaults, quietHours: QuietHours(from: "22:00", to: "07:00")),
        interests: [], suggestByLocation: false, suggestByGender: false, shareLocation: false, dataSaver: false)
}

// MARK: - Responses

struct Page<T: Codable & Sendable>: Codable, Sendable {
    var items: [T]
    var nextCursor: String?
}

struct ConfigResponse: Codable, Sendable {
    struct Flags: Codable, Sendable {
        var tribeEnabled: Bool
        var tribePostingEnabled: Bool
        var hostOffersEnabled: Bool
        var pushEnabled: Bool
    }
    struct MinVersion: Codable, Sendable { var android: String; var ios: String }
    struct Supabase: Codable, Sendable { var url: String; var anonKey: String }
    struct Upload: Codable, Sendable { var maxBytes: Int; var maxEdge: Int }
    struct Support: Codable, Sendable { var whatsapp: String?; var email: String? }
    var flags: Flags
    var minAppVersion: MinVersion
    var supabase: Supabase
    var upload: Upload
    var support: Support?
}

struct MeUser: Codable, Hashable, Sendable {
    var id: String
    var username: String
    var name: String
    var avatarUrl: String?
    var isPhoneVerified: Bool
    var isIdVerified: Bool
    var isHost: Bool
    var email: String?
    var phone: String?
    var gender: String?
    var homeCity: String?
    var bio: String?
    var dateOfBirth: String?

    var lite: UserLite {
        UserLite(id: id, username: username, name: name, avatarUrl: avatarUrl, isPhoneVerified: isPhoneVerified,
                 isIdVerified: isIdVerified, isHost: isHost)
    }
}

struct MeResponse: Codable, Sendable {
    struct Counts: Codable, Sendable { var unreadNotifications: Int; var unreadMessages: Int }
    var user: MeUser
    var role: String?
    var isStaff: Bool
    /// A confirmed email or a verified phone (nil from older servers: fall back to the phone).
    var canParticipate: Bool?
    var preferences: Preferences
    var counts: Counts
}

struct LandingSuggestion: Codable, Sendable, Equatable {
    struct Visits: Codable, Sendable, Equatable { var explore: Int; var tribe: Int; var trips: Int }
    var suggest: LandingTab?
    var visits: Visits
}

struct ExplorePage: Codable, Sendable {
    var items: [TripLite]
    var nextCursor: String?
}

struct MyTripsResponse: Codable, Sendable {
    var upcoming: [Booking]
    var plans: [Post]
    var requested: [Post]
    var past: [Booking]
    static let empty = MyTripsResponse(upcoming: [], plans: [], requested: [], past: [])
}

struct FeedResponse: Codable, Sendable {
    var items: [FeedItem]
    var nextCursor: String?
    var caughtUp: Bool
    @DefaultEmpty var nextDepartures: [TripLite]
}

struct CreatePostResponse: Codable, Sendable {
    struct Moderation: Codable, Sendable {
        var state: String
        @DefaultEmpty var prompts: [String]
    }
    var post: Post
    var moderation: Moderation
}

struct PostDetailResponse: Codable, Sendable {
    var post: Post
    @DefaultEmpty var comments: [Comment]
    @DefaultEmpty var offers: [HostOffer]
}

struct ReactionsResponse: Codable, Sendable {
    var reactions: Reactions
    var myReactions: [ReactionKind]
}

struct JoinResponse: Codable, Sendable {
    var membership: Membership
    var expiresAt: Date?
}

struct JoinRequestUser: Codable, Hashable, Sendable {
    var id: String
    var username: String
    var name: String
    var avatarUrl: String?
    var isPhoneVerified: Bool
    var isIdVerified: Bool
    var isHost: Bool
    var tripsCount: Int?
    var reviewsAvg: Double?
    var mutuals: Int?

    var lite: UserLite {
        UserLite(id: id, username: username, name: name, avatarUrl: avatarUrl, isPhoneVerified: isPhoneVerified,
                 isIdVerified: isIdVerified, isHost: isHost)
    }
}

struct JoinRequest: Codable, Hashable, Sendable {
    var user: JoinRequestUser
    var intro: String
    var state: Membership
    var createdAt: Date
    var expiresAt: Date?
}

struct JoinRequestsResponse: Codable, Sendable { var items: [JoinRequest] }
struct DecisionResponse: Codable, Sendable { var state: Membership }
struct AcceptOfferResponse: Codable, Sendable { var packageSlug: String; var payBy: Date? }

struct ProfileUser: Codable, Hashable, Sendable {
    var id: String
    var username: String
    var name: String
    var avatarUrl: String?
    var isPhoneVerified: Bool
    var isIdVerified: Bool
    var isHost: Bool
    var bio: String?
    var homeCity: String?
    var tripsCount: Int
    var followers: Int
    var following: Int

    var lite: UserLite {
        UserLite(id: id, username: username, name: name, avatarUrl: avatarUrl, isPhoneVerified: isPhoneVerified,
                 isIdVerified: isIdVerified, isHost: isHost)
    }
}

struct ProfileResponse: Codable, Sendable {
    var user: ProfileUser
    @DefaultEmpty var posts: [Post]
    var openPlan: Post?
    var isFollowing: Bool
}

struct Suggestion: Codable, Hashable, Sendable, Identifiable {
    var type: String
    var reason: String
    var post: Post?
    var trip: TripLite?
    var id: String { (post?.id ?? trip?.id ?? UUID().uuidString) + reason }
}

struct SuggestionsResponse: Codable, Sendable { var items: [Suggestion] }

struct ChatSummary: Codable, Hashable, Sendable, Identifiable {
    struct LastMessage: Codable, Hashable, Sendable { var body: String; var at: Date; var authorName: String? }
    var id: String
    var type: String
    var name: String
    var image: Media?
    var lastMessage: LastMessage?
    var unread: Int
    var isRequest: Bool
}

struct ChatMessage: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var clientId: String?
    var author: UserLite
    var body: String
    var type: String
    var createdAt: Date
    var editedAt: Date?
}

struct MessagesResponse: Codable, Sendable {
    var items: [ChatMessage]
    var hasMore: Bool
}

struct DirectChatResponse: Codable, Sendable { var roomId: String }

struct NotificationsResponse: Codable, Sendable {
    var items: [AppNotification]
    var nextCursor: String?
    var unread: Int
}

struct SyncResponse: Codable, Sendable {
    struct MembershipChange: Codable, Hashable, Sendable { var postId: String; var state: Membership }
    var serverTime: Date
    @DefaultEmpty var posts: [String]
    @DefaultEmpty var removedPosts: [String]
    var notifications: Int?
    var unreadNotifications: Int?
    @DefaultEmpty var memberships: [MembershipChange]
}

struct UploadResponse: Codable, Sendable {
    var url: String
    var thumbUrl: String?
    var lqip: String?
    var width: Int?
    var height: Int?
    var bytes: Int?
    var media: Media { Media(url: url, thumbUrl: thumbUrl, lqip: lqip, width: width, height: height) }
}

struct PhoneStartResponse: Codable, Sendable { var sent: Bool; var devCode: String? }
struct PhoneVerifyResponse: Codable, Sendable { var verified: Bool }
struct ReportResponse: Codable, Sendable { var id: String }

// MARK: - Supabase Auth

struct SupabaseSession: Codable, Sendable, Equatable {
    var accessToken: String
    var refreshToken: String
    var expiresIn: Int?
    var expiresAt: Int?
    var tokenType: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case expiresAt = "expires_at"
        case tokenType = "token_type"
    }
}

// MARK: - DefaultEmpty

@propertyWrapper
struct DefaultEmpty<T: Codable & Hashable & Sendable>: Codable, Hashable, Sendable {
    var wrappedValue: [T]
    init(wrappedValue: [T]) { self.wrappedValue = wrappedValue }
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        wrappedValue = c.decodeNil() ? [] : try c.decode([T].self)
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(wrappedValue)
    }
}

extension KeyedDecodingContainer {
    func decode<T>(_ type: DefaultEmpty<T>.Type, forKey key: Key) throws -> DefaultEmpty<T> {
        try decodeIfPresent(type, forKey: key) ?? DefaultEmpty(wrappedValue: [])
    }
}

// MARK: - JSON coding

enum JSON {
    static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            if let date = ISODate.parse(s) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Bad ISO-8601 date: \(s)")
        }
        return d
    }

    static func encoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(ISODate.format(date))
        }
        return e
    }
}

enum ISODate {
    static func parse(_ s: String) -> Date? {
        if let d = try? Date(s, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) { return d }
        if let d = try? Date(s, strategy: Date.ISO8601FormatStyle()) { return d }
        // Postgres style "+00:00" offsets are covered above; plain dates fall back to midnight UTC.
        if let d = try? Date(s, strategy: Date.ISO8601FormatStyle().year().month().day()) { return d }
        return nil
    }
    static func format(_ d: Date) -> String {
        d.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }
}
