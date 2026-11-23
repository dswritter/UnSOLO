import XCTest
@testable import UnSOLO

/// Fake server: /me needs the "fresh" token; the refresh endpoint is slow so concurrent 401s overlap.
final class RefreshingServer: HTTPTransport, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var refreshHits = 0
    private(set) var meHits = 0
    var validToken = "fresh"

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let url = request.url!
        func reply(_ status: Int, _ body: String) -> (Data, HTTPURLResponse) {
            (Data(body.utf8), HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
        }
        if url.path.hasSuffix("/auth/v1/token") {
            lock.withLock { refreshHits += 1 }
            try await Task.sleep(for: .milliseconds(150))
            return reply(200, #"{"access_token":"fresh","refresh_token":"r2","expires_in":3600,"token_type":"bearer"}"#)
        }
        lock.withLock { meHits += 1 }
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-UnSOLO-Client")?.hasPrefix("ios/"), true)
        if request.value(forHTTPHeaderField: "Authorization") == "Bearer \(validToken)" {
            return reply(200, #"{"ok":true}"#)
        }
        return reply(401, #"{"error":{"code":"unauthorized"}}"#)
    }
}

final class NetworkingTests: XCTestCase {
    struct OK: Codable, Sendable { var ok: Bool }

    func testConcurrent401sShareOneRefresh() async throws {
        let server = RefreshingServer()
        let auth = AuthManager(transport: server, secrets: InMemorySecretStore(), supabaseURL: "https://x.supabase.co", anonKey: "k")
        await auth.adopt(SupabaseSession(accessToken: "stale", refreshToken: "r1", expiresIn: 3600, expiresAt: nil, tokenType: "bearer"))
        let api = APIClient(transport: server, baseURL: URL(string: "https://unsolo.in/api/v1")!, auth: auth)

        try await withThrowingTaskGroup(of: OK.self) { group in
            for _ in 0..<6 { group.addTask { try await api.get("/me") } }
            for try await r in group { XCTAssertTrue(r.ok) }
        }
        XCTAssertEqual(server.refreshHits, 1, "single-flight refresh")
        let calls = await auth.refreshCalls
        XCTAssertEqual(calls, 1)
        let token = await auth.accessToken
        XCTAssertEqual(token, "fresh")
    }

    func testFailedRefreshSignsOut() async throws {
        final class Rejecting: HTTPTransport {
            func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
                let status = request.url!.path.hasSuffix("/token") ? 400 : 401
                return (Data(#"{"error":"invalid_grant"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
        }
        let t = Rejecting()
        let auth = AuthManager(transport: t, secrets: InMemorySecretStore(), supabaseURL: "https://x.supabase.co", anonKey: "k")
        await auth.adopt(SupabaseSession(accessToken: "stale", refreshToken: "bad", expiresIn: nil, expiresAt: nil, tokenType: nil))
        let api = APIClient(transport: t, baseURL: URL(string: "https://unsolo.in/api/v1")!, auth: auth)
        do {
            let _: OK = try await api.get("/me")
            XCTFail("should throw")
        } catch {}
        let signedIn = await auth.isSignedIn
        XCTAssertFalse(signedIn)
    }

    func testAuthTroubleKeepsTheSession() async throws {
        final class Down: HTTPTransport, @unchecked Sendable {
            let refreshStatus: Int?
            init(_ s: Int?) { refreshStatus = s }
            func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
                guard request.url!.path.hasSuffix("/token") else {
                    return (Data(#"{"error":{"code":"unauthorized"}}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
                }
                guard let s = refreshStatus else { throw URLError(.timedOut) }
                return (Data("<html>bad gateway</html>".utf8), HTTPURLResponse(url: request.url!, statusCode: s, httpVersion: nil, headerFields: nil)!)
            }
        }
        for status in [500, 502, 503, 504, 429, nil] as [Int?] {
            let t = Down(status)
            let auth = AuthManager(transport: t, secrets: InMemorySecretStore(), supabaseURL: "https://x.supabase.co", anonKey: "k")
            await auth.adopt(SupabaseSession(accessToken: "stale", refreshToken: "r", expiresIn: nil, expiresAt: nil, tokenType: nil))
            let api = APIClient(transport: t, baseURL: URL(string: "https://unsolo.in/api/v1")!, auth: auth)
            do { let _: OK = try await api.get("/me"); XCTFail("should throw") } catch {}
            let signedIn = await auth.isSignedIn
            XCTAssertTrue(signedIn, "refresh answered \(status.map(String.init) ?? "timeout"): keep the session")
        }
    }

    @MainActor
    func testAnySignOutWipesTheAccountFromThePhone() async throws {
        let app = AppModel(inMemory: true)
        app.store.setEntry("mytrips", ["private": "yes"], isPrivate: true)
        app.store.setEntry("public", "kept")
        app.session.isSignedIn = true
        app.session.authChanged(false) // e.g. Auth rejected the refresh token
        for _ in 0..<50 where app.store.entry([String: String].self, "mytrips") != nil { try await Task.sleep(for: .milliseconds(20)) }
        XCTAssertNil(app.store.entry([String: String].self, "mytrips"))
        XCTAssertEqual(app.store.entry(String.self, "public"), "kept")
        XCTAssertFalse(app.session.isSignedIn)
        XCTAssertNil(app.session.me)
    }

    func testUnavailableMapsToFriendlyMessage() {
        let body = Data(#"{"error":{"code":"unavailable","message":null}}"#.utf8)
        let e = APIError.from(status: 503, data: body, headers: [:])
        XCTAssertEqual(e.errorDescription, "UnSOLO is having trouble right now. Try again in a minute.")
        XCTAssertTrue(e.isRetryable)
    }

    func testTokensPersistInSecretStoreNotDefaults() async throws {
        let store = InMemorySecretStore()
        let auth = AuthManager(transport: RefreshingServer(), secrets: store, supabaseURL: "https://x.supabase.co", anonKey: "k")
        await auth.adopt(SupabaseSession(accessToken: "a", refreshToken: "r", expiresIn: nil, expiresAt: nil, tokenType: nil))
        XCTAssertNotNil(store.data(for: "supabase.session"))
        XCTAssertNil(UserDefaults.standard.data(forKey: "supabase.session"))
        let reloaded = AuthManager(transport: RefreshingServer(), secrets: store, supabaseURL: "https://x.supabase.co", anonKey: "k")
        let token = await reloaded.accessToken
        XCTAssertEqual(token, "a")
    }

    func testAPIClientBuildsQueryAndBaseURL() {
        let api = APIClient(transport: RefreshingServer(), baseURL: URL(string: "http://localhost:3000/api/v1")!,
                            auth: AuthManager(transport: RefreshingServer(), secrets: InMemorySecretStore(), supabaseURL: "https://x.supabase.co", anonKey: "k"))
        let url = api.makeURL("/feed", query: ["kind": "plan", "cursor": nil, "lat": "28.61"])
        XCTAssertEqual(url.absoluteString, "http://localhost:3000/api/v1/feed?kind=plan&lat=28.61")
        XCTAssertTrue(AppInfo.isAllowedBase(URL(string: "http://localhost:3000/api/v1")!))
        XCTAssertFalse(AppInfo.isAllowedBase(URL(string: "http://unsolo.in/api/v1")!), "ATS: only localhost may be http")
    }

    func testLocationRounding() {
        XCTAssertEqual(LocationService.round2(28.613939), 28.61)
        XCTAssertEqual(LocationService.round2(77.209023), 77.21)
    }
}

/// The demo backend follows the contract's idempotency and moderation rules.
final class DemoBackendTests: XCTestCase {
    private func request(_ method: String, _ path: String, body: [String: Any]? = nil) -> URLRequest {
        var r = URLRequest(url: URL(string: "https://unsolo.in/api/v1\(path)")!)
        r.httpMethod = method
        r.setValue("Bearer demo-access-test", forHTTPHeaderField: "Authorization")
        if let body { r.httpBody = try? JSONSerialization.data(withJSONObject: body) }
        return r
    }

    func testCreatePostIsIdempotentByClientId() async throws {
        let demo = DemoTransport(latency: 0...0, persist: false)
        let body: [String: Any] = ["clientId": "same-client-id", "kind": "ask", "title": "Best momos in Manali?", "body": "Old Manali or Mall Road?"]
        let (d1, r1) = try await demo.send(request("POST", "/posts", body: body))
        let (d2, r2) = try await demo.send(request("POST", "/posts", body: body))
        XCTAssertEqual(r1.statusCode, 201)
        XCTAssertEqual(r2.statusCode, 200, "replay returns the original with 200")
        let p1 = try JSON.decoder().decode(CreatePostResponse.self, from: d1).post
        let p2 = try JSON.decoder().decode(CreatePostResponse.self, from: d2).post
        XCTAssertEqual(p1.id, p2.id)
    }

    func testMoneyWordsAreHeldAndContactsHidden() async throws {
        let demo = DemoTransport(latency: 0...0, persist: false)
        let body: [String: Any] = ["clientId": UUID().uuidString, "kind": "plan", "title": "Kasol trip",
                                   "body": "₹5000/person, pay advance on UPI. Call 9876543210", "spotsTotal": 4]
        let (data, _) = try await demo.send(request("POST", "/posts", body: body))
        let r = try JSON.decoder().decode(CreatePostResponse.self, from: data)
        XCTAssertEqual(r.moderation.state, "held")
        XCTAssertTrue(r.moderation.prompts.contains("money"))
        XCTAssertTrue(r.moderation.prompts.contains("contact_hidden"))
        XCTAssertFalse(r.post.body.contains("9876543210"))
    }

    func testJoinRequiresIntroAndMarksSeatRequested() async throws {
        let demo = DemoTransport(latency: 0...0, persist: false)
        let spiti = try XCTUnwrap(DebugLaunch.ids?.posts["spiti"])
        let (_, short) = try await demo.send(request("POST", "/posts/\(spiti)/join", body: ["intro": "hi"]))
        XCTAssertEqual(short.statusCode, 400)
        let (_, ok) = try await demo.send(request("POST", "/posts/\(spiti)/join", body: ["intro": "Hello! I love slow mountain trips."]))
        XCTAssertEqual(ok.statusCode, 200)
        let (data, _) = try await demo.send(request("GET", "/posts/\(spiti)"))
        let detail = try JSON.decoder().decode(PostDetailResponse.self, from: data)
        XCTAssertEqual(detail.post.viewer?.membership, .requested)
        XCTAssertTrue(detail.post.seats.contains { $0.state == .requested })
    }

    func testUnauthenticatedPrivateRouteIs401() async throws {
        let demo = DemoTransport(latency: 0...0, persist: false)
        var r = request("GET", "/me")
        r.setValue(nil, forHTTPHeaderField: "Authorization")
        let (data, resp) = try await demo.send(r)
        XCTAssertEqual(resp.statusCode, 401)
        XCTAssertEqual(APIError.from(status: resp.statusCode, data: data, headers: [:]), .unauthorized)
    }
}
