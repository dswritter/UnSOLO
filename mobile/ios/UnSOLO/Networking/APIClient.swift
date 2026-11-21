import Foundation

enum HTTPMethod: String, Sendable, Codable {
    case get = "GET", post = "POST", put = "PUT", patch = "PATCH", delete = "DELETE"
}

/// `/api/v1` client. Adds the bearer token and client header, decodes camelCase JSON, maps error envelopes,
/// and on a 401 refreshes once (single-flight in AuthManager) and retries.
final class APIClient: Sendable {
    let transport: any HTTPTransport
    let baseURL: URL
    let auth: AuthManager

    init(transport: any HTTPTransport, baseURL: URL, auth: AuthManager) {
        self.transport = transport
        self.baseURL = baseURL
        self.auth = auth
    }

    func makeURL(_ path: String, query: [String: String?] = [:]) -> URL {
        var comps = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        let items = query.compactMap { k, v in v.map { URLQueryItem(name: k, value: $0) } }.sorted { $0.name < $1.name }
        if !items.isEmpty { comps.queryItems = items }
        return comps.url!
    }

    /// Raw send used by typed calls and by the outbox (which persists method/path/body).
    func send(_ method: HTTPMethod, _ path: String, query: [String: String?] = [:], body: Data? = nil,
              authenticated: Bool = true, extraHeaders: [String: String] = [:]) async throws -> (Data, HTTPURLResponse) {
        let token = authenticated ? await auth.accessToken : nil
        var (data, http) = try await perform(method, path, query: query, body: body, token: token, headers: extraHeaders)
        if http.statusCode == 401, authenticated, token != nil {
            let fresh = try await auth.refreshedToken(after: token)
            (data, http) = try await perform(method, path, query: query, body: body, token: fresh, headers: extraHeaders)
        }
        guard (200..<300).contains(http.statusCode) || http.statusCode == 304 else {
            throw APIError.from(status: http.statusCode, data: data, headers: http.allHeaderFields)
        }
        return (data, http)
    }

    private func perform(_ method: HTTPMethod, _ path: String, query: [String: String?], body: Data?, token: String?,
                         headers: [String: String]) async throws -> (Data, HTTPURLResponse) {
        var req = URLRequest(url: makeURL(path, query: query))
        req.httpMethod = method.rawValue
        req.setValue(AppInfo.clientHeader, forHTTPHeaderField: "X-UnSOLO-Client")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        // Caching follows the server's headers: public GETs carry ETag + Cache-Control and are revalidated
        // (If-None-Match → 304) by URLCache; private GETs are `no-store`. The cache is wiped on sign-out.
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        return try await transport.send(req)
    }

    func get<T: Decodable & Sendable>(_ path: String, query: [String: String?] = [:], authenticated: Bool = true) async throws -> T {
        let (data, _) = try await send(.get, path, query: query, authenticated: authenticated)
        return try decode(data)
    }

    func call<T: Decodable & Sendable>(_ method: HTTPMethod, _ path: String, body: (any Encodable & Sendable)? = nil) async throws -> T {
        let (data, _) = try await send(method, path, body: try body.map { try JSON.encoder().encode($0) })
        return try decode(data)
    }

    func callNoContent(_ method: HTTPMethod, _ path: String, body: (any Encodable & Sendable)? = nil) async throws {
        _ = try await send(method, path, body: try body.map { try JSON.encoder().encode($0) })
    }

    func decode<T: Decodable>(_ data: Data) throws -> T {
        do { return try JSON.decoder().decode(T.self, from: data) }
        catch { throw APIError.decoding(String(describing: error)) }
    }
}

// MARK: - Request bodies

struct CreatePostBody: Codable, Sendable {
    var clientId: String
    var kind: PostKind
    var title: String?
    var body: String
    var place: Place?
    var startsOn: String?
    var endsOn: String?
    var spotsTotal: Int?
    var audience: Audience?
    var estCostText: String?
    var meetingPoint: String?
    var tripPackageId: String?
    var showOnTripPage: Bool?
    var poll: [String]?
    var media: [Media]?
    var tagUserIds: [String]?
}

struct CommentBody: Codable, Sendable { var clientId: String; var body: String; var parentId: String?; var pollChoice: String? }
struct JoinBody: Codable, Sendable { var intro: String }
struct DecisionBody: Codable, Sendable { var decision: String }
struct OfferBody: Codable, Sendable { var pricePaise: Int; var includes: [String]; var notes: String?; var extraSeats: Int? }
struct AcceptOfferBody: Codable, Sendable, Equatable { var expectedPricePaise: Int }
struct MessageBody: Codable, Sendable { var clientId: String; var body: String }
struct DirectChatBody: Codable, Sendable { var userId: String }
struct ReportBody: Codable, Sendable { var targetType: String; var targetId: String; var reason: String; var details: String? }
struct BlockBody: Codable, Sendable { var userId: String }
struct NotificationsReadBody: Codable, Sendable { var ids: [String]?; var all: Bool? }
struct DeviceBody: Codable, Sendable { var platform: String; var token: String; var appVersion: String?; var locale: String? }
struct DeviceDeleteBody: Codable, Sendable { var token: String }
struct PhoneStartBody: Codable, Sendable { var phone: String }
struct PhoneAuthVerifyBody: Codable, Sendable { var challenge: String; var code: String }

/// `POST /auth/phone/start` → an opaque challenge (2factor.in SMS). `devCode` only from non-production servers without an SMS key.
struct PhoneAuthStart: Codable, Sendable, Equatable {
    var challenge: String
    var expiresIn: Int?
    var devCode: String?
}

/// Phone sign-in failures keep the server's message; `retryAfter` comes from `Retry-After` on 429.
struct PhoneAuthError: Error, LocalizedError, Equatable {
    var code: String
    var message: String
    var retryAfter: TimeInterval?
    var errorDescription: String? { message }

    static func from(status: Int, data: Data, headers: [AnyHashable: Any]) -> PhoneAuthError {
        let env = try? JSONDecoder().decode(ErrorEnvelope.self, from: data)
        let retry = (headers["Retry-After"] as? String).flatMap(TimeInterval.init)
        let fallback: String = switch status {
        case 401: "That code didn't work. Check it, or send a new one."
        case 429: "Too many tries. Wait a moment and try again."
        case 400: "Enter a valid 10-digit mobile number."
        default: "Something went wrong on our side. Try again."
        }
        return PhoneAuthError(code: env?.error.code ?? "server_error", message: env?.error.message ?? fallback,
                              retryAfter: status == 429 ? (retry ?? 30) : nil)
    }
}
struct PhoneVerifyBody: Codable, Sendable { var phone: String; var code: String }
struct PatchMeBody: Codable, Sendable {
    var name: String?; var bio: String?; var gender: String?; var homeCity: String?
    var homeLat: Double?; var homeLng: Double?; var dateOfBirth: String?
}

/// PUT /me/preferences accepts a partial object.
struct PreferencesPatch: Codable, Sendable {
    var landingTab: LandingTab?
    var notify: NotifyPrefs?
    var interests: [String]?
    var suggestByLocation: Bool?
    var suggestByGender: Bool?
    var shareLocation: Bool?
    var dataSaver: Bool?
}

struct AnalyticsEvent: Codable, Sendable, Equatable {
    var name: String
    var screen: String?
    var props: [String: String]?
    var ts: Date?
    var anonId: String?
    var sessionId: String?
}

struct EventsBody: Codable, Sendable { var events: [AnalyticsEvent] }
struct EmptyResponse: Codable, Sendable {}

// MARK: - Typed endpoints (docs/revamp/api-v1.md)

extension APIClient {
    func config() async throws -> ConfigResponse { try await get("/config", authenticated: false) }
    func me() async throws -> MeResponse { try await get("/me") }
    func patchMe(_ body: PatchMeBody) async throws -> MeResponse { try await call(.patch, "/me", body: body) }
    func preferences() async throws -> Preferences { try await get("/me/preferences") }
    func putPreferences(_ patch: PreferencesPatch) async throws -> Preferences { try await call(.put, "/me/preferences", body: patch) }
    func landingSuggestion() async throws -> LandingSuggestion { try await get("/me/landing-suggestion") }
    func dismissLandingSuggestion() async throws { try await callNoContent(.post, "/me/landing-suggestion/dismiss") }
    // MARK: Phone sign-in (our 2factor.in endpoints, no auth header)

    func authPhoneStart(_ phone: String) async throws -> PhoneAuthStart {
        let data = try await publicPost("/auth/phone/start", body: PhoneStartBody(phone: phone))
        return try decode(data)
    }

    /// Returns Supabase's session JSON (decoded as `SupabaseSession`) and `is_new`.
    func authPhoneVerify(challenge: String, code: String) async throws -> (session: SupabaseSession, isNew: Bool) {
        let data = try await publicPost("/auth/phone/verify", body: PhoneAuthVerifyBody(challenge: challenge, code: code))
        struct Flag: Decodable { var is_new: Bool? }
        do {
            let s = try JSONDecoder().decode(SupabaseSession.self, from: data)
            return (s, (try? JSONDecoder().decode(Flag.self, from: data))?.is_new ?? false)
        } catch { throw APIError.decoding(String(describing: error)) }
    }

    private func publicPost(_ path: String, body: some Encodable & Sendable) async throws -> Data {
        var req = URLRequest(url: makeURL(path))
        req.httpMethod = "POST"
        req.setValue(AppInfo.clientHeader, forHTTPHeaderField: "X-UnSOLO-Client")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSON.encoder().encode(body)
        let (data, http) = try await transport.send(req)
        guard (200..<300).contains(http.statusCode) else { throw PhoneAuthError.from(status: http.statusCode, data: data, headers: http.allHeaderFields) }
        return data
    }

    func phoneStart(_ phone: String) async throws -> PhoneStartResponse { try await call(.post, "/me/phone/start", body: PhoneStartBody(phone: phone)) }
    func phoneVerify(_ phone: String, code: String) async throws -> PhoneVerifyResponse {
        try await call(.post, "/me/phone/verify", body: PhoneVerifyBody(phone: phone, code: code))
    }
    func registerDevice(token: String) async throws {
        try await callNoContent(.post, "/devices", body: DeviceBody(platform: "ios", token: token, appVersion: AppInfo.version,
                                                                   locale: Locale.current.identifier))
    }
    func unregisterDevice(token: String) async throws { try await callNoContent(.delete, "/devices", body: DeviceDeleteBody(token: token)) }

    func explore(q: String?, category: String?, month: String?, cursor: String?) async throws -> ExplorePage {
        try await get("/explore", query: ["q": q, "category": category, "month": month, "cursor": cursor, "limit": "20"], authenticated: true)
    }
    func trip(slug: String) async throws -> TripDetail { try await get("/trips/\(slug)") }
    func myTrips() async throws -> MyTripsResponse { try await get("/my/trips") }

    func feed(kind: PostKind?, place: String?, lat: Double?, lng: Double?, cursor: String?) async throws -> FeedResponse {
        try await get("/feed", query: ["kind": kind?.rawValue, "place": place, "lat": lat.map { String(format: "%.2f", $0) },
                                       "lng": lng.map { String(format: "%.2f", $0) }, "cursor": cursor])
    }
    func post(id: String) async throws -> PostDetailResponse { try await get("/posts/\(id)") }
    func comments(postId: String, cursor: String?) async throws -> Page<Comment> {
        try await get("/posts/\(postId)/comments", query: ["cursor": cursor])
    }
    func joinRequests(postId: String) async throws -> JoinRequestsResponse { try await get("/posts/\(postId)/requests") }
    /// The organiser confirms the price they were shown; the server returns 409 if the host changed it since.
    func acceptOffer(_ id: String, expectedPricePaise: Int) async throws -> AcceptOfferResponse {
        try await call(.post, "/offers/\(id)/accept", body: AcceptOfferBody(expectedPricePaise: expectedPricePaise))
    }
    func declineOffer(_ id: String) async throws { try await callNoContent(.post, "/offers/\(id)/decline") }
    func makeOffer(postId: String, _ body: OfferBody) async throws -> HostOffer { try await call(.post, "/posts/\(postId)/offers", body: body) }
    func user(_ username: String) async throws -> ProfileResponse { try await get("/users/\(username)") }
    func suggestions(lat: Double?, lng: Double?) async throws -> SuggestionsResponse {
        try await get("/suggestions", query: ["lat": lat.map { String(format: "%.2f", $0) }, "lng": lng.map { String(format: "%.2f", $0) }])
    }

    func chats(type: String?, cursor: String?) async throws -> Page<ChatSummary> { try await get("/chats", query: ["type": type, "cursor": cursor]) }
    func messages(roomId: String, before: Date? = nil, after: Date? = nil) async throws -> MessagesResponse {
        try await get("/chats/\(roomId)/messages", query: ["before": before.map(ISODate.format), "after": after.map(ISODate.format), "limit": "40"])
    }
    func directChat(userId: String) async throws -> DirectChatResponse { try await call(.post, "/chats/direct", body: DirectChatBody(userId: userId)) }

    func report(_ body: ReportBody) async throws -> ReportResponse { try await call(.post, "/reports", body: body) }
    func block(userId: String) async throws { try await callNoContent(.post, "/blocks", body: BlockBody(userId: userId)) }

    func notifications(cursor: String?) async throws -> NotificationsResponse { try await get("/notifications", query: ["cursor": cursor]) }
    func sync(since: Date?) async throws -> SyncResponse { try await get("/sync", query: ["since": since.map(ISODate.format)]) }
    func sendEvents(_ events: [AnalyticsEvent]) async throws {
        _ = try await send(.post, "/events", body: try JSON.encoder().encode(EventsBody(events: events)), authenticated: true)
    }
}
