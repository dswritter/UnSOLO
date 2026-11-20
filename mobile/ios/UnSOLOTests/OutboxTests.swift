import SwiftData
import XCTest
@testable import UnSOLO

/// Records every send; fails according to a script.
actor ScriptedSender: OutboxSending {
    struct Call: Equatable { let method: HTTPMethod; let path: String; let body: Data? }
    private(set) var calls: [Call] = []
    var script: [Result<Data, APIError>] = []

    func push(_ r: Result<Data, APIError>) { script.append(r) }

    func send(method: HTTPMethod, path: String, body: Data?) async throws -> Data {
        calls.append(Call(method: method, path: path, body: body))
        let next = script.isEmpty ? .success(Data("{}".utf8)) : script.removeFirst()
        switch next {
        case .success(let d): return d
        case .failure(let e): throw e
        }
    }
}

@MainActor
final class OutboxTests: XCTestCase {
    private var container: ModelContainer!
    private var sender: ScriptedSender!
    private var clock = Date(timeIntervalSince1970: 1_800_000_000)
    private var engine: OutboxEngine!

    override func setUp() async throws {
        container = Schema1.makeContainer(inMemory: true)
        sender = ScriptedSender()
        engine = OutboxEngine(context: container.mainContext, sender: sender, policy: BackoffPolicy(base: 2, factor: 2, maxDelay: 60, maxAttempts: 4, jitter: 0.2))
        engine.now = { [unowned self] in self.clock }
        engine.random = { 0.5 } // no jitter
    }

    override func tearDown() async throws {
        engine.cancelWake()
    }

    func testEnqueueIsIdempotentByClientId() {
        XCTAssertTrue(engine.enqueue(kind: "post.create", method: .post, path: "/posts", body: Data("{\"a\":1}".utf8), clientId: "c1"))
        XCTAssertFalse(engine.enqueue(kind: "post.create", method: .post, path: "/posts", body: Data("{\"a\":2}".utf8), clientId: "c1"))
        XCTAssertEqual(engine.all().count, 1)
        XCTAssertEqual(engine.item("c1")?.body, Data("{\"a\":1}".utf8), "the first write wins")
    }

    func testCoalesceReplacesPendingWrite() {
        engine.enqueue(kind: "reaction", method: .put, path: "/posts/p/reactions/love", body: nil, clientId: "react:p:love", coalesce: true)
        engine.enqueue(kind: "reaction", method: .delete, path: "/posts/p/reactions/love", body: nil, clientId: "react:p:love", coalesce: true)
        XCTAssertEqual(engine.all().count, 1)
        XCTAssertEqual(engine.item("react:p:love")?.method, "DELETE")
    }

    func testSuccessfulDrainSendsOnceAndCallsHandler() async {
        var handled: [String] = []
        engine.register("comment", OutboxHandler(success: { snap, _ in handled.append(snap.clientId) }))
        engine.enqueue(kind: "comment", method: .post, path: "/posts/p/comments", body: Data("{\"clientId\":\"c2\"}".utf8), clientId: "c2")
        let report = await engine.drain()
        XCTAssertEqual(report.sent, 1)
        XCTAssertEqual(handled, ["c2"])
        XCTAssertTrue(engine.all().isEmpty)
        let calls = await sender.calls
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls.first?.path, "/posts/p/comments")
    }

    func testRetryableFailureBacksOffAndResendsSameClientId() async {
        await sender.push(.failure(.server(503, nil)))
        let body = Data("{\"clientId\":\"c3\",\"body\":\"hi\"}".utf8)
        engine.enqueue(kind: "message", method: .post, path: "/chats/r/messages", body: body, clientId: "c3")

        var report = await engine.drain()
        XCTAssertEqual(report.retried, 1)
        let row = engine.item("c3")
        XCTAssertEqual(row?.attempts, 1)
        XCTAssertEqual(row?.nextAttemptAt, clock.addingTimeInterval(2), "first retry after base delay")

        // Not due yet: nothing is sent.
        clock = clock.addingTimeInterval(1)
        report = await engine.drain()
        XCTAssertEqual(report, OutboxEngine.DrainReport())
        var calls = await sender.calls
        XCTAssertEqual(calls.count, 1)

        // Due: sent again with the identical body (same clientId → server dedupes).
        clock = clock.addingTimeInterval(2)
        report = await engine.drain()
        XCTAssertEqual(report.sent, 1)
        calls = await sender.calls
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(calls[0].body, calls[1].body)
        XCTAssertNil(engine.item("c3"))
    }

    func testOfflineStopsThePassAndKeepsOrder() async {
        await sender.push(.failure(.offline))
        engine.enqueue(kind: "a", method: .post, path: "/a", body: nil, clientId: "a")
        clock = clock.addingTimeInterval(1)
        engine.enqueue(kind: "b", method: .post, path: "/b", body: nil, clientId: "b")
        let report = await engine.drain()
        XCTAssertEqual(report.retried, 1)
        let calls = await sender.calls
        XCTAssertEqual(calls.map(\.path), ["/a"], "offline should not keep hammering the rest of the queue")
        XCTAssertEqual(engine.item("b")?.attempts, 0)
    }

    func testClientErrorFailsFastAndCallsFailureHandler() async {
        var failed: APIError?
        engine.register("join", OutboxHandler(success: { _, _ in }, failure: { _, e in failed = e }))
        await sender.push(.failure(.badRequest("too short", field: "intro")))
        engine.enqueue(kind: "join", method: .post, path: "/posts/p/join", body: nil, clientId: "join:p")
        let report = await engine.drain()
        XCTAssertEqual(report.failed, 1)
        XCTAssertEqual(engine.item("join:p")?.state, "failed")
        XCTAssertEqual(failed, .badRequest("too short", field: "intro"))
    }

    func testGivesUpAfterMaxAttempts() async {
        for _ in 0..<4 { await sender.push(.failure(.server(500, nil))) }
        engine.enqueue(kind: "x", method: .post, path: "/x", body: nil, clientId: "x")
        for _ in 0..<4 {
            await engine.drain()
            clock = clock.addingTimeInterval(120)
        }
        XCTAssertEqual(engine.item("x")?.state, "failed")
        XCTAssertEqual(engine.item("x")?.attempts, 4)
    }

    func testRateLimitHonoursRetryAfter() async {
        await sender.push(.failure(.rateLimited(retryAfter: 30)))
        engine.enqueue(kind: "x", method: .post, path: "/x", body: nil, clientId: "rl")
        await engine.drain()
        XCTAssertEqual(engine.item("rl")?.nextAttemptAt, clock.addingTimeInterval(30))
    }

    func testWaitsForUploadsThenInjectsMedia() async throws {
        let body = try JSON.encoder().encode(CreatePostBody(clientId: "p1", kind: .story, body: "Hello there"))
        engine.enqueue(kind: "post.create", method: .post, path: "/posts", body: body, clientId: "p1",
                       uploads: [UploadSlot(localPath: "/tmp/a.jpg", width: 0, height: 0, media: nil)])
        var report = await engine.drain()
        XCTAssertEqual(report.skipped, 1)
        var calls = await sender.calls
        XCTAssertTrue(calls.isEmpty)

        engine.resolveUpload(clientId: "p1", index: 0, media: Media(url: "https://cdn.unsolo.in/a.webp", thumbUrl: nil, lqip: nil, width: 2048, height: 1536))
        report = await engine.drain()
        XCTAssertEqual(report.sent, 1)
        calls = await sender.calls
        let sent = try XCTUnwrap(calls.first?.body)
        let decoded = try JSON.decoder().decode(CreatePostBody.self, from: sent)
        XCTAssertEqual(decoded.clientId, "p1")
        XCTAssertEqual(decoded.media?.first?.url, "https://cdn.unsolo.in/a.webp")
    }

    func testBackoffPolicyIsExponentialCappedAndJittered() {
        let p = BackoffPolicy(base: 2, factor: 2, maxDelay: 60, maxAttempts: 10, jitter: 0.2)
        XCTAssertEqual(p.delay(attempt: 1, random: 0.5), 2)
        XCTAssertEqual(p.delay(attempt: 2, random: 0.5), 4)
        XCTAssertEqual(p.delay(attempt: 3, random: 0.5), 8)
        XCTAssertEqual(p.delay(attempt: 10, random: 0.5), 60, "capped")
        XCTAssertEqual(p.delay(attempt: 3, random: 0), 8 * 0.8, accuracy: 0.0001)
        XCTAssertEqual(p.delay(attempt: 3, random: 1), 8 * 1.2, accuracy: 0.0001)
        XCTAssertLessThanOrEqual(p.delay(attempt: 20, random: 1), 60, "jitter never exceeds the cap")
    }

    func testOfflineEngineDoesNotSend() async {
        engine.isOnline = { false }
        engine.enqueue(kind: "x", method: .post, path: "/x", body: nil, clientId: "off")
        let report = await engine.drain()
        XCTAssertEqual(report, OutboxEngine.DrainReport())
        let calls = await sender.calls
        XCTAssertTrue(calls.isEmpty)
    }
}
