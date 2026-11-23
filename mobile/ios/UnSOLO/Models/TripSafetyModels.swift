import Foundation

// Trip safety, alerts and maps (docs/revamp/api-v1.md, migration 124).

// MARK: - SOS

struct SosTrip: Codable, Hashable, Sendable { var bookingId: String?; var title: String; var slug: String?; var start: String?; var end: String? }
struct EmergencyContact: Codable, Hashable, Sendable { var name: String?; var phone: String }
struct SosStatus: Codable, Sendable {
    var onTrip: Bool
    @DefaultEmpty var trips: [SosTrip]
    var emergencyContact: EmergencyContact?
    var supportWhatsapp: String?
}
struct SosBody: Codable, Sendable { var lat: Double?; var lng: Double?; var accuracy: Double?; var note: String?; var bookingId: String? }
struct SosUpdateBody: Codable, Sendable { var lat: Double?; var lng: Double?; var accuracy: Double?; var status: String? }
struct SosHost: Codable, Hashable, Sendable { var name: String?; var phone: String? }
struct SosAlert: Codable, Sendable {
    struct TripRef: Codable, Sendable { var title: String; var slug: String? }
    var id: String
    var notified: [String: String]?
    var trip: TripRef?
    var host: SosHost?
    var emergencyContact: EmergencyContact?
    var supportWhatsapp: String?
    var message: String?
}

// MARK: - Live location in trip groups

struct LiveLocation: Codable, Hashable, Sendable, Identifiable {
    var user: UserLite
    var lat: Double
    var lng: Double
    var accuracy: Double?
    var startedAt: Date?
    var updatedAt: Date?
    var expiresAt: Date?
    var mine: Bool?
    var id: String { user.id }
}
struct LiveLocationsResponse: Codable, Sendable { @DefaultEmpty var items: [LiveLocation] }
struct LiveLocationBody: Codable, Sendable { var lat: Double; var lng: Double; var accuracy: Double?; var minutes: Int? }

// MARK: - Saved trips, buddies, map

struct SavedTripsResponse: Codable, Sendable { @DefaultEmpty var slugs: [String] }
struct SavedTripsBody: Codable, Sendable { var slugs: [String] }

struct Buddy: Codable, Hashable, Sendable, Identifiable {
    struct TripRef: Codable, Hashable, Sendable { var slug: String; var title: String }
    var user: UserLite
    var score: Int?
    @DefaultEmpty var reasons: [String]
    var trip: TripRef?
    var planId: String?
    var id: String { user.id }
}
struct BuddiesResponse: Codable, Sendable { @DefaultEmpty var items: [Buddy] }

struct MapPin: Codable, Hashable, Sendable, Identifiable {
    var kind: String
    var id: String
    var slug: String?
    var postId: String?
    var title: String
    var place: String?
    var lat: Double
    var lng: Double
    var priceFromPaise: Int?
    var unit: String?
    var date: String?
    var seatsLeft: Int?
    var seatsTotal: Int?
    var spotsLeft: Int?
    var spotsTotal: Int?
    var image: Media?
    /// A trip whose dates have all passed (date and seatsLeft are null): grey pin, "Ask for dates".
    var past: Bool?
    var isPast: Bool { past == true }
}
struct MapPinsResponse: Codable, Sendable { @DefaultEmpty var pins: [MapPin] }

// MARK: - Reviews

struct ReviewBody: Codable, Sendable {
    var bookingId: String
    var ratingDestination: Int
    var ratingExperience: Int
    var title: String?
    var body: String?
    var photos: [String]
}
struct ReviewCreated: Codable, Sendable { var id: String }
struct TripReview: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var rating: Int?
    var title: String?
    var body: String?
    @DefaultEmpty var photos: [Media]
    var createdAt: Date?
    var author: UserLite?
}

// MARK: - Offline trip pack

struct Helpline: Codable, Hashable, Sendable { var label: String; var phone: String }
struct TripPack: Codable, Sendable {
    struct Host: Codable, Sendable { var user: UserLite?; var phone: String? }
    struct Support: Codable, Sendable { var whatsapp: String?; var email: String? }
    var bookingId: String
    var status: String?
    var confirmationCode: String?
    var guests: Int?
    var startDate: String?
    var endDate: String?
    var departureTime: String?
    var returnTime: String?
    var totalPaise: Int?
    var paidPaise: Int?
    var balancePaise: Int?
    var specialRequests: String?
    var trip: TripLite?
    var description: String?
    @DefaultEmpty var includes: [String]
    var cancellationPolicy: String?
    var host: Host?
    @DefaultEmpty var travellers: [UserLite]
    var chatRoomId: String?
    var support: Support?
    @DefaultEmpty var helplines: [Helpline]
    var generatedAt: Date?
}

struct EmergencyPatch: Codable, Sendable { var emergencyName: String?; var emergencyPhone: String? }
