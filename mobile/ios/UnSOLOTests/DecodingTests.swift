import XCTest
@testable import UnSOLO

/// Contract models (docs/revamp/api-v1.md) decode the demo fixtures and hand-written server payloads.
final class DecodingTests: XCTestCase {
    private func fixture(_ name: String) -> Data { DemoBackend.fixture(name) }
    private let decoder = JSON.decoder()

    func testFixturesDecodeAsContractModels() throws {
        XCTAssertNoThrow(try decoder.decode(ConfigResponse.self, from: fixture("config")))
        XCTAssertNoThrow(try decoder.decode(MeResponse.self, from: fixture("me")))
        XCTAssertNoThrow(try decoder.decode([String: [TripLite]].self, from: fixture("explore")))
        XCTAssertNoThrow(try decoder.decode([String: TripDetail].self, from: fixture("trip-details")))
        XCTAssertNoThrow(try decoder.decode(MyTripsResponse.self, from: fixture("my-trips")))
        XCTAssertNoThrow(try decoder.decode(NotificationsResponse.self, from: fixture("notifications")))
        XCTAssertNoThrow(try decoder.decode(Page<ChatSummary>.self, from: fixture("chats")))
        XCTAssertNoThrow(try decoder.decode([String: [ChatMessage]].self, from: fixture("messages")))
        XCTAssertNoThrow(try decoder.decode([String: ProfileResponse].self, from: fixture("users")))
        XCTAssertNoThrow(try decoder.decode(SuggestionsResponse.self, from: fixture("suggestions")))
        XCTAssertNoThrow(try decoder.decode(LandingSuggestion.self, from: fixture("landing-suggestion")))
        XCTAssertNoThrow(try decoder.decode([String: [Comment]].self, from: fixture("comments")))
        XCTAssertNoThrow(try decoder.decode([String: [HostOffer]].self, from: fixture("offers")))
        XCTAssertNoThrow(try decoder.decode([String: [JoinRequest]].self, from: fixture("requests")))
    }

    func testFeedMixesPostsAndPlacedTrips() throws {
        let feed = try decoder.decode(FeedResponse.self, from: fixture("feed"))
        XCTAssertTrue(feed.caughtUp)
        XCTAssertFalse(feed.nextDepartures.isEmpty)
        let placed = feed.items.filter { if case .placedTrip = $0 { return true }; return false }
        XCTAssertEqual(placed.count, 2)
        guard case .post(let first) = feed.items.first else { return XCTFail("first item should be a post") }
        XCTAssertEqual(first.kind, .plan)
        XCTAssertEqual(first.seats.first?.state, .organiser)
        XCTAssertEqual(first.audience, .verified)
        // Round-trips (used by the SwiftData cache).
        let again = try decoder.decode(FeedResponse.self, from: JSON.encoder().encode(feed))
        XCTAssertEqual(again.items, feed.items)
    }

    func testMinimalServerPostWithMissingOptionalArrays() throws {
        let json = """
        {"id":"p1","kind":"ask","author":{"id":"u1","username":"riya","name":"Riya Kapoor","avatarUrl":null,"isPhoneVerified":true,"isIdVerified":false,"isHost":false},
         "title":null,"body":"Best chai in Kasol?","place":null,"startsOn":null,"endsOn":null,"spotsTotal":null,"memberCount":0,
         "audience":"anyone","estCostText":null,"trip":null,"poll":{"options":[{"id":"o1","label":"Evergreen","votes":3}],"myChoice":null},
         "reactions":{"wantToGo":0,"helpful":2,"love":1},"commentCount":4,"status":"live",
         "createdAt":"2026-11-20T08:15:30Z","updatedAt":"2026-11-20T08:15:30.123+00:00","viewer":null,"meetingPoint":null}
        """
        let post = try decoder.decode(Post.self, from: Data(json.utf8))
        XCTAssertEqual(post.media, [], "missing media decodes as []")
        XCTAssertEqual(post.seats, [])
        XCTAssertEqual(post.myReactions, [])
        XCTAssertEqual(post.poll?.totalVotes, 3)
        XCTAssertEqual(post.reactions[.helpful], 2)
        XCTAssertEqual(post.displayTitle, "Best chai in Kasol?")
    }

    func testReactionAndEnumWireValues() throws {
        let r = try decoder.decode(ReactionsResponse.self, from: Data(#"{"reactions":{"wantToGo":5,"helpful":0,"love":2},"myReactions":["want_to_go","love"]}"#.utf8))
        XCTAssertEqual(r.myReactions, [.wantToGo, .love])
        let v = try decoder.decode(Viewer.self, from: Data(#"{"isAuthor":false,"membership":"requested","saved":true,"canJoin":false,"joinBlockedReason":"women_only"}"#.utf8))
        XCTAssertEqual(v.membership, .requested)
        XCTAssertEqual(v.joinBlockedReason, .womenOnly)
    }

    func testCreatePostResponseWithHeldModeration() throws {
        let feed = try decoder.decode(FeedResponse.self, from: fixture("feed"))
        guard case .post(let p) = feed.items[0] else { return XCTFail() }
        let wrapped = try JSONSerialization.jsonObject(with: JSON.encoder().encode(p))
        let body = try JSONSerialization.data(withJSONObject: ["post": wrapped, "moderation": ["state": "held", "prompts": ["money"]]])
        let r = try decoder.decode(CreatePostResponse.self, from: body)
        XCTAssertEqual(r.moderation.state, "held")
        XCTAssertEqual(r.moderation.prompts, ["money"])
    }

    func testErrorEnvelopeMapping() {
        func map(_ status: Int, _ code: String, headers: [AnyHashable: Any] = [:]) -> APIError {
            APIError.from(status: status, data: Data(#"{"error":{"code":"\#(code)","message":"m","field":"intro"}}"#.utf8), headers: headers)
        }
        XCTAssertEqual(map(401, "unauthorized"), .unauthorized)
        XCTAssertEqual(map(403, "phone_required"), .phoneRequired)
        XCTAssertEqual(map(403, "forbidden"), .forbidden("m"))
        XCTAssertEqual(map(404, "not_found"), .notFound)
        XCTAssertEqual(map(409, "conflict"), .conflict("m"))
        XCTAssertEqual(map(400, "bad_request"), .badRequest("m", field: "intro"))
        XCTAssertEqual(map(426, "upgrade_required"), .upgradeRequired)
        XCTAssertEqual(map(429, "rate_limited", headers: ["Retry-After": "12"]), .rateLimited(retryAfter: 12))
        XCTAssertEqual(map(500, "server_error"), .server(500, "m"))
        XCTAssertTrue(APIError.server(502, nil).isRetryable)
        XCTAssertTrue(APIError.offline.isRetryable)
        XCTAssertFalse(APIError.badRequest(nil, field: nil).isRetryable)
        XCTAssertFalse(APIError.phoneRequired.isRetryable)
    }

    func testISODates() {
        XCTAssertNotNil(ISODate.parse("2026-11-20T08:15:30Z"))
        XCTAssertNotNil(ISODate.parse("2026-11-20T08:15:30.123Z"))
        XCTAssertNotNil(ISODate.parse("2026-11-20T08:15:30+05:30"))
        XCTAssertNil(ISODate.parse("yesterday"))
        let d = Date(timeIntervalSince1970: 1_800_000_000.5)
        XCTAssertEqual(ISODate.parse(ISODate.format(d))!.timeIntervalSince1970, d.timeIntervalSince1970, accuracy: 0.001)
    }

    func testSupabaseSessionSnakeCase() throws {
        let s = try JSONDecoder().decode(SupabaseSession.self, from: Data(#"{"access_token":"a","refresh_token":"r","expires_in":3600,"token_type":"bearer","user":{}}"#.utf8))
        XCTAssertEqual(s.accessToken, "a")
        XCTAssertEqual(s.refreshToken, "r")
    }

    func testMoneyAndDateFormatting() {
        XCTAssertEqual(Fmt.rupees(1_469_900), "₹14,699")
        XCTAssertEqual(Fmt.rupees(13_842_000), "₹1,38,420")
        XCTAssertEqual(Fmt.rupees(99_900), "₹999")
        XCTAssertEqual(Fmt.weekdayDayMonth("2026-11-26"), "Thu 26 Nov")
        XCTAssertEqual(Fmt.range("2027-01-12", "2027-01-18"), "12–18 Jan")
        XCTAssertEqual(Fmt.range("2026-11-28", "2026-12-02"), "28 Nov – 2 Dec")
        XCTAssertEqual(Fmt.duration(10), "10D/9N")
    }

    func testRequestBodiesAreCamelCase() throws {
        let body = CreatePostBody(clientId: "c", kind: .plan, title: "T", body: "B", spotsTotal: 5, audience: .women, estCostText: "x")
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: JSON.encoder().encode(body)) as? [String: Any])
        XCTAssertEqual(obj["clientId"] as? String, "c")
        XCTAssertEqual(obj["spotsTotal"] as? Int, 5)
        XCTAssertEqual(obj["audience"] as? String, "women")
        XCTAssertEqual(obj["estCostText"] as? String, "x")
        XCTAssertNil(obj["media"], "nil optionals are omitted")
    }
}
