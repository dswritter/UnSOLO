import Foundation

// Endpoints added for parity with the Android app (docs/revamp/api-v1.md).
extension APIClient {
    // MARK: Stories

    func statuses(user: String? = nil) async throws -> StatusesResponse { try await get("/statuses", query: ["user": user]) }
    func createStatus(_ body: CreateStatusBody) async throws -> StatusesResponse { try await call(.post, "/statuses", body: body) }
    func deleteStatus(_ id: String) async throws { try await callNoContent(.delete, "/statuses/\(id)") }
    func seenStatuses(_ ids: [String]) async throws { try await callNoContent(.post, "/statuses/seen", body: SeenStatusesBody(ids: ids)) }
    func reactStatus(_ id: String, kind: String?) async throws -> StatusReactionResponse {
        try await call(.put, "/statuses/\(id)/reaction", body: StatusReactionBody(kind: kind))
    }
    func statusComments(_ id: String) async throws -> StatusCommentsResponse { try await get("/statuses/\(id)/comments") }
    func commentStatus(_ id: String, body: String) async throws -> StatusComment {
        try await call(.post, "/statuses/\(id)/comments", body: StatusCommentBody(body: body))
    }

    // MARK: People, places, polls

    func people(_ q: String, limit: Int = 8) async throws -> PeopleResponse { try await get("/people", query: ["q": q, "limit": "\(limit)"]) }
    func places(_ q: String, limit: Int = 6) async throws -> PlacesResponse {
        try await get("/places", query: ["q": q, "limit": "\(limit)"], authenticated: false)
    }
    func vote(postId: String, choice: String?) async throws -> VoteResponse { try await call(.put, "/posts/\(postId)/vote", body: VoteBody(choice: choice)) }

    // MARK: Profiles

    func follow(_ username: String, on: Bool) async throws -> FollowResponse { try await call(on ? .put : .delete, "/users/\(username)/follow") }
    func followers(_ username: String) async throws -> UserListResponse { try await get("/users/\(username)/followers") }
    func following(_ username: String) async throws -> UserListResponse { try await get("/users/\(username)/following") }
    func requestPhone(_ username: String) async throws { try await callNoContent(.post, "/users/\(username)/phone-request") }
    func phoneRequests() async throws -> PhoneRequestsResponse { try await get("/me/phone-requests") }
    func decidePhoneRequest(_ id: String, approve: Bool) async throws {
        try await callNoContent(.put, "/me/phone-requests/\(id)", body: PhoneRequestDecisionBody(approve: approve))
    }
    func leaderboard() async throws -> LeaderboardResponse { try await get("/leaderboard") }
    func patchProfile(_ patch: ProfilePatch) async throws -> MeResponse { try await call(.patch, "/me", body: patch) }
    func referrals() async throws -> ReferralsResponse { try await get("/me/referrals") }
    func offers() async throws -> OffersResponse { try await get("/offers") }

    func explorePage(q: String?, category: String, cursor: String?, limit: Int = 20) async throws -> ExplorePage {
        try await get("/explore", query: ["q": q, "category": category, "cursor": cursor, "limit": "\(limit)"])
    }

    // MARK: Foreground upload with progress (stories, avatar)

    /// `POST /uploads` with a multipart body, reporting how much has been sent (0…1).
    /// Posts use the background uploader; this one is for uploads the user is watching.
    func upload(jpeg: Data, purpose: String, progress: @escaping @Sendable (Double) -> Void) async throws -> Media {
        let boundary = "unsolo-\(UUID().uuidString)"
        var body = Data()
        func line(_ s: String) { body.append(Data(s.utf8)) }
        line("--\(boundary)\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\n\(purpose)\r\n")
        line("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n")
        body.append(jpeg)
        line("\r\n--\(boundary)--\r\n")

        func request(_ token: String?) -> URLRequest {
            var req = URLRequest(url: makeURL("/uploads"))
            req.httpMethod = "POST"
            req.setValue(AppInfo.clientHeader, forHTTPHeaderField: "X-UnSOLO-Client")
            req.setValue("application/json", forHTTPHeaderField: "Accept")
            req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            req.httpBody = body
            return req
        }

        func perform(_ token: String?) async throws -> (Data, HTTPURLResponse) {
            if let switching = transport as? SwitchingTransport, !switching.useDemo {
                var req = request(token)
                req.httpBody = nil
                let delegate = UploadProgressDelegate(progress)
                do {
                    let (data, response) = try await switching.live.session.upload(for: req, from: body, delegate: delegate)
                    guard let http = response as? HTTPURLResponse else { throw APIError.transport("Not an HTTP response") }
                    return (data, http)
                } catch let e as URLError {
                    switch e.code {
                    case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .timedOut, .dataNotAllowed:
                        throw APIError.offline
                    default: throw APIError.transport(e.localizedDescription)
                    }
                }
            }
            // Demo and test transports: no streaming, report the whole body at once.
            let r = try await transport.send(request(token))
            progress(1)
            return r
        }

        let token = await auth.accessToken
        var (data, http) = try await perform(token)
        if http.statusCode == 401, token != nil {
            let fresh = try await auth.refreshedToken(after: token)
            (data, http) = try await perform(fresh)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.from(status: http.statusCode, data: data, headers: http.allHeaderFields)
        }
        let r: UploadResponse = try decode(data)
        return r.media
    }
}

private final class UploadProgressDelegate: NSObject, URLSessionTaskDelegate, Sendable {
    let onProgress: @Sendable (Double) -> Void
    init(_ onProgress: @escaping @Sendable (Double) -> Void) { self.onProgress = onProgress }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64,
                    totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        onProgress(Double(totalBytesSent) / Double(totalBytesExpectedToSend))
    }
}
