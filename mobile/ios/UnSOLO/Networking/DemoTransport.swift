import Foundation

/// Serves the `/api/v1` contract and Supabase Auth from bundled fixtures (Resources/Demo/*.json),
/// so every screen works before the backend is deployed. Mutations (posts, joins, comments, messages…)
/// are applied to an in-memory copy and saved to Application Support/demo-state.json.
final class DemoTransport: HTTPTransport {
    let backend: DemoBackend
    let latency: ClosedRange<Int>

    init(latency: ClosedRange<Int> = 120...320, persist: Bool = true) {
        self.latency = latency
        backend = DemoBackend(persist: persist)
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        if !latency.isEmpty, !AppInfo.isRunningTests {
            try await Task.sleep(for: .milliseconds(Int.random(in: latency)))
        }
        let result = await backend.handle(DemoRequest(request))
        let url = request.url ?? URL(string: "https://demo.invalid")!
        var headers = ["Content-Type": "application/json", "Cache-Control": "private, no-store"]
        if let retry = result.retryAfter { headers["Retry-After"] = "\(retry)" }
        let http = HTTPURLResponse(url: url, statusCode: result.status, httpVersion: "HTTP/1.1", headerFields: headers)!
        return (result.body, http)
    }
}

struct DemoRequest: Sendable {
    let method: String
    let path: [String]
    let isAuth: Bool
    let query: [String: String]
    let body: Data?
    let bearer: String?

    init(_ r: URLRequest) {
        method = r.httpMethod ?? "GET"
        let url = r.url ?? URL(string: "https://demo.invalid")!
        let comps = url.path.split(separator: "/").map(String.init)
        if let i = comps.firstIndex(of: "auth"), comps.count > i + 1, comps[i + 1] == "v1" {
            isAuth = true
            path = Array(comps[(i + 2)...])
        } else if let i = comps.firstIndex(of: "v1") {
            isAuth = false
            path = Array(comps[(i + 1)...])
        } else {
            isAuth = false
            path = comps
        }
        var q: [String: String] = [:]
        for item in URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? [] { q[item.name] = item.value ?? "" }
        query = q
        body = r.httpBody
        bearer = r.value(forHTTPHeaderField: "Authorization").map { $0.replacingOccurrences(of: "Bearer ", with: "") }
    }

    var json: [String: Any] {
        guard let body, let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return [:] }
        return obj
    }
}

struct DemoResult: Sendable {
    var status: Int
    var body: Data
    var retryAfter: Int?
}

/// Mutable demo state. Codable so mutations survive relaunches.
struct DemoState: Codable {
    var posts: [String: Post]
    var feedOrder: [String] // "post:<id>" or "trip:<slug>"
    var comments: [String: [Comment]]
    var offers: [String: [HostOffer]]
    var requests: [String: [JoinRequest]]
    var bookingsUpcoming: [Booking]
    var bookingsPast: [Booking]
    var notifications: [AppNotification]
    var chats: [ChatSummary]
    var messages: [String: [ChatMessage]]
    var profiles: [String: ProfileResponse]
    var me: MeResponse
    var landingDismissed: Bool
    var clientIds: [String: String] // clientId → created object id
    var blocked: [String]
    var visits: [String: Int]
}

actor DemoBackend {
    private var state: DemoState
    private let explore: [String: [TripLite]]
    private let details: [String: TripDetail]
    private let suggestions: SuggestionsResponse
    private let config: Data
    private let landing: LandingSuggestion
    private let saveURL: URL
    private let persist: Bool
    static let demoOTP = "123456"

    init(persist: Bool = true) {
        self.persist = persist
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        saveURL = dir.appendingPathComponent("demo-state.json")
        let d = JSON.decoder()
        explore = (try? d.decode([String: [TripLite]].self, from: Self.fixture("explore"))) ?? [:]
        details = (try? d.decode([String: TripDetail].self, from: Self.fixture("trip-details"))) ?? [:]
        suggestions = (try? d.decode(SuggestionsResponse.self, from: Self.fixture("suggestions"))) ?? SuggestionsResponse(items: [])
        config = Self.fixture("config")
        landing = (try? d.decode(LandingSuggestion.self, from: Self.fixture("landing-suggestion")))
            ?? LandingSuggestion(suggest: nil, visits: .init(explore: 0, tribe: 0, trips: 0))
        if UserDefaults.standard.bool(forKey: "resetState") { try? FileManager.default.removeItem(at: saveURL) }
        if persist, let data = try? Data(contentsOf: saveURL), let saved = try? d.decode(DemoState.self, from: data) {
            state = saved
        } else {
            state = Self.initialState()
        }
    }

    static func fixture(_ name: String) -> Data {
        let bundles = [Bundle.main, Bundle(for: BundleToken.self)]
        for b in bundles {
            if let url = b.url(forResource: name, withExtension: "json", subdirectory: "Demo")
                ?? b.url(forResource: name, withExtension: "json"),
               let data = try? Data(contentsOf: url) { return data }
        }
        return Data("{}".utf8)
    }

    static func initialState() -> DemoState {
        let d = JSON.decoder()
        let feed = (try? d.decode(FeedResponse.self, from: fixture("feed")))
        let my = (try? d.decode(MyTripsResponse.self, from: fixture("my-trips"))) ?? .empty
        let profiles = (try? d.decode([String: ProfileResponse].self, from: fixture("users"))) ?? [:]
        var posts: [String: Post] = [:]
        var order: [String] = []
        for item in feed?.items ?? [] {
            switch item {
            case .post(let p): posts[p.id] = p; order.append("post:\(p.id)")
            case .placedTrip(let t): order.append("trip:\(t.slug)")
            }
        }
        for p in my.plans + my.requested { posts[p.id] = posts[p.id] ?? p }
        for prof in profiles.values { for p in prof.posts { posts[p.id] = posts[p.id] ?? p } }
        let me = (try? d.decode(MeResponse.self, from: fixture("me")))!
        return DemoState(
            posts: posts, feedOrder: order,
            comments: (try? d.decode([String: [Comment]].self, from: fixture("comments"))) ?? [:],
            offers: (try? d.decode([String: [HostOffer]].self, from: fixture("offers"))) ?? [:],
            requests: (try? d.decode([String: [JoinRequest]].self, from: fixture("requests"))) ?? [:],
            bookingsUpcoming: my.upcoming, bookingsPast: my.past,
            notifications: (try? d.decode(NotificationsResponse.self, from: fixture("notifications")))?.items ?? [],
            chats: (try? d.decode(Page<ChatSummary>.self, from: fixture("chats")))?.items ?? [],
            messages: (try? d.decode([String: [ChatMessage]].self, from: fixture("messages"))) ?? [:],
            profiles: profiles, me: me, landingDismissed: false, clientIds: [:], blocked: [], visits: [:])
    }

    private func save() {
        guard persist else { return }
        let snapshot = state
        let url = saveURL
        Task.detached(priority: .utility) {
            if let data = try? JSON.encoder().encode(snapshot) { try? data.write(to: url, options: .atomic) }
        }
    }

    // MARK: - Routing

    func handle(_ r: DemoRequest) -> DemoResult {
        if r.isAuth { return handleAuth(r) }
        let signedIn = r.bearer?.hasPrefix("demo-access-") == true
        let p = r.path
        func needAuth() -> DemoResult? { signedIn ? nil : err("unauthorized", 401) }

        switch (r.method, p.count, p.first ?? "") {
        case ("GET", 1, "config"): return DemoResult(status: 200, body: config)
        case ("GET", 1, "me"): return needAuth() ?? ok(state.me)
        case ("PATCH", 1, "me"):
            if let e = needAuth() { return e }
            let j = r.json
            if let v = j["name"] as? String { state.me.user.name = v }
            if let v = j["bio"] as? String { state.me.user.bio = v }
            if let v = j["gender"] as? String { state.me.user.gender = v }
            if let v = j["homeCity"] as? String { state.me.user.homeCity = v }
            save()
            return ok(state.me)
        case ("GET", 2, "me") where p[1] == "preferences": return needAuth() ?? ok(state.me.preferences)
        case ("PUT", 2, "me") where p[1] == "preferences":
            if let e = needAuth() { return e }
            if let patch = try? JSON.decoder().decode(PreferencesPatch.self, from: r.body ?? Data()) {
                var prefs = state.me.preferences
                if let v = patch.landingTab { prefs.landingTab = v }
                if let v = patch.notify { prefs.notify = v }
                if let v = patch.interests { prefs.interests = v }
                if let v = patch.suggestByLocation { prefs.suggestByLocation = v }
                if let v = patch.suggestByGender { prefs.suggestByGender = v }
                if let v = patch.shareLocation { prefs.shareLocation = v }
                if let v = patch.dataSaver { prefs.dataSaver = v }
                state.me.preferences = prefs
                save()
            }
            return ok(state.me.preferences)
        case ("GET", 2, "me") where p[1] == "landing-suggestion":
            if let e = needAuth() { return e }
            var s = landing
            if state.landingDismissed || state.me.preferences.landingTab == s.suggest { s.suggest = nil }
            return ok(s)
        case ("POST", 3, "me") where p[1] == "landing-suggestion" && p[2] == "dismiss":
            state.landingDismissed = true
            save()
            return noContent()
        case ("POST", 3, "me") where p[1] == "phone" && p[2] == "start":
            if let e = needAuth() { return e }
            return ok(PhoneStartResponse(sent: true, devCode: Self.demoOTP))
        case ("POST", 3, "me") where p[1] == "phone" && p[2] == "verify":
            if let e = needAuth() { return e }
            guard (r.json["code"] as? String) == Self.demoOTP else { return err("bad_request", 400, "That code didn't match. Try 123456.") }
            state.me.user.isPhoneVerified = true
            if let ph = r.json["phone"] as? String { state.me.user.phone = ph }
            save()
            return ok(PhoneVerifyResponse(verified: true))
        case (_, 1, "devices"): return needAuth() ?? noContent()
        case ("POST", 1, "events"):
            if let events = try? JSON.decoder().decode(EventsBody.self, from: r.body ?? Data()) {
                for e in events.events where e.name == "screen.view" { state.visits[e.screen ?? "", default: 0] += 1 }
            }
            return DemoResult(status: 202, body: Data("{}".utf8))
        case ("GET", 1, "explore"): return exploreList(r)
        case ("GET", 2, "trips"): return tripDetail(p[1], signedIn: signedIn)
        case ("GET", 2, "my") where p[1] == "trips": return needAuth() ?? ok(myTrips())
        case ("GET", 1, "feed"): return feed(r, signedIn: signedIn)
        case ("POST", 1, "posts"): return needAuth() ?? createPost(r)
        case ("GET", 2, "posts"): return postDetail(p[1], signedIn: signedIn)
        case ("PATCH", 2, "posts"): return needAuth() ?? patchPost(p[1], r)
        case ("DELETE", 2, "posts"):
            if let e = needAuth() { return e }
            state.posts[p[1]] = nil
            state.feedOrder.removeAll { $0 == "post:\(p[1])" }
            save()
            return noContent()
        case (_, 4, "posts") where p[2] == "reactions": return needAuth() ?? react(p[1], kind: p[3], on: r.method == "PUT")
        case (_, 3, "posts") where p[2] == "save":
            if let e = needAuth() { return e }
            mutatePost(p[1]) { $0.viewer?.saved = r.method == "PUT" }
            return noContent()
        case ("GET", 3, "posts") where p[2] == "comments":
            return ok(Page(items: state.comments[p[1]] ?? [], nextCursor: nil))
        case ("POST", 3, "posts") where p[2] == "comments": return needAuth() ?? addComment(p[1], r)
        case ("DELETE", 2, "comments"):
            if let e = needAuth() { return e }
            for (k, list) in state.comments {
                state.comments[k] = list.filter { $0.id != p[1] }.map { c in
                    var c = c
                    c.replies.removeAll { $0.id == p[1] }
                    return c
                }
            }
            save()
            return noContent()
        case ("POST", 3, "posts") where p[2] == "join": return needAuth() ?? join(p[1], r)
        case ("DELETE", 3, "posts") where p[2] == "join": return needAuth() ?? withdraw(p[1])
        case ("GET", 3, "posts") where p[2] == "requests":
            if let e = needAuth() { return e }
            return ok(JoinRequestsResponse(items: state.requests[p[1]] ?? []))
        case ("POST", 4, "posts") where p[2] == "requests": return needAuth() ?? decide(p[1], userId: p[3], r)
        case ("POST", 3, "posts") where p[2] == "offers": return needAuth() ?? makeOffer(p[1], r)
        case ("POST", 3, "offers"): return needAuth() ?? offerDecision(p[1], accept: p[2] == "accept", r)
        case ("GET", 2, "users"):
            guard let prof = state.profiles[p[1]] else { return err("not_found", 404) }
            var prof2 = prof
            prof2.posts = prof.posts.map { state.posts[$0.id] ?? $0 }
            if let open = prof.openPlan { prof2.openPlan = state.posts[open.id] ?? open }
            if p[1] == state.me.user.username {
                prof2.posts = state.posts.values.filter { $0.author.id == state.me.user.id }.sorted { $0.createdAt > $1.createdAt }
            }
            return ok(prof2)
        case ("GET", 1, "suggestions"):
            var s = suggestions
            s.items = s.items.map { item in
                var item = item
                if let post = item.post { item.post = state.posts[post.id] ?? post }
                return item
            }
            return ok(s)
        case ("GET", 1, "chats"):
            if let e = needAuth() { return e }
            var items = state.chats
            if let t = r.query["type"], !t.isEmpty { items = items.filter { $0.type == t } }
            return ok(Page(items: items.sorted { ($0.lastMessage?.at ?? .distantPast) > ($1.lastMessage?.at ?? .distantPast) }, nextCursor: nil))
        case ("GET", 3, "chats") where p[2] == "messages": return needAuth() ?? messages(p[1], r)
        case ("POST", 3, "chats") where p[2] == "messages": return needAuth() ?? sendMessage(p[1], r)
        case ("POST", 3, "chats") where p[2] == "read":
            if let e = needAuth() { return e }
            if let i = state.chats.firstIndex(where: { $0.id == p[1] }) { state.chats[i].unread = 0 }
            save()
            return noContent()
        case ("POST", 2, "chats") where p[1] == "direct": return needAuth() ?? directChat(r)
        case ("POST", 1, "reports"):
            if let e = needAuth() { return e }
            return ok(ReportResponse(id: UUID().uuidString.lowercased()), status: 201)
        case ("POST", 1, "blocks"):
            if let e = needAuth() { return e }
            if let id = r.json["userId"] as? String { state.blocked.append(id) }
            save()
            return noContent()
        case ("DELETE", 2, "blocks"):
            state.blocked.removeAll { $0 == p[1] }
            save()
            return noContent()
        case ("GET", 1, "notifications"):
            if let e = needAuth() { return e }
            let items = state.notifications.sorted { $0.createdAt > $1.createdAt }
            return ok(NotificationsResponse(items: items, nextCursor: nil, unread: items.filter { !$0.isRead }.count))
        case ("POST", 2, "notifications") where p[1] == "read":
            if let e = needAuth() { return e }
            let all = r.json["all"] as? Bool ?? false
            let ids = Set(r.json["ids"] as? [String] ?? [])
            for i in state.notifications.indices where all || ids.contains(state.notifications[i].id) { state.notifications[i].isRead = true }
            save()
            return noContent()
        case ("GET", 1, "sync"):
            if let e = needAuth() { return e }
            let unread = state.notifications.filter { !$0.isRead }.count
            let memberships = state.posts.values.compactMap { post -> SyncResponse.MembershipChange? in
                guard let m = post.viewer?.membership, post.kind == .plan, post.viewer?.isAuthor == false else { return nil }
                return .init(postId: post.id, state: m)
            }
            return ok(SyncResponse(serverTime: Date(), posts: [], removedPosts: [], notifications: unread,
                                   unreadNotifications: unread, memberships: memberships))
        case ("POST", 1, "uploads"):
            if let e = needAuth() { return e }
            let seed = Int.random(in: 1...40)
            return ok(UploadResponse(url: "demo://photo/himachal?seed=\(seed)", thumbUrl: nil, lqip: nil, width: 2048, height: 1536,
                                     bytes: r.body?.count), status: 201)
        default:
            return err("not_found", 404, "Demo route not found: \(r.method) /\(p.joined(separator: "/"))")
        }
    }

    // MARK: - Auth (Supabase)

    private func handleAuth(_ r: DemoRequest) -> DemoResult {
        let j = r.json
        func session() -> DemoResult {
            let s = SupabaseSession(accessToken: "demo-access-\(UUID().uuidString)", refreshToken: "demo-refresh-\(UUID().uuidString)",
                                    expiresIn: 3600, expiresAt: Int(Date().timeIntervalSince1970) + 3600, tokenType: "bearer")
            return DemoResult(status: 200, body: (try? JSONEncoder().encode(s)) ?? Data())
        }
        func authErr(_ msg: String) -> DemoResult {
            DemoResult(status: 400, body: (try? JSONSerialization.data(withJSONObject: ["error": "invalid_grant", "error_description": msg])) ?? Data())
        }
        switch r.path.first ?? "" {
        case "token":
            if r.query["grant_type"] == "pkce" {
                // Google sign-in in demo mode: any code + valid verifier signs in the demo traveller.
                guard let code = j["auth_code"] as? String, !code.isEmpty,
                      let verifier = j["code_verifier"] as? String, PKCE.isValidVerifier(verifier) else {
                    return authErr("invalid flow state, no valid flow state found")
                }
                markAccount(email: "dev@example.com", viaPhone: false)
                return session()
            }
            if r.query["grant_type"] == "refresh_token" {
                guard (j["refresh_token"] as? String)?.hasPrefix("demo-refresh-") == true else { return authErr("Invalid Refresh Token") }
                return session()
            }
            guard let email = j["email"] as? String, email.contains("@"), (j["password"] as? String ?? "").count >= 6 else {
                return authErr("Invalid login credentials")
            }
            markAccount(email: email, viaPhone: false)
            return session()
        case "signup":
            guard let email = j["email"] as? String, email.contains("@") else { return authErr("Enter a valid email") }
            guard (j["password"] as? String ?? "").count >= 6 else { return authErr("Password should be at least 6 characters") }
            markAccount(email: email, viaPhone: false)
            return session()
        case "otp", "recover":
            return DemoResult(status: 200, body: Data("{}".utf8))
        case "verify":
            guard (j["token"] as? String) == Self.demoOTP else { return authErr("Token has expired or is invalid. In demo mode the code is 123456.") }
            if let email = j["email"] as? String { markAccount(email: email, viaPhone: false) }
            if let phone = j["phone"] as? String { markAccount(email: nil, viaPhone: true, phone: phone) }
            return session()
        case "logout":
            return DemoResult(status: 204, body: Data())
        default:
            return DemoResult(status: 404, body: Data("{}".utf8))
        }
    }

    /// The demo always signs in as Dev Sharma. Email sign-ins with an address other than the demo one start
    /// without a verified phone, so the phone-verification gate can be tried.
    private func markAccount(email: String?, viaPhone: Bool, phone: String? = nil) {
        if viaPhone {
            state.me.user.isPhoneVerified = true
            if let phone { state.me.user.phone = phone }
        } else if let email {
            state.me.user.email = email
            state.me.user.isPhoneVerified = email.lowercased() == "dev@example.com"
        }
        save()
    }

    // MARK: - Explore

    private func exploreList(_ r: DemoRequest) -> DemoResult {
        let category = r.query["category"].flatMap { $0.isEmpty ? nil : $0 } ?? "trips"
        var items = explore[category] ?? []
        if let q = r.query["q"]?.lowercased(), !q.isEmpty {
            let all = explore.values.flatMap { $0 }
            items = all.filter { $0.title.lowercased().contains(q) || ($0.place?.name.lowercased().contains(q) ?? false) }
        }
        if let month = r.query["month"], !month.isEmpty { items = items.filter { $0.nextDeparture?.hasPrefix(month) ?? false } }
        items.sort { ($0.nextDeparture ?? "9") < ($1.nextDeparture ?? "9") }
        return ok(ExplorePage(items: items, nextCursor: nil))
    }

    private func tripDetail(_ slug: String, signedIn: Bool) -> DemoResult {
        guard var d = details[slug] else { return err("not_found", 404) }
        d.stories = d.stories.map { state.posts[$0.id] ?? $0 }
        if !signedIn {
            d.goingFaces = []
            d.seats = d.seats.map { s in s.state == .member ? Seat(state: .member, user: nil) : s }
        }
        if state.bookingsUpcoming.contains(where: { $0.trip.slug == slug }), let i = d.seats.lastIndex(where: { $0.state == .member }) {
            d.seats[i] = Seat(state: .you, user: state.me.user.lite)
        }
        return ok(d)
    }

    private func myTrips() -> MyTripsResponse {
        let mine = state.posts.values.filter { $0.kind == .plan && ($0.viewer?.membership == .approved || $0.viewer?.isAuthor == true) && $0.status != .cancelled }
        let requested = state.posts.values.filter { $0.kind == .plan && $0.viewer?.membership == .requested && $0.viewer?.isAuthor == false }
        return MyTripsResponse(upcoming: state.bookingsUpcoming,
                               plans: mine.sorted { ($0.startsOn ?? "") < ($1.startsOn ?? "") },
                               requested: requested.sorted { ($0.startsOn ?? "") < ($1.startsOn ?? "") },
                               past: state.bookingsPast)
    }

    // MARK: - Tribe

    private func viewerAdjusted(_ post: Post, signedIn: Bool) -> Post {
        guard !signedIn else { return post }
        var p = post
        p.viewer = .guest
        p.meetingPoint = nil
        p.myReactions = []
        p.seats = p.seats.map { $0.state == .you ? Seat(state: .member, user: $0.user) : $0 }
        return p
    }

    private func feed(_ r: DemoRequest, signedIn: Bool) -> DemoResult {
        let kind = r.query["kind"].flatMap { PostKind(rawValue: $0) }
        let place = r.query["place"]?.lowercased()
        var items: [FeedItem] = []
        for ref in state.feedOrder {
            if ref.hasPrefix("trip:") {
                guard kind == nil, place == nil || place?.isEmpty == true else { continue }
                let slug = String(ref.dropFirst(5))
                if let t = explore.values.flatMap({ $0 }).first(where: { $0.slug == slug }) { items.append(.placedTrip(t)) }
                continue
            }
            guard let post = state.posts[String(ref.dropFirst(5))], post.status == .live else { continue }
            if state.blocked.contains(post.author.id) { continue }
            if let kind, post.kind != kind { continue }
            if let place, !place.isEmpty, !(post.place?.name.lowercased().contains(place) ?? false) { continue }
            items.append(.post(viewerAdjusted(post, signedIn: signedIn)))
        }
        let next = ["chalo-himachal", "rishikesh-weekend", "rupin-pass-trek"].compactMap { slug in
            explore.values.flatMap { $0 }.first { $0.slug == slug }
        }
        return ok(FeedResponse(items: items, nextCursor: nil, caughtUp: true, nextDepartures: next))
    }

    private func postDetail(_ id: String, signedIn: Bool) -> DemoResult {
        guard let post = state.posts[id] else { return err("not_found", 404) }
        let insider = post.viewer?.isAuthor == true || post.viewer?.membership == .approved
        return ok(PostDetailResponse(post: viewerAdjusted(post, signedIn: signedIn), comments: state.comments[id] ?? [],
                                     offers: signedIn && insider ? (state.offers[id] ?? []) : []))
    }

    private func requirePhone() -> DemoResult? {
        state.me.user.isPhoneVerified ? nil : err("phone_required", 403, "Verify your phone number to post, comment or join.")
    }

    private func createPost(_ r: DemoRequest) -> DemoResult {
        if let e = requirePhone() { return e }
        guard let body = try? JSON.decoder().decode(CreatePostBody.self, from: r.body ?? Data()) else { return err("bad_request", 400) }
        if let existing = state.clientIds[body.clientId], let post = state.posts[existing] {
            return ok(CreatePostResponse(post: post, moderation: .init(state: post.status == .held ? "held" : "live", prompts: [])))
        }
        guard body.body.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 else {
            return err("bad_request", 400, "Write a little more.", field: "body")
        }
        let screened = DemoModeration.screen(body.body)
        let held = screened.prompts.contains("money")
        let me = state.me.user.lite
        let now = Date()
        var seats: [Seat] = []
        if body.kind == .plan {
            seats.append(Seat(state: .you, user: me))
            for _ in 1..<max(1, body.spotsTotal ?? 2) { seats.append(Seat(state: .open, user: nil)) }
        }
        let trip = body.tripPackageId.flatMap { id in explore.values.flatMap { $0 }.first { $0.id == id } }
        let post = Post(id: UUID().uuidString.lowercased(), kind: body.kind, author: me, title: body.title, body: screened.body,
                        place: body.place, startsOn: body.startsOn, endsOn: body.endsOn, spotsTotal: body.spotsTotal,
                        memberCount: 1, audience: body.audience ?? .anyone, estCostText: body.estCostText, media: body.media ?? [],
                        trip: trip,
                        poll: body.poll.map { labels in Poll(options: labels.map { PollOption(id: UUID().uuidString.lowercased(), label: $0, votes: 0) }, myChoice: nil) },
                        reactions: .zero, myReactions: [], commentCount: 0, status: held ? .held : .live, seats: seats,
                        createdAt: now, updatedAt: now,
                        viewer: Viewer(isAuthor: true, membership: body.kind == .plan ? .approved : nil, saved: false, canJoin: false, joinBlockedReason: .ownPlan),
                        meetingPoint: body.meetingPoint)
        state.posts[post.id] = post
        state.clientIds[body.clientId] = post.id
        if !held { state.feedOrder.insert("post:\(post.id)", at: 0) }
        save()
        return ok(CreatePostResponse(post: post, moderation: .init(state: held ? "held" : "live", prompts: screened.prompts)), status: 201)
    }

    private func patchPost(_ id: String, _ r: DemoRequest) -> DemoResult {
        guard state.posts[id] != nil else { return err("not_found", 404) }
        let j = r.json
        var prompts: [String] = []
        mutatePost(id) { p in
            if let v = j["title"] as? String { p.title = v }
            if let v = j["body"] as? String {
                let s = DemoModeration.screen(v)
                p.body = s.body
                prompts = s.prompts
                if p.status == .held && !s.prompts.contains("money") { p.status = .live }
            }
            if (j["status"] as? String) == "cancelled" { p.status = .cancelled }
            if (j["confirmNonCommercial"] as? Bool) == true, p.status == .held { p.status = .live }
            if let v = j["estCostText"] as? String { p.estCostText = v }
            if let v = j["meetingPoint"] as? String { p.meetingPoint = v }
            p.updatedAt = Date()
        }
        if let p = state.posts[id], p.status == .live, !state.feedOrder.contains("post:\(id)") { state.feedOrder.insert("post:\(id)", at: 0) }
        save()
        let post = state.posts[id]!
        return ok(CreatePostResponse(post: post, moderation: .init(state: post.status == .held ? "held" : "live", prompts: prompts)))
    }

    private func mutatePost(_ id: String, _ f: (inout Post) -> Void) {
        guard var p = state.posts[id] else { return }
        f(&p)
        state.posts[id] = p
        save()
    }

    private func react(_ id: String, kind raw: String, on: Bool) -> DemoResult {
        if let e = requirePhone() { return e }
        guard let kind = ReactionKind(rawValue: raw), state.posts[id] != nil else { return err("not_found", 404) }
        mutatePost(id) { p in
            let has = p.myReactions.contains(kind)
            if on && !has { p.myReactions.append(kind); p.reactions[kind] += 1 }
            if !on && has { p.myReactions.removeAll { $0 == kind }; p.reactions[kind] = max(0, p.reactions[kind] - 1) }
        }
        let p = state.posts[id]!
        return ok(ReactionsResponse(reactions: p.reactions, myReactions: p.myReactions))
    }

    private func addComment(_ postId: String, _ r: DemoRequest) -> DemoResult {
        if let e = requirePhone() { return e }
        guard let body = try? JSON.decoder().decode(CommentBody.self, from: r.body ?? Data()) else { return err("bad_request", 400) }
        if let existing = state.clientIds[body.clientId] {
            for c in state.comments[postId] ?? [] {
                if c.id == existing { return ok(c) }
                if let reply = c.replies.first(where: { $0.id == existing }) { return ok(reply) }
            }
        }
        let comment = Comment(id: UUID().uuidString.lowercased(), postId: postId, parentId: body.parentId, author: state.me.user.lite,
                              body: DemoModeration.screen(body.body).body, pollChoice: body.pollChoice, createdAt: Date(), replies: [])
        var list = state.comments[postId] ?? []
        if let parent = body.parentId, let i = list.firstIndex(where: { $0.id == parent }) {
            list[i].replies.append(comment)
        } else {
            list.append(comment)
        }
        state.comments[postId] = list
        state.clientIds[body.clientId] = comment.id
        mutatePost(postId) { p in
            p.commentCount += 1
            if let choice = body.pollChoice, var poll = p.poll, poll.myChoice == nil,
               let oi = poll.options.firstIndex(where: { $0.id == choice }) {
                poll.options[oi].votes += 1
                poll.myChoice = choice
                p.poll = poll
            }
        }
        return ok(comment, status: 201)
    }

    private func join(_ id: String, _ r: DemoRequest) -> DemoResult {
        if let e = requirePhone() { return e }
        guard let post = state.posts[id] else { return err("not_found", 404) }
        let intro = (r.json["intro"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard (10...500).contains(intro.count) else { return err("bad_request", 400, "Say a little about yourself (10–500 characters).", field: "intro") }
        if post.viewer?.isAuthor == true { return err("forbidden", 403, "This is your plan.") }
        if post.audience == .women && state.me.user.gender != "woman" { return err("forbidden", 403, "This plan is for women only.") }
        if post.viewer?.membership == .requested {
            return ok(JoinResponse(membership: .requested, expiresAt: Date().addingTimeInterval(72 * 3600)))
        }
        guard post.openSpots > 0 else { return err("conflict", 409, "This plan just filled up.") }
        mutatePost(id) { p in
            p.viewer = Viewer(isAuthor: false, membership: .requested, saved: p.viewer?.saved ?? false, canJoin: false, joinBlockedReason: nil)
            if let i = p.seats.firstIndex(where: { $0.state == .open }) { p.seats[i] = Seat(state: .requested, user: state.me.user.lite) }
        }
        return ok(JoinResponse(membership: .requested, expiresAt: Date().addingTimeInterval(72 * 3600)))
    }

    private func withdraw(_ id: String) -> DemoResult {
        mutatePost(id) { p in
            p.viewer?.membership = .withdrawn
            p.viewer?.canJoin = true
            if let i = p.seats.firstIndex(where: { $0.state == .requested }) { p.seats[i] = Seat(state: .open, user: nil) }
        }
        return noContent()
    }

    private func decide(_ postId: String, userId: String, _ r: DemoRequest) -> DemoResult {
        let approve = (r.json["decision"] as? String) == "approve"
        guard var list = state.requests[postId], let i = list.firstIndex(where: { $0.user.id == userId }) else { return err("not_found", 404) }
        list[i].state = approve ? .approved : .declined
        let user = list[i].user.lite
        state.requests[postId] = list
        if approve {
            mutatePost(postId) { p in
                if let si = p.seats.firstIndex(where: { $0.state == .open }) { p.seats[si] = Seat(state: .member, user: user) }
                p.memberCount += 1
            }
        }
        save()
        return ok(DecisionResponse(state: approve ? .approved : .declined))
    }

    private func makeOffer(_ postId: String, _ r: DemoRequest) -> DemoResult {
        guard state.me.user.isHost else { return err("forbidden", 403, "Only hosts can make offers.") }
        guard let body = try? JSON.decoder().decode(OfferBody.self, from: r.body ?? Data()) else { return err("bad_request", 400) }
        let offer = HostOffer(id: UUID().uuidString.lowercased(), postId: postId, host: state.me.user.lite, pricePaise: body.pricePaise,
                              includes: body.includes, notes: body.notes, extraSeats: body.extraSeats ?? 0, state: .pending,
                              expiresAt: Date().addingTimeInterval(7 * 86_400), packageSlug: nil, payBy: nil)
        state.offers[postId, default: []].append(offer)
        save()
        return ok(offer, status: 201)
    }

    private func offerDecision(_ offerId: String, accept: Bool, _ r: DemoRequest) -> DemoResult {
        for (postId, list) in state.offers {
            guard let i = list.firstIndex(where: { $0.id == offerId }) else { continue }
            if accept {
                // Contract: body { expectedPricePaise } must match the current offer, else 409.
                guard let expected = (r.json["expectedPricePaise"] as? NSNumber)?.intValue else {
                    return err("bad_request", 400, "expectedPricePaise is required.", field: "expectedPricePaise")
                }
                guard expected == list[i].pricePaise else {
                    return err("conflict", 409, "The host changed this offer. Review the new price.")
                }
                guard list[i].state == .pending else { return err("conflict", 409, "This offer is no longer open.") }
            }
            var updated = list
            if accept {
                for j in updated.indices where j != i && updated[j].state == .pending { updated[j].state = .declined }
                updated[i].state = .accepted
                updated[i].packageSlug = "tosh-kalga-weekend-hosted"
                updated[i].payBy = Date().addingTimeInterval(48 * 3600)
            } else {
                updated[i].state = .declined
            }
            state.offers[postId] = updated
            save()
            if accept { return ok(AcceptOfferResponse(packageSlug: updated[i].packageSlug!, payBy: updated[i].payBy)) }
            return noContent()
        }
        return err("not_found", 404)
    }

    /// Demo/QA only: simulate the host editing an offer's price after the organiser saw it.
    func setOfferPrice(_ offerId: String, pricePaise: Int) {
        for (postId, list) in state.offers {
            guard let i = list.firstIndex(where: { $0.id == offerId }) else { continue }
            var updated = list
            updated[i].pricePaise = pricePaise
            state.offers[postId] = updated
            save()
        }
    }

    // MARK: - Chat

    private func messages(_ roomId: String, _ r: DemoRequest) -> DemoResult {
        let now = Date()
        var items = (state.messages[roomId] ?? []).filter { $0.createdAt <= now }.sorted { $0.createdAt < $1.createdAt }
        if let after = r.query["after"].flatMap(ISODate.parse) { items = items.filter { $0.createdAt > after } }
        if let before = r.query["before"].flatMap(ISODate.parse) { items = items.filter { $0.createdAt < before } }
        let limit = Int(r.query["limit"] ?? "40") ?? 40
        let hasMore = items.count > limit
        return ok(MessagesResponse(items: Array(items.suffix(limit)), hasMore: hasMore))
    }

    private func sendMessage(_ roomId: String, _ r: DemoRequest) -> DemoResult {
        guard let body = try? JSON.decoder().decode(MessageBody.self, from: r.body ?? Data()) else { return err("bad_request", 400) }
        if let existing = state.messages[roomId]?.first(where: { $0.clientId == body.clientId }) { return ok(existing) }
        let msg = ChatMessage(id: UUID().uuidString.lowercased(), clientId: body.clientId, author: state.me.user.lite,
                              body: DemoModeration.screen(body.body).body, type: "text", createdAt: Date(), editedAt: nil)
        state.messages[roomId, default: []].append(msg)
        if let i = state.chats.firstIndex(where: { $0.id == roomId }) {
            state.chats[i].lastMessage = .init(body: msg.body, at: msg.createdAt, authorName: "You")
            // Direct chats get a scripted reply a few seconds later, so polling can be seen working.
            if state.chats[i].type == "direct", !state.chats[i].isRequest,
               let other = state.messages[roomId]?.first(where: { $0.author.id != state.me.user.id })?.author {
                let replies = ["Sounds good!", "Haha yes, see you there", "Perfect, I'll tell the others", "Done. Thanks!"]
                let reply = ChatMessage(id: UUID().uuidString.lowercased(), clientId: nil, author: other,
                                        body: replies.randomElement()!, type: "text", createdAt: Date().addingTimeInterval(5), editedAt: nil)
                state.messages[roomId]?.append(reply)
                state.chats[i].lastMessage = .init(body: reply.body, at: reply.createdAt, authorName: other.firstName)
            }
        }
        save()
        return ok(msg, status: 201)
    }

    private func directChat(_ r: DemoRequest) -> DemoResult {
        guard let userId = r.json["userId"] as? String else { return err("bad_request", 400) }
        let user = state.profiles.values.first { $0.user.id == userId }?.user
        if let existing = state.chats.first(where: { $0.type == "direct" && $0.name == user?.name }) {
            return ok(DirectChatResponse(roomId: existing.id))
        }
        let id = UUID().uuidString.lowercased()
        state.chats.insert(ChatSummary(id: id, type: "direct", name: user?.name ?? "New chat",
                                       image: user?.avatarUrl.map { Media(url: $0, thumbUrl: nil, lqip: nil, width: nil, height: nil) },
                                       lastMessage: nil, unread: 0, isRequest: false), at: 0)
        state.messages[id] = []
        save()
        return ok(DirectChatResponse(roomId: id))
    }

    // MARK: - Helpers

    private func ok<T: Encodable>(_ value: T, status: Int = 200) -> DemoResult {
        DemoResult(status: status, body: (try? JSON.encoder().encode(value)) ?? Data("{}".utf8))
    }

    private func noContent() -> DemoResult { DemoResult(status: 204, body: Data()) }

    private func err(_ code: String, _ status: Int, _ message: String? = nil, field: String? = nil) -> DemoResult {
        let env = ErrorEnvelope(error: .init(code: code, message: message, field: field))
        return DemoResult(status: status, body: (try? JSONEncoder().encode(env)) ?? Data())
    }
}

private final class BundleToken {}

/// A tiny copy of the server-side screening rules (src/lib/moderation/screen.ts) for demo mode only.
enum DemoModeration {
    struct Result { var body: String; var prompts: [String] }

    static func screen(_ text: String) -> Result {
        var body = text
        var prompts: [String] = []
        let lower = text.lowercased()
        let moneyWords = ["/person", "per person", "advance", "pay me", "upi", "gpay", "paytm"]
        if moneyWords.contains(where: { lower.contains($0) }) || lower.range(of: #"₹\s?\d[\d,]*\s?(/|per)"#, options: .regularExpression) != nil {
            prompts.append("money")
        }
        let contactPatterns = [#"(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}"#, #"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"#, #"[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}"#]
        for pattern in contactPatterns where body.range(of: pattern, options: .regularExpression) != nil {
            body = body.replacingOccurrences(of: pattern, with: "[contact hidden]", options: .regularExpression)
            if !prompts.contains("contact_hidden") { prompts.append("contact_hidden") }
        }
        if body.range(of: #"https?://(?!(www\.)?unsolo\.in)"#, options: .regularExpression) != nil { prompts.append("links_disabled") }
        return Result(body: body, prompts: prompts)
    }
}
