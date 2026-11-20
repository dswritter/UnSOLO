import XCTest
@testable import UnSOLO

/// Notification / push links are only routed when they are same-site paths; Tribe join requests carry
/// postId + actorId for inline Approve/Decline (api-v1.md, Notification).
final class NotificationLinkTests: XCTestCase {
    let post = "307d6986-4513-5564-a938-533b271261f1"
    let actor = "0f0e3a54-9c1e-5b4f-8a77-1b2c3d4e5f60"

    func testSameSitePathsAreAccepted() {
        for link in ["/tribe/p/\(post)", "/bookings", "/tribe", "/tribe/p/\(post)?offer=abc", "/profile/ananya.singh", "/"] {
            XCTAssertTrue(DeepLink.isSameSitePath(link), link)
        }
    }

    func testUnsafeLinksAreRejected() {
        let bad = [
            "//evil.example/tribe", "/\\evil.example", "/\\\\evil.example",
            "https://evil.example/tribe/p/\(post)", "unsolo://tribe", "javascript:alert(1)", "tribe/p/\(post)", "",
            "/tribe /p", " /tribe", "/tribe\n", "/tribe\r/x", "/tribe\t", "/x\u{0000}y", "/x\u{007F}", "/x\u{202E}gpj",
            "/x\u{00A0}y", "/x\u{2028}y",
        ]
        for link in bad { XCTAssertFalse(DeepLink.isSameSitePath(link), link.debugDescription) }
    }

    func testNotificationRouteParsesOnlySafeKnownPaths() {
        XCTAssertEqual(DeepLink.notificationRoute("/tribe/p/\(post)"), .post(id: post))
        XCTAssertEqual(DeepLink.notificationRoute("/bookings"), .bookings)
        XCTAssertNil(DeepLink.notificationRoute("//unsolo.in/tribe/p/\(post)"), "protocol-relative")
        XCTAssertNil(DeepLink.notificationRoute("/\\unsolo.in/bookings"))
        XCTAssertNil(DeepLink.notificationRoute("/admin/reports"), "safe but unknown → caller opens Activity")
        XCTAssertNil(DeepLink.notificationRoute(nil))
    }

    @MainActor
    func testUnsafeOrUnknownLinkOpensActivity() {
        let app = AppModel(inMemory: true)
        app.router.tab = .tribe
        app.openNotificationLink("//evil.example/x")
        XCTAssertEqual(app.router.path(.tribe).last, .activity)
        app.openNotificationLink("/tribe/p/\(post)")
        XCTAssertEqual(app.router.path(.tribe).last, .post(id: post))
        app.openNotificationLink("/nowhere")
        XCTAssertEqual(app.router.path(.tribe).last, .activity)
        app.openNotificationLink(nil)
        XCTAssertEqual(app.router.path(.tribe).last, .activity)
    }

    private func notification(type: String, postId: String?, actorId: String?) throws -> AppNotification {
        var obj: [String: Any] = ["id": "n1", "type": type, "category": "plans", "title": "Kabir wants to join", "body": NSNull(),
                                  "link": "/tribe/p/\(post)", "isRead": false, "createdAt": "2026-11-20T07:00:00.000Z"]
        if let postId { obj["postId"] = postId }
        if let actorId { obj["actorId"] = actorId }
        return try JSON.decoder().decode(AppNotification.self, from: JSONSerialization.data(withJSONObject: obj))
    }

    func testJoinRequestNotificationDecodesInlineDecision() throws {
        let n = try notification(type: "tribe_join_request", postId: post.uppercased(), actorId: actor)
        XCTAssertEqual(n.postId, post.uppercased())
        XCTAssertEqual(n.inlineDecision?.postId, post)
        XCTAssertEqual(n.inlineDecision?.userId, actor)
    }

    func testInlineDecisionNeedsTypeAndValidIds() throws {
        XCTAssertNil(try notification(type: "tribe_join_request", postId: nil, actorId: nil).inlineDecision, "fields are optional")
        XCTAssertNil(try notification(type: "tribe_join_request", postId: post, actorId: "../../admin").inlineDecision)
        XCTAssertNil(try notification(type: "reply", postId: post, actorId: actor).inlineDecision, "only join requests")
        XCTAssertNotNil(try notification(type: "join_request", postId: post, actorId: actor).inlineDecision, "legacy type")
    }

    func testPushPayloadDecision() {
        let p = PushPayload(userInfo: ["type": "tribe_join_request", "postId": post, "actorId": actor, "link": "/tribe/p/\(post)"])
        XCTAssertEqual(p.inlineDecision?.postId, post)
        XCTAssertEqual(p.inlineDecision?.userId, actor)
        XCTAssertEqual(PushPayload(userInfo: ["postId": post, "userId": actor]).inlineDecision?.userId, actor, "older userId key")
        XCTAssertNil(PushPayload(userInfo: ["type": "message", "postId": post, "actorId": actor]).inlineDecision)
        XCTAssertNil(PushPayload(userInfo: ["type": "tribe_join_request", "postId": "x", "actorId": actor]).inlineDecision)
    }
}

/// POST /offers/{id}/accept sends { expectedPricePaise }; a changed price is a 409.
final class OfferAcceptTests: XCTestCase {
    final class Recorder: HTTPTransport, @unchecked Sendable {
        private let lock = NSLock()
        private(set) var requests: [URLRequest] = []
        func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
            lock.withLock { requests.append(request) }
            let body = #"{"packageSlug":"tosh-kalga-weekend-hosted","payBy":"2026-11-22T10:00:00Z"}"#
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
    }

    private func client(_ t: any HTTPTransport) -> APIClient {
        APIClient(transport: t, baseURL: URL(string: "https://unsolo.in/api/v1")!,
                  auth: AuthManager(transport: t, secrets: InMemorySecretStore(), supabaseURL: "https://x.supabase.co", anonKey: "k"))
    }

    func testAcceptSendsExpectedPriceBody() async throws {
        let rec = Recorder()
        let r = try await client(rec).acceptOffer("offer-1", expectedPricePaise: 549_900)
        XCTAssertEqual(r.packageSlug, "tosh-kalga-weekend-hosted")
        let req = try XCTUnwrap(rec.requests.first)
        XCTAssertEqual(req.httpMethod, "POST")
        XCTAssertEqual(req.url?.path, "/api/v1/offers/offer-1/accept")
        XCTAssertEqual(req.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(req.httpBody)) as? [String: Any]
        XCTAssertEqual(body?["expectedPricePaise"] as? Int, 549_900)
        XCTAssertEqual(body?.count, 1)
    }

    /// Demo backend enforces the same rule as the server.
    func testDemoBackendRequiresMatchingPrice() async throws {
        let demo = DemoTransport(latency: 0...0, persist: false)
        let auth = AuthManager(transport: demo, secrets: InMemorySecretStore(), supabaseURL: "https://demo.supabase.co", anonKey: "k")
        await auth.adopt(SupabaseSession(accessToken: "demo-access-test", refreshToken: "demo-refresh-test", expiresIn: nil, expiresAt: nil, tokenType: nil))
        let api = APIClient(transport: demo, baseURL: URL(string: "https://unsolo.in/api/v1")!, auth: auth)
        let tosh = try XCTUnwrap(DebugLaunch.ids?.posts["tosh"])
        let detail = try await api.post(id: tosh)
        let offer = try XCTUnwrap(detail.offers.first)

        // Missing body → 400.
        do {
            _ = try await api.send(.post, "/offers/\(offer.id)/accept")
            XCTFail("expected 400")
        } catch let e as APIError {
            guard case .badRequest(_, let field) = e else { return XCTFail("got \(e)") }
            XCTAssertEqual(field, "expectedPricePaise")
        }

        // The host edits the price after the organiser saw it → 409 with the review message.
        await demo.backend.setOfferPrice(offer.id, pricePaise: offer.pricePaise + 50_000)
        do {
            _ = try await api.acceptOffer(offer.id, expectedPricePaise: offer.pricePaise)
            XCTFail("expected 409")
        } catch let e as APIError {
            guard case .conflict(let message) = e else { return XCTFail("got \(e)") }
            XCTAssertEqual(message, "The host changed this offer. Review the new price.")
        }

        // Refetch shows the new price; accepting that price succeeds.
        let refetched = try await api.post(id: tosh)
        let fresh = try XCTUnwrap(refetched.offers.first { $0.id == offer.id })
        XCTAssertEqual(fresh.pricePaise, offer.pricePaise + 50_000)
        let ok = try await api.acceptOffer(offer.id, expectedPricePaise: fresh.pricePaise)
        XCTAssertFalse(ok.packageSlug.isEmpty)
    }
}
