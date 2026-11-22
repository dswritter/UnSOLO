import Foundation

// Models for the endpoints the Android app picked up first (docs/revamp/api-v1.md):
// 24-hour stories, profile details, leaderboard, invites, offers, places, people and poll votes.
// Everything the server may leave out is optional so older or newer servers still decode.

// MARK: - 24-hour stories (GET /statuses)

struct StatusItem: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var type: String?
    var media: Media?
    var caption: String?
    var linkUrl: String?
    var bgColor: String?
    var createdAt: Date
    var expiresAt: Date
    var seen: Bool?
    var reactions: [String: Int]?
    var myReaction: String?
    var commentCount: Int?

    var isImage: Bool { (type ?? "image") == "image" && media != nil }
    var isSeen: Bool { seen ?? false }
    var totalReactions: Int { (reactions ?? [:]).values.reduce(0, +) }
}

struct StatusAuthor: Codable, Hashable, Sendable, Identifiable {
    var user: UserLite
    @DefaultEmpty var items: [StatusItem]
    var unseen: Bool?
    var latestAt: Date?
    var id: String { user.id }
    var seenCount: Int { items.filter(\.isSeen).count }
}

struct StatusesResponse: Codable, Sendable { @DefaultEmpty var authors: [StatusAuthor] }
struct StatusMediaRef: Codable, Sendable, Equatable { var url: String }
struct CreateStatusBody: Codable, Sendable, Equatable { var media: [StatusMediaRef]; var caption: String?; var audience: String }
struct SeenStatusesBody: Codable, Sendable { var ids: [String] }
struct StatusReactionBody: Codable, Sendable {
    var kind: String?
    // Always send the key: `null` takes the reaction back.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind, forKey: .kind)
    }
    enum CodingKeys: String, CodingKey { case kind }
}
struct StatusReactionResponse: Codable, Sendable { var reactions: [String: Int]?; var myReaction: String? }
struct StatusComment: Codable, Hashable, Sendable, Identifiable { var id: String; var body: String; var createdAt: Date?; var author: UserLite }
struct StatusCommentsResponse: Codable, Sendable { @DefaultEmpty var items: [StatusComment] }
struct StatusCommentBody: Codable, Sendable { var body: String }

/// Story reactions: "Take me there" (a traveller's love) first.
enum StoryReaction {
    static let all: [(key: String, emoji: String)] = [
        ("wanderlust", "🏔️"), ("love", "❤️"), ("wow", "😮"), ("haha", "😂"), ("clap", "👏"), ("fire", "🔥"),
    ]
    static func emoji(_ k: String?) -> String? { all.first { $0.key == k }?.emoji }
    static func label(_ k: String) -> String {
        switch k {
        case "wanderlust": "Take me there"
        case "love": "Love"
        case "wow": "Wow"
        case "haha": "Haha"
        case "clap": "Clap"
        default: "Fire"
        }
    }
}

// MARK: - Places and people

/// `GET /places?q=`: a suggestion for the place field (`detail` is the state or district).
struct PlaceHit: Codable, Hashable, Sendable, Identifiable {
    var name: String
    var slug: String?
    var lat: Double?
    var lng: Double?
    var detail: String?
    var id: String { (slug ?? "") + "|" + name }
    var place: Place { Place(name: name, slug: slug, lat: lat, lng: lng) }
}
struct PlacesResponse: Codable, Sendable { @DefaultEmpty var items: [PlaceHit] }
struct PeopleResponse: Codable, Sendable { @DefaultEmpty var items: [UserLite] }
struct UserListResponse: Codable, Sendable { @DefaultEmpty var items: [UserLite] }

// MARK: - Polls (PUT /posts/{id}/vote)

struct VoteBody: Codable, Sendable {
    var choice: String?
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(choice, forKey: .choice)
    }
    enum CodingKeys: String, CodingKey { case choice }
}
struct VoteResponse: Codable, Sendable { var poll: Poll }

extension Poll {
    /// Your vote moved to `choice` (nil = taken back), counts adjusted locally until the server answers.
    func moved(to choice: String?) -> Poll {
        var p = self
        p.options = options.map { o in
            var o = o
            o.votes = max(0, o.votes - (o.id == myChoice ? 1 : 0) + (o.id == choice ? 1 : 0))
            return o
        }
        p.myChoice = choice
        return p
    }
}

// MARK: - Profile details (GET /users/{username})

struct ProfileTier: Codable, Hashable, Sendable {
    var name: String?
    var next: String?
    var pointsToNext: Int?
    var percent: Int?
}

struct ProfileStats: Codable, Hashable, Sendable {
    /// nil when they keep it private.
    var trips: Int?
    var states: Int?
    var reviews: Int?
    var listings: Int?
    var points: Int?
    var rank: Int?
    var tier: ProfileTier?
}

/// `number` only when they made it public or approved your request; otherwise `masked`.
struct ProfilePhone: Codable, Hashable, Sendable {
    var number: String?
    var masked: String?
    var request: String?
    var canRequest: Bool?
}

struct ProfileTripRef: Codable, Hashable, Sendable { var title: String; var slug: String?; var date: String? }
struct ProfileTravel: Codable, Hashable, Sendable {
    /// nil = private.
    var states: [String]?
    var trips: [ProfileTripRef]?
    var mutualPlaces: [String]?
}
struct Badge: Codable, Hashable, Sendable, Identifiable {
    var key: String
    var name: String
    var description: String?
    var icon: String?
    var id: String { key }
}
struct ProfileBadges: Codable, Hashable, Sendable { var earned: [Badge]?; var next: [Badge]?; var total: Int? }
struct ProfileReview: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var rating: Int?
    var body: String?
    var createdAt: Date?
    var subject: String?
    var slug: String?
    var reviewer: UserLite?
}
struct ProfileHost: Codable, Hashable, Sendable {
    var travellerCount: Int?
    var travellers: [UserLite]?
    var reviews: [ProfileReview]?
    var reviewTotal: Int?
    var reviewAverage: Double?
    var reachedOut: [UserLite]?
}
struct SharedRef: Codable, Hashable, Sendable { var title: String; var path: String; var kind: String?; var hostedByThem: Bool? }
struct RoomRef: Codable, Hashable, Sendable { var id: String; var name: String }
struct ProfileConnections: Codable, Hashable, Sendable {
    var mutual: [UserLite]?
    var mutualCount: Int?
    var rooms: [RoomRef]?
    var shared: [SharedRef]?
}

struct FollowResponse: Codable, Sendable { var isFollowing: Bool; var followers: Int?; var following: Int? }
struct PhoneRequestItem: Codable, Hashable, Sendable, Identifiable { var id: String; var createdAt: Date?; var user: UserLite }
struct PhoneRequestsResponse: Codable, Sendable { @DefaultEmpty var items: [PhoneRequestItem] }
struct PhoneRequestDecisionBody: Codable, Sendable { var approve: Bool }

// MARK: - Leaderboard

struct LeaderEntry: Codable, Hashable, Sendable {
    var rank: Int?
    var user: UserLite
    var location: String?
    var points: Int?
    var trips: Int?
    var reviews: Int?
    var states: Int?
    var monthlyTrips: Int?
}
struct LeaderMe: Codable, Hashable, Sendable { var rank: Int?; var entry: LeaderEntry? }
struct LeaderboardResponse: Codable, Sendable {
    @DefaultEmpty var entries: [LeaderEntry]
    @DefaultEmpty var monthly: [LeaderEntry]
    var me: LeaderMe?
}

// MARK: - Invites and offers

struct ReferralPerson: Codable, Hashable, Sendable {
    var username: String?
    var name: String?
    var avatarUrl: String?
    var status: String?
}
struct ReferralsResponse: Codable, Sendable {
    var code: String?
    var link: String?
    var creditsPaise: Int?
    var total: Int?
    var pending: Int?
    var credited: Int?
    @DefaultEmpty var people: [ReferralPerson]
}

struct OfferItem: Codable, Hashable, Sendable {
    var id: String?
    var name: String?
    var label: String?
    var type: String?
    var promoCode: String?
    var validUntil: String?
}
struct OfferLink: Codable, Hashable, Sendable { var label: String?; var path: String? }
struct OfferCombo: Codable, Hashable, Sendable {
    var id: String?
    var title: String?
    var subtitle: String?
    var primary: OfferLink?
    var secondary: OfferLink?
}
struct OfferSection: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var title: String?
    var subtitle: String?
    var badge: String?
    @DefaultEmpty var offers: [OfferItem]
    @DefaultEmpty var combos: [OfferCombo]
}
struct OffersResponse: Codable, Sendable { @DefaultEmpty var sections: [OfferSection] }

// MARK: - PATCH /me (extended)

/// Only the fields that changed are sent (nil keys are left out).
struct ProfilePatch: Codable, Sendable, Equatable {
    var name: String?
    var username: String?
    var bio: String?
    var statusText: String?
    var statusVisibility: String?
    var location: String?
    var instagram: String?
    var website: String?
    var avatarUrl: String?
    var dateOfBirth: String?
    var tripsPrivate: Bool?
    var statesPrivate: Bool?
    var phonePublic: Bool?

    var isEmpty: Bool { self == ProfilePatch() }
}
