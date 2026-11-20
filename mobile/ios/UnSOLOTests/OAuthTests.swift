import XCTest
@testable import UnSOLO

final class OAuthTests: XCTestCase {
    func testChallengeMatchesRFC7636Vector() {
        XCTAssertEqual(PKCE.challenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    func testVerifierIsRandomUnreservedAndLongEnough() {
        let a = PKCE.makeVerifier(), b = PKCE.makeVerifier()
        XCTAssertNotEqual(a, b)
        XCTAssertEqual(a.count, 43)
        XCTAssertTrue(PKCE.isValidVerifier(a))
        XCTAssertFalse(a.contains("=") || a.contains("+") || a.contains("/"))
        XCTAssertFalse(PKCE.isValidVerifier("short"))
        XCTAssertFalse(PKCE.isValidVerifier(String(repeating: "a", count: 42) + "!"))
    }

    func testAuthorizeURL() throws {
        let url = try XCTUnwrap(OAuth.authorizeURL(supabaseURL: "https://abc.supabase.co/", challenge: "CH"))
        let c = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
        XCTAssertEqual(c.host, "abc.supabase.co")
        XCTAssertEqual(c.path, "/auth/v1/authorize")
        let q = Dictionary(uniqueKeysWithValues: (c.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(q["provider"], "google")
        XCTAssertEqual(q["redirect_to"], "unsolo://auth-callback")
        XCTAssertEqual(q["code_challenge"], "CH")
        XCTAssertEqual(q["code_challenge_method"], "s256")
    }

    func testCallbackParsing() {
        XCTAssertEqual(OAuth.parseCallback(URL(string: "unsolo://auth-callback?code=abc-123_X.y~z")!), .code("abc-123_X.y~z"))
        XCTAssertEqual(OAuth.parseCallback(URL(string: "unsolo://auth-callback#code=frag1")!), .code("frag1"))
        XCTAssertEqual(OAuth.parseCallback(URL(string: "unsolo://auth-callback?error=access_denied&error_description=User%20cancelled")!),
                       .error("User cancelled"))
        XCTAssertNil(OAuth.parseCallback(URL(string: "unsolo://auth-callback")!), "no code")
        XCTAssertNil(OAuth.parseCallback(URL(string: "unsolo://tribe?code=abc")!), "wrong host")
        XCTAssertNil(OAuth.parseCallback(URL(string: "https://auth-callback?code=abc")!), "wrong scheme")
        XCTAssertNil(OAuth.parseCallback(URL(string: "unsolo://auth-callback?code=a%20b")!), "bad characters")
        XCTAssertNil(DeepLink.parse(URL(string: "unsolo://auth-callback?code=abc")!), "callback is not routed as a deep link")
    }

    func testDemoPKCEExchangeSignsIn() async throws {
        let demo = DemoTransport(latency: 0...0, persist: false)
        let store = InMemorySecretStore()
        let auth = AuthManager(transport: demo, secrets: store, supabaseURL: "https://demo.supabase.co", anonKey: "k")
        try await auth.exchangePKCE(code: "demo-google-code", verifier: PKCE.makeVerifier())
        let signedIn = await auth.isSignedIn
        XCTAssertTrue(signedIn)
        XCTAssertNotNil(store.data(for: "supabase.session"), "tokens stored in the secret store (Keychain in the app)")
        do {
            try await auth.exchangePKCE(code: "x", verifier: "bad")
            XCTFail("invalid verifier should fail")
        } catch {}
    }
}
