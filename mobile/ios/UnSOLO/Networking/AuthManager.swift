import Foundation

/// Supabase Auth REST client + token holder. Sign-in goes to `{supabase.url}/auth/v1/...` directly
/// with the `apikey` header (api-v1.md "Sign-in"). Refresh is single-flight: concurrent 401s share one refresh.
actor AuthManager {
    private let transport: any HTTPTransport
    private let secrets: any SecretStore
    private var session: SupabaseSession?
    private var refreshTask: Task<SupabaseSession, Error>?
    private(set) var supabaseURL: String
    private(set) var anonKey: String
    private let sessionKey = "supabase.session"
    private var listeners: [UUID: @Sendable (Bool) -> Void] = [:]
    /// Count of refresh network calls (tests assert single-flight behaviour).
    private(set) var refreshCalls = 0

    init(transport: any HTTPTransport, secrets: any SecretStore, supabaseURL: String, anonKey: String) {
        self.transport = transport
        self.secrets = secrets
        self.supabaseURL = supabaseURL
        self.anonKey = anonKey
        if let data = secrets.data(for: sessionKey) {
            session = try? JSONDecoder().decode(SupabaseSession.self, from: data)
        }
    }

    func configure(supabaseURL: String, anonKey: String) {
        guard let url = URL(string: supabaseURL), url.scheme == "https" || url.host == "localhost" else { return }
        self.supabaseURL = supabaseURL
        self.anonKey = anonKey
    }

    var isSignedIn: Bool { session != nil }
    var accessToken: String? { session?.accessToken }

    func onChange(_ listener: @escaping @Sendable (Bool) -> Void) {
        listeners[UUID()] = listener
    }

    // MARK: Sign-in flows

    func signUp(email: String, password: String) async throws {
        let s: SupabaseSession = try await post("/signup", body: ["email": email, "password": password])
        store(s)
    }

    func signIn(email: String, password: String) async throws {
        let s: SupabaseSession = try await post("/token?grant_type=password", body: ["email": email, "password": password])
        store(s)
    }

    func sendEmailCode(_ email: String) async throws {
        try await postNoContent("/otp", body: ["email": email, "create_user": true])
    }

    func verifyEmailCode(email: String, code: String) async throws {
        let s: SupabaseSession = try await post("/verify", body: ["type": "email", "email": email, "token": code])
        store(s)
    }


    /// Google (and any Supabase OAuth provider) via PKCE: exchange the callback `code` with the verifier.
    func exchangePKCE(code: String, verifier: String) async throws {
        let s: SupabaseSession = try await post("/token?grant_type=pkce", body: ["auth_code": code, "code_verifier": verifier])
        store(s)
    }

    func recover(email: String) async throws {
        try await postNoContent("/recover", body: ["email": email])
    }

    func signOut() async {
        if let token = session?.accessToken {
            var req = request("/logout")
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.httpBody = Data("{}".utf8)
            _ = try? await transport.send(req)
        }
        clear()
    }

    /// Used by demo mode to start signed in.
    func adopt(_ s: SupabaseSession) { store(s) }

    // MARK: Refresh (single-flight)

    /// Returns a fresh access token. If another caller already refreshed past `staleToken`, returns that.
    func refreshedToken(after staleToken: String?) async throws -> String {
        if let current = session?.accessToken, current != staleToken { return current }
        if let task = refreshTask { return try await task.value.accessToken }
        guard let refreshToken = session?.refreshToken else { throw APIError.unauthorized }
        let task = Task { try await self.performRefresh(refreshToken) }
        refreshTask = task
        do {
            let s = try await task.value
            refreshTask = nil
            store(s)
            return s.accessToken
        } catch {
            refreshTask = nil
            if let api = error as? APIError, !api.isRetryable { clear() }
            throw error
        }
    }

    private func performRefresh(_ refreshToken: String) async throws -> SupabaseSession {
        refreshCalls += 1
        return try await post("/token?grant_type=refresh_token", body: ["refresh_token": refreshToken])
    }

    // MARK: Plumbing

    private func store(_ s: SupabaseSession) {
        let wasSignedIn = session != nil
        session = s
        if let data = try? JSONEncoder().encode(s) { secrets.set(data, for: sessionKey) }
        if !wasSignedIn { notify(true) }
    }

    private func clear() {
        let was = session != nil
        session = nil
        secrets.remove(sessionKey)
        if was { notify(false) }
    }

    private func notify(_ signedIn: Bool) {
        for l in listeners.values { l(signedIn) }
    }

    private func request(_ path: String) -> URLRequest {
        let url = URL(string: supabaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/auth/v1" + path)!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue(AppInfo.clientHeader, forHTTPHeaderField: "X-UnSOLO-Client")
        return req
    }

    private func post<T: Decodable & Sendable>(_ path: String, body: [String: any Sendable]) async throws -> T {
        var req = request(path)
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, http) = try await transport.send(req)
        guard (200..<300).contains(http.statusCode) else { throw Self.authError(http.statusCode, data) }
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw APIError.decoding("\(error)") }
    }

    private func postNoContent(_ path: String, body: [String: any Sendable]) async throws {
        var req = request(path)
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, http) = try await transport.send(req)
        guard (200..<300).contains(http.statusCode) else { throw Self.authError(http.statusCode, data) }
    }

    /// Supabase errors look like `{ "error": "invalid_grant", "error_description": "…" }` or `{ "msg": "…" }`.
    static func authError(_ status: Int, _ data: Data) -> APIError {
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        let msg = (obj?["error_description"] ?? obj?["msg"] ?? obj?["message"]) as? String
        switch status {
        case 400, 401, 403, 422: return .badRequest(msg ?? "That didn't work. Check and try again.", field: nil)
        case 429: return .rateLimited(retryAfter: nil)
        default: return .server(status, msg)
        }
    }
}
