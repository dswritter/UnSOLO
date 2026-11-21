import XCTest
@testable import UnSOLO

/// Fake API for /auth/phone/start + /verify (2factor.in flow).
final class PhoneAuthServer: HTTPTransport, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var verifyBodies: [[String: Any]] = []
    private var issued = 0

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let url = request.url!
        func reply(_ status: Int, _ body: String, _ headers: [String: String] = [:]) -> (Data, HTTPURLResponse) {
            (Data(body.utf8), HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: headers.merging(["Content-Type": "application/json"]) { a, _ in a })!)
        }
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        let json = (try? JSONSerialization.jsonObject(with: request.httpBody ?? Data())) as? [String: Any] ?? [:]
        if url.path.hasSuffix("/auth/phone/start") {
            let n = lock.withLock { issued += 1; return issued }
            if (json["phone"] as? String) == "123" { return reply(400, #"{"error":{"code":"bad_request","message":"Enter a valid mobile number","field":"phone"}}"#) }
            if n > 2 { return reply(429, #"{"error":{"code":"rate_limited","message":"Wait 30 seconds before asking for another code."}}"#, ["Retry-After": "27"]) }
            return reply(200, #"{"challenge":"ch-\#(n)","expiresIn":600,"devCode":"1234"}"#)
        }
        if url.path.hasSuffix("/auth/phone/verify") {
            lock.withLock { verifyBodies.append(json) }
            guard (json["challenge"] as? String) == "ch-2", (json["code"] as? String) == "1234" else {
                return reply(401, #"{"error":{"code":"unauthorized","message":"That code is wrong or has expired."}}"#)
            }
            return reply(200, #"{"access_token":"a1","refresh_token":"r1","expires_in":3600,"expires_at":1999999999,"token_type":"bearer","user":{"id":"u1","email":"9876543210@phone.unsolo.in"},"is_new":true}"#)
        }
        return reply(404, "{}")
    }
}

final class PhoneSignInTests: XCTestCase {
    func testSmsCodeLengthIsFourEmailStaysSix() {
        XCTAssertEqual(smsOtpLength, 4)
        XCTAssertEqual(emailOtpLength, 6)
        XCTAssertEqual(OTPAutoSubmit.digits("12 34-56", length: smsOtpLength), "1234")
        XCTAssertEqual(OTPAutoSubmit.digits("12a3456", length: emailOtpLength), "123456")
    }

    func testAutoSubmitFiresOnceAtLengthAndNotAgainAfterFailure() {
        var gate = OTPAutoSubmit(length: smsOtpLength)
        XCTAssertFalse(gate.shouldSubmit(code: "12", busy: false))
        XCTAssertFalse(gate.shouldSubmit(code: "123", busy: false))
        XCTAssertTrue(gate.shouldSubmit(code: "1234", busy: false))
        // Same code again (view update, failed verify): never re-submitted.
        XCTAssertFalse(gate.shouldSubmit(code: "1234", busy: false))
        XCTAssertFalse(gate.shouldSubmit(code: "1234", busy: false))
        // Editing the code (shorter) re-arms it; a different full code fires again.
        XCTAssertFalse(gate.shouldSubmit(code: "123", busy: false))
        XCTAssertTrue(gate.shouldSubmit(code: "4321", busy: false))
        // A full code arriving while a request runs is held back, then fires once when free.
        var busyGate = OTPAutoSubmit(length: smsOtpLength)
        XCTAssertFalse(busyGate.shouldSubmit(code: "1234", busy: true))
        XCTAssertTrue(busyGate.shouldSubmit(code: "1234", busy: false))
        // Email codes need six digits.
        var email = OTPAutoSubmit(length: emailOtpLength)
        XCTAssertFalse(email.shouldSubmit(code: "1234", busy: false))
        XCTAssertTrue(email.shouldSubmit(code: "123456", busy: false))
    }

    func testDemoPhoneSignInUsesFourDigitCodes() async throws {
        let demo = DemoTransport(latency: 0...0, persist: false)
        func post(_ path: String, _ body: [String: String]) async throws -> (Data, Int) {
            var req = URLRequest(url: URL(string: "https://unsolo.in/api/v1" + path)!)
            req.httpMethod = "POST"
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (d, r) = try await demo.send(req)
            return (d, r.statusCode)
        }
        let (startData, startStatus) = try await post("/auth/phone/start", ["phone": "9876543210"])
        XCTAssertEqual(startStatus, 200)
        let start = try JSONDecoder().decode(PhoneAuthStart.self, from: startData)
        XCTAssertEqual(start.devCode, "1234")
        XCTAssertEqual(start.expiresIn, 300)
        let (_, sixStatus) = try await post("/auth/phone/verify", ["challenge": start.challenge, "code": "123456"])
        XCTAssertEqual(sixStatus, 401)
        let (_, okStatus) = try await post("/auth/phone/verify", ["challenge": start.challenge, "code": "1234"])
        XCTAssertEqual(okStatus, 200)
    }

    func testChallengeFlowReplacesChallengeAndDecodesSession() async throws {
        let server = PhoneAuthServer()
        let auth = AuthManager(transport: server, secrets: InMemorySecretStore(), supabaseURL: "https://x.supabase.co", anonKey: "k")
        let api = APIClient(transport: server, baseURL: URL(string: "https://unsolo.in/api/v1")!, auth: auth)
        var flow = PhoneSignInFlow()
        let t0 = Date()

        let first = try await api.authPhoneStart("9876543210")
        flow.started(first, at: t0)
        XCTAssertEqual(flow.challenge, "ch-1")
        XCTAssertEqual(flow.devCode, "1234")
        XCTAssertEqual(flow.secondsUntilResend(now: t0), 30)

        // Resend replaces the challenge; the old one no longer verifies.
        flow.started(try await api.authPhoneStart("9876543210"), at: t0.addingTimeInterval(31))
        XCTAssertEqual(flow.challenge, "ch-2")
        do {
            _ = try await api.authPhoneVerify(challenge: "ch-1", code: "1234")
            XCTFail("old challenge must fail")
        } catch let e as PhoneAuthError {
            XCTAssertEqual(e.code, "unauthorized")
            XCTAssertEqual(e.message, "That code is wrong or has expired.")
        }

        let ok = try await api.authPhoneVerify(challenge: flow.challenge!, code: "1234")
        XCTAssertEqual(ok.session.accessToken, "a1")
        XCTAssertEqual(ok.session.refreshToken, "r1")
        XCTAssertTrue(ok.isNew)
        XCTAssertEqual(server.verifyBodies.last?["challenge"] as? String, "ch-2")

        // Rate limit keeps the server message and Retry-After.
        do {
            _ = try await api.authPhoneStart("9876543210")
            XCTFail("expected 429")
        } catch let e as PhoneAuthError {
            XCTAssertEqual(e.code, "rate_limited")
            XCTAssertEqual(e.retryAfter, 27)
            flow.blockResend(for: e.retryAfter!, from: t0)
            XCTAssertEqual(flow.secondsUntilResend(now: t0), 27)
        }

        // Change number forgets the challenge.
        flow.reset()
        XCTAssertNil(flow.challenge)
    }

    func testBadNumberShowsServerMessage() async {
        let server = PhoneAuthServer()
        let auth = AuthManager(transport: server, secrets: InMemorySecretStore(), supabaseURL: "https://x.supabase.co", anonKey: "k")
        let api = APIClient(transport: server, baseURL: URL(string: "https://unsolo.in/api/v1")!, auth: auth)
        do {
            _ = try await api.authPhoneStart("123")
            XCTFail("expected 400")
        } catch let e as PhoneAuthError {
            XCTAssertEqual(e.message, "Enter a valid mobile number")
            XCTAssertNil(e.retryAfter)
        } catch { XCTFail("\(error)") }
    }

    func testPlaceholderEmailIsHidden() {
        XCTAssertTrue(Fmt.isPlaceholderEmail("9876543210@phone.unsolo.in"))
        XCTAssertTrue(Fmt.isPlaceholderEmail("9876543210@PHONE.unsolo.in"))
        XCTAssertNil(Fmt.displayEmail("9876543210@phone.unsolo.in"))
        XCTAssertNil(Fmt.displayEmail(nil))
        XCTAssertEqual(Fmt.displayEmail("dev@example.com"), "dev@example.com")
        XCTAssertFalse(Fmt.isPlaceholderEmail("someone@unsolo.in"))
    }
}
