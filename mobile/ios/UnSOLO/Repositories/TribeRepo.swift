import Foundation
import Observation

struct LocalPostState: Equatable {
    var state: String // "sending" | "held" | "failed"
    var progress: Double
}

/// What a composer hands to TribeRepo.publish.
struct ComposeDraft {
    var kind: PostKind
    var title: String?
    var body: String
    var place: Place?
    var startsOn: String?
    var endsOn: String?
    var spotsTotal: Int?
    var audience: Audience = .anyone
    var estCostText: String?
    var meetingPoint: String?
    var tripPackageId: String?
    var trip: TripLite?
    var showOnTripPage: Bool?
    var poll: [String]?
    var photos: [Data] = []
    var tagUsers: [UserLite] = []
}

/// Tribe posts, feeds, comments, reactions, joins, requests and host offers.
/// Posts are normalised into `posts` so a change in one screen shows everywhere.
@MainActor
@Observable
final class TribeRepo: AppBound {
    @ObservationIgnored weak var app: AppModel?
    var posts: [String: Post] = [:]
    var placedTrips: [String: TripLite] = [:]
    var feeds: [String: FeedCache] = [:]
    var feedState: [String: LoadState] = [:]
    var local: [String: LocalPostState] = [:]
    var comments: [String: [Comment]] = [:]
    var commentStates: [String: [String: String]] = [:]
    var offers: [String: [HostOffer]] = [:]
    var requests: [String: [JoinRequest]] = [:]
    var detailState: [String: LoadState] = [:]
    var blockedUserIds: Set<String> = []

    static let feedKeys = ["all", "plan", "story", "ask"]

    func bind(_ app: AppModel) {
        self.app = app
        registerHandlers(app.outbox)
        if let blocked = UserDefaults.standard.stringArray(forKey: "blockedUsers") { blockedUserIds = Set(blocked) }
    }

    // MARK: Cache

    func loadCached() {
        guard let store = app?.store else { return }
        for key in Self.feedKeys {
            guard let (items, cache) = store.feed(key) else { continue }
            feeds[key] = cache
            absorb(items)
        }
        for (post, state, progress) in store.localPosts() {
            posts[post.id] = post
            local[post.id] = LocalPostState(state: state, progress: progress)
        }
    }

    func absorb(_ items: [FeedItem]) {
        for item in items {
            switch item {
            case .post(let p): posts[p.id] = p
            case .placedTrip(let t): placedTrips[t.slug] = t
            }
        }
    }

    func absorb(_ list: [Post]) { for p in list { posts[p.id] = p } }

    func put(_ post: Post) {
        posts[post.id] = post
        app?.store.upsertPost(post, keepLocalState: true)
    }

    func items(for key: String) -> [FeedItem] {
        let refs = feeds[key]?.refs ?? []
        var out: [FeedItem] = []
        // Local optimistic posts (sending/failed) appear at the top straight away.
        let pending = local.filter { $0.value.state != "held" }.keys.compactMap { posts[$0] }
            .filter { key == "all" || $0.kind.rawValue == key }
            .sorted { $0.createdAt > $1.createdAt }
        out += pending.map(FeedItem.post)
        for ref in refs {
            if ref.hasPrefix("post:") {
                let id = String(ref.dropFirst(5))
                guard local[id] == nil, let p = posts[id], !blockedUserIds.contains(p.author.id), p.status != .removed, p.status != .hidden else { continue }
                out.append(.post(p))
            } else if let t = placedTrips[String(ref.dropFirst(5))] {
                out.append(.placedTrip(t))
            }
        }
        return out
    }

    // MARK: Network refresh

    func refreshFeed(key: String) async {
        guard let app else { return }
        feedState[key] = .loading
        do {
            var lat: Double?, lng: Double?
            if app.session.preferences.suggestByLocation, let loc = LocationService.shared.lastRounded { lat = loc.lat; lng = loc.lng }
            let r = try await app.api.feed(kind: key == "all" ? nil : PostKind(rawValue: key), place: nil, lat: lat, lng: lng, cursor: nil)
            app.store.saveFeed(key, r)
            absorb(r.items)
            for t in r.nextDepartures { placedTrips[t.slug] = t }
            feeds[key] = app.store.entry(FeedCache.self, "feed:\(key)")
            feedState[key] = .loaded
            app.connectivity.markReachable()
        } catch APIError.offline {
            feedState[key] = .failed("offline")
            app.connectivity.markUnreachable()
        } catch {
            feedState[key] = .failed(error.localizedDescription)
        }
    }

    /// Next page via `?cursor=` (contract pagination). Appends to the cached ordering.
    func loadMore(key: String) async {
        guard let app, let cursor = feeds[key]?.nextCursor, feedState[key] != .loading else { return }
        feedState[key] = .loading
        defer { feedState[key] = .loaded }
        guard let r = try? await app.api.feed(kind: key == "all" ? nil : PostKind(rawValue: key), place: nil, lat: nil, lng: nil, cursor: cursor) else { return }
        app.store.saveFeed(key, r, append: true)
        absorb(r.items)
        feeds[key] = app.store.entry(FeedCache.self, "feed:\(key)")
    }

    func post(_ id: String) -> Post? {
        if let p = posts[id] { return p }
        if let p = app?.store.post(id) { posts[id] = p; return p }
        return nil
    }

    func refreshPost(_ id: String) async {
        guard let app, !id.hasPrefix(LocalID.prefix) else { return }
        if comments[id] == nil { comments[id] = app.store.comments(postId: id) }
        detailState[id] = .loading
        do {
            let r = try await app.api.post(id: id)
            posts[id] = r.post
            app.store.upsertPost(r.post, keepLocalState: true)
            app.store.replaceComments(postId: id, r.comments)
            comments[id] = app.store.comments(postId: id)
            commentStates[id] = app.store.commentStates(postId: id)
            offers[id] = r.offers
            detailState[id] = .loaded
            if r.post.viewer?.isAuthor == true, r.post.kind == .plan { await loadRequests(id) }
        } catch APIError.notFound {
            drop(postId: id)
            detailState[id] = .failed("This post isn't available any more.")
        } catch {
            detailState[id] = .failed(error.localizedDescription)
        }
    }

    func loadComments(_ postId: String) {
        guard let app else { return }
        comments[postId] = app.store.comments(postId: postId)
        commentStates[postId] = app.store.commentStates(postId: postId)
    }

    func drop(postId: String) {
        posts[postId] = nil
        app?.store.deletePost(postId)
        app?.store.removeFromFeeds(postId: postId)
        for k in feeds.keys { feeds[k]?.refs.removeAll { $0 == "post:\(postId)" } }
    }

    func applyMembership(postId: String, state: Membership) {
        mutate(postId) { $0.viewer?.membership = state }
    }

    private func mutate(_ id: String, _ f: (inout Post) -> Void) {
        guard var p = post(id) else { return }
        f(&p)
        posts[id] = p
        app?.store.mutatePost(id, f)
    }

    // MARK: Publish (optimistic)

    /// Writes a local "sending" post immediately, then compresses + uploads photos in the background
    /// and creates the post through the outbox. Returns the local id.
    @discardableResult
    func publish(_ draft: ComposeDraft) -> String {
        guard let app, let me = app.session.user else { return "" }
        let clientId = UUID().uuidString.lowercased()
        let localId = LocalID.post(clientId: clientId)
        let dir = UploadCoordinator.directory
        var slots: [UploadSlot] = []
        var media: [Media] = []
        for (i, data) in draft.photos.prefix(6).enumerated() {
            let raw = dir.appendingPathComponent("\(clientId)-\(i).raw")
            try? data.write(to: raw, options: .atomic)
            slots.append(UploadSlot(localPath: dir.appendingPathComponent("\(clientId)-\(i).jpg").path, width: 0, height: 0, media: nil))
            media.append(Media(url: raw.absoluteString, thumbUrl: nil, lqip: nil, width: nil, height: nil))
        }
        var seats: [Seat] = []
        if draft.kind == .plan {
            seats.append(Seat(state: .you, user: me))
            for _ in 1..<max(2, draft.spotsTotal ?? 2) { seats.append(Seat(state: .open, user: nil)) }
        }
        let now = Date()
        let post = Post(id: localId, kind: draft.kind, author: me, title: draft.title, body: draft.body, place: draft.place,
                        startsOn: draft.startsOn, endsOn: draft.endsOn, spotsTotal: draft.spotsTotal, memberCount: 1,
                        audience: draft.audience, estCostText: draft.estCostText, media: media, trip: draft.trip,
                        poll: draft.poll.map { Poll(options: $0.enumerated().map { PollOption(id: "local-\($0.offset)", label: $0.element, votes: 0) }, myChoice: nil) },
                        reactions: .zero, myReactions: [], commentCount: 0, status: .live, seats: seats, createdAt: now, updatedAt: now,
                        viewer: Viewer(isAuthor: true, membership: draft.kind == .plan ? .approved : nil, saved: false, canJoin: false, joinBlockedReason: .ownPlan),
                        meetingPoint: draft.meetingPoint)
        posts[localId] = post
        local[localId] = LocalPostState(state: "sending", progress: 0)
        app.store.upsertPost(post, localState: "sending", clientId: clientId)

        let body = CreatePostBody(clientId: clientId, kind: draft.kind, title: draft.title, body: draft.body, place: draft.place,
                                  startsOn: draft.startsOn, endsOn: draft.endsOn, spotsTotal: draft.spotsTotal,
                                  audience: draft.kind == .plan ? draft.audience : nil, estCostText: draft.estCostText,
                                  meetingPoint: draft.meetingPoint, tripPackageId: draft.tripPackageId, showOnTripPage: draft.showOnTripPage,
                                  poll: draft.poll, media: nil, tagUserIds: draft.tagUsers.isEmpty ? nil : draft.tagUsers.map(\.id))
        app.outbox.enqueue(kind: "post.create", method: .post, path: "/posts", body: app.outbox.encodeBody(body), clientId: clientId,
                           refId: localId, uploads: slots.isEmpty ? nil : slots)
        if slots.isEmpty {
            Task { await app.outbox.drain() }
        } else {
            app.uploads.start(clientId: clientId, purpose: draft.kind == .story ? "story" : "post")
        }
        return localId
    }

    func retryFailed(_ localId: String) {
        guard let app else { return }
        local[localId]?.state = "sending"
        app.store.setPostLocalState(localId, "sending")
        app.outbox.retryFailed()
        Task { await app.outbox.drain() }
    }

    func discardLocal(_ localId: String) {
        guard let app else { return }
        let clientId = String(localId.dropFirst(LocalID.prefix.count))
        app.outbox.remove(clientId)
        local[localId] = nil
        drop(postId: localId)
    }

    func uploadProgress(localId: String, fraction: Double) {
        guard local[localId] != nil else { return }
        local[localId]?.progress = fraction
    }

    // MARK: Held posts

    /// Edit the body of a held post (it is re-screened by the server).
    func editHeld(postId: String, body: String) {
        guard let app else { return }
        mutate(postId) { $0.body = body }
        app.outbox.enqueue(kind: "post.patch", method: .patch, path: "/posts/\(postId)", body: try? JSONSerialization.data(withJSONObject: ["body": body]),
                           clientId: "patch:\(postId)", refId: postId, coalesce: true)
        Task { await app.outbox.drain() }
    }

    /// "It's not commercial". The contract has no explicit field for this yet (see ios.md, Contract gaps);
    /// we send `confirmNonCommercial: true` on PATCH, which the demo backend honours.
    func confirmNonCommercial(postId: String) {
        guard let app else { return }
        app.outbox.enqueue(kind: "post.patch", method: .patch, path: "/posts/\(postId)",
                           body: try? JSONSerialization.data(withJSONObject: ["confirmNonCommercial": true]),
                           clientId: "confirm:\(postId)", refId: postId, coalesce: true)
        Task { await app.outbox.drain() }
    }

    func cancelPlan(_ postId: String) {
        guard let app else { return }
        mutate(postId) { $0.status = .cancelled }
        app.outbox.enqueue(kind: "post.patch", method: .patch, path: "/posts/\(postId)",
                           body: try? JSONSerialization.data(withJSONObject: ["status": "cancelled"]), clientId: "cancel:\(postId)", refId: postId)
        Task { await app.outbox.drain() }
    }

    func delete(_ postId: String) {
        guard let app else { return }
        drop(postId: postId)
        app.outbox.enqueue(kind: "post.delete", method: .delete, path: "/posts/\(postId)", body: nil, clientId: "delete:\(postId)")
        Task { await app.outbox.drain() }
    }

    // MARK: Reactions, saves, comments, polls

    func toggleReaction(_ postId: String, _ kind: ReactionKind) {
        guard let app else { return }
        var on = false
        mutate(postId) { p in
            if p.myReactions.contains(kind) {
                p.myReactions.removeAll { $0 == kind }
                p.reactions[kind] = max(0, p.reactions[kind] - 1)
            } else {
                p.myReactions.append(kind)
                p.reactions[kind] += 1
                on = true
            }
        }
        app.outbox.enqueue(kind: "reaction", method: on ? .put : .delete, path: "/posts/\(postId)/reactions/\(kind.rawValue)", body: nil,
                           clientId: "react:\(postId):\(kind.rawValue)", refId: postId, coalesce: true)
        Task {
            await app.outbox.drain()
            if on { await app.analytics.track("post.react", props: ["kind": kind.rawValue]) }
        }
    }

    func toggleSave(_ postId: String) {
        guard let app else { return }
        var saved = false
        mutate(postId) { p in
            saved = !(p.viewer?.saved ?? false)
            if p.viewer == nil { p.viewer = .guest }
            p.viewer?.saved = saved
        }
        app.outbox.enqueue(kind: "save", method: saved ? .put : .delete, path: "/posts/\(postId)/save", body: nil,
                           clientId: "save:\(postId)", coalesce: true)
        Task { await app.outbox.drain() }
    }

    func addComment(_ postId: String, body: String, parentId: String? = nil, pollChoice: String? = nil) {
        guard let app, let me = app.session.user else { return }
        let clientId = UUID().uuidString.lowercased()
        let c = Comment(id: LocalID.prefix + clientId, postId: postId, parentId: parentId, author: me, body: body, pollChoice: pollChoice,
                        createdAt: Date(), replies: [])
        app.store.insertComment(c, key: c.id, localState: "sending", clientId: clientId)
        loadComments(postId)
        mutate(postId) { $0.commentCount += 1 }
        let payload = CommentBody(clientId: clientId, body: body, parentId: parentId, pollChoice: pollChoice)
        app.outbox.enqueue(kind: "comment", method: .post, path: "/posts/\(postId)/comments", body: app.outbox.encodeBody(payload),
                           clientId: clientId, refId: postId)
        Task {
            await app.outbox.drain()
            await app.analytics.track("post.comment")
        }
    }

    /// Polls are answered through a comment with `pollChoice` (the contract has no separate vote endpoint).
    func vote(_ postId: String, option: PollOption) {
        mutate(postId) { p in
            guard var poll = p.poll, poll.myChoice == nil, let i = poll.options.firstIndex(where: { $0.id == option.id }) else { return }
            poll.options[i].votes += 1
            poll.myChoice = option.id
            p.poll = poll
        }
        addComment(postId, body: "Voted: \(option.label)", pollChoice: option.id)
    }

    // MARK: Join requests

    func join(_ postId: String, intro: String) {
        guard let app, let me = app.session.user else { return }
        mutate(postId) { p in
            p.viewer = Viewer(isAuthor: false, membership: .requested, saved: p.viewer?.saved ?? false, canJoin: false, joinBlockedReason: nil)
            if let i = p.seats.firstIndex(where: { $0.state == .open }) { p.seats[i] = Seat(state: .requested, user: me) }
        }
        app.outbox.enqueue(kind: "join", method: .post, path: "/posts/\(postId)/join", body: app.outbox.encodeBody(JoinBody(intro: intro)),
                           clientId: "join:\(postId)", refId: postId, coalesce: true)
        Task {
            await app.outbox.drain()
            await app.analytics.track("plan.join_request")
            app.askPushAfterMeaningfulAction()
            await app.trips.refresh()
        }
    }

    func withdraw(_ postId: String) {
        guard let app else { return }
        mutate(postId) { p in
            p.viewer?.membership = .withdrawn
            p.viewer?.canJoin = true
            if let i = p.seats.firstIndex(where: { $0.state == .requested }) { p.seats[i] = Seat(state: .open, user: nil) }
        }
        app.outbox.enqueue(kind: "withdraw", method: .delete, path: "/posts/\(postId)/join", body: nil, clientId: "join:\(postId)",
                           refId: postId, coalesce: true)
        Task {
            await app.outbox.drain()
            await app.trips.refresh()
        }
    }

    func loadRequests(_ postId: String) async {
        guard let app else { return }
        if let r = try? await app.api.joinRequests(postId: postId) { requests[postId] = r.items }
    }

    func decide(postId: String, userId: String, approve: Bool) {
        guard let app else { return }
        if var list = requests[postId], let i = list.firstIndex(where: { $0.user.id == userId }) {
            list[i].state = approve ? .approved : .declined
            requests[postId] = list
            if approve {
                let user = list[i].user.lite
                mutate(postId) { p in
                    if let si = p.seats.firstIndex(where: { $0.state == .open }) { p.seats[si] = Seat(state: .member, user: user) }
                    p.memberCount += 1
                }
            }
        }
        app.outbox.enqueue(kind: "decision", method: .post, path: "/posts/\(postId)/requests/\(userId)",
                           body: app.outbox.encodeBody(DecisionBody(decision: approve ? "approve" : "decline")),
                           clientId: "decide:\(postId):\(userId)", refId: postId, coalesce: true)
        Task {
            await app.outbox.drain()
            if approve { await app.analytics.track("plan.approve") }
        }
    }

    var pendingRequestCount: Int { requests.values.flatMap { $0 }.filter { $0.state == .requested }.count }

    // MARK: Host offers

    func makeOffer(postId: String, _ body: OfferBody) async throws {
        guard let app else { return }
        let offer = try await app.api.makeOffer(postId: postId, body)
        offers[postId, default: []].append(offer)
    }

    func acceptOffer(_ offer: HostOffer) async throws -> AcceptOfferResponse? {
        guard let app else { return nil }
        let r: AcceptOfferResponse
        do {
            r = try await app.api.acceptOffer(offer.id, expectedPricePaise: offer.pricePaise)
        } catch APIError.conflict(let message) {
            // The host changed the offer after it was shown: refetch so the organiser reviews the new price.
            await refreshPost(offer.postId)
            throw APIError.conflict(message ?? "The host changed this offer. Review the new price.")
        }
        if var list = offers[offer.postId] {
            for i in list.indices {
                if list[i].id == offer.id {
                    list[i].state = .accepted
                    list[i].packageSlug = r.packageSlug
                    list[i].payBy = r.payBy
                } else if list[i].state == .pending {
                    list[i].state = .declined
                }
            }
            offers[offer.postId] = list
        }
        return r
    }

    func declineOffer(_ offer: HostOffer) async throws {
        guard let app else { return }
        try await app.api.declineOffer(offer.id)
        if var list = offers[offer.postId], let i = list.firstIndex(where: { $0.id == offer.id }) {
            list[i].state = .declined
            offers[offer.postId] = list
        }
    }

    // MARK: Safety

    func report(targetType: String, targetId: String, reason: String, details: String?) {
        guard let app else { return }
        let body = ReportBody(targetType: targetType, targetId: targetId, reason: reason, details: details)
        app.outbox.enqueue(kind: "report", method: .post, path: "/reports", body: app.outbox.encodeBody(body),
                           clientId: "report:\(targetType):\(targetId)", coalesce: true)
        Task { await app.outbox.drain() }
    }

    func block(userId: String) {
        guard let app else { return }
        blockedUserIds.insert(userId)
        UserDefaults.standard.set(Array(blockedUserIds), forKey: "blockedUsers")
        app.outbox.enqueue(kind: "block", method: .post, path: "/blocks", body: app.outbox.encodeBody(BlockBody(userId: userId)),
                           clientId: "block:\(userId)", coalesce: true)
        Task { await app.outbox.drain() }
    }

    // MARK: Outbox handlers

    private func registerHandlers(_ outbox: OutboxEngine) {
        outbox.register("post.create", OutboxHandler(success: { [weak self] snap, data in
            guard let self, let app = self.app, let r = try? JSON.decoder().decode(CreatePostResponse.self, from: data) else { return }
            let localId = snap.refId ?? LocalID.post(clientId: snap.clientId)
            self.local[localId] = nil
            self.posts[localId] = nil
            app.store.replaceLocalPost(localId: localId, with: r.post)
            self.posts[r.post.id] = r.post
            let held = r.moderation.state == "held"
            if held {
                self.local[r.post.id] = LocalPostState(state: "held", progress: 1)
                app.store.setPostLocalState(r.post.id, "held")
            } else {
                app.store.prependToFeeds(postId: r.post.id, kind: r.post.kind)
                for key in ["all", r.post.kind.rawValue] {
                    var f = self.feeds[key] ?? FeedCache(refs: [], caughtUp: false, nextDepartures: [], nextCursor: nil)
                    f.refs.removeAll { $0 == "post:\(r.post.id)" }
                    f.refs.insert("post:\(r.post.id)", at: 0)
                    self.feeds[key] = f
                }
            }
            if held || !r.moderation.prompts.isEmpty {
                app.moderationNotice = ModerationNotice(postId: r.post.id, prompts: r.moderation.prompts, held: held)
            }
            Task {
                await app.analytics.track("post.create", props: ["kind": r.post.kind.rawValue, "held": held ? "true" : "false"])
                await app.trips.refresh()
            }
            app.askPushAfterMeaningfulAction()
        }, failure: { [weak self] snap, error in
            guard let self, let app = self.app else { return }
            let localId = snap.refId ?? LocalID.post(clientId: snap.clientId)
            self.local[localId]?.state = "failed"
            app.store.setPostLocalState(localId, "failed")
            if error == .phoneRequired { app.router.phoneSheet = true }
            app.showToast(error.errorDescription ?? "Couldn't post")
        }))
        outbox.register("post.patch", OutboxHandler(success: { [weak self] _, data in
            guard let self, let app = self.app else { return }
            if let r = try? JSON.decoder().decode(CreatePostResponse.self, from: data) {
                self.put(r.post)
                if r.post.status == .live, self.local[r.post.id]?.state == "held" {
                    self.local[r.post.id] = nil
                    app.store.setPostLocalState(r.post.id, nil)
                    app.store.prependToFeeds(postId: r.post.id, kind: r.post.kind)
                    if let f = app.store.entry(FeedCache.self, "feed:all") { self.feeds["all"] = f }
                    if let f = app.store.entry(FeedCache.self, "feed:\(r.post.kind.rawValue)") { self.feeds[r.post.kind.rawValue] = f }
                    app.showToast("Your post is live")
                } else if r.moderation.state == "held" {
                    app.moderationNotice = ModerationNotice(postId: r.post.id, prompts: r.moderation.prompts, held: true)
                }
            } else if let p = try? JSON.decoder().decode(Post.self, from: data) {
                self.put(p)
            }
        }))
        outbox.register("post.delete", OutboxHandler(success: { _, _ in }))
        outbox.register("reaction", OutboxHandler(success: { [weak self] snap, data in
            guard let self, let id = snap.refId, let r = try? JSON.decoder().decode(ReactionsResponse.self, from: data) else { return }
            // Ignore if another toggle for this post is still queued.
            if self.app?.outbox.all().contains(where: { $0.kind == "reaction" && $0.refId == id }) == true { return }
            self.mutate(id) { p in
                p.reactions = r.reactions
                p.myReactions = r.myReactions
            }
        }))
        outbox.register("save", OutboxHandler(success: { _, _ in }))
        outbox.register("comment", OutboxHandler(success: { [weak self] snap, data in
            guard let self, let app = self.app, let c = try? JSON.decoder().decode(Comment.self, from: data) else { return }
            app.store.replaceLocalComment(clientId: snap.clientId, with: c)
            self.loadComments(c.postId)
        }, failure: { [weak self] snap, error in
            guard let self, let app = self.app else { return }
            app.store.setCommentState(clientId: snap.clientId, "failed")
            if let postId = snap.refId { self.loadComments(postId) }
            app.showToast(error.errorDescription ?? "Comment not sent")
        }))
        outbox.register("join", OutboxHandler(success: { [weak self] snap, data in
            guard let self, let id = snap.refId, let r = try? JSON.decoder().decode(JoinResponse.self, from: data) else { return }
            self.mutate(id) { $0.viewer?.membership = r.membership }
        }, failure: { [weak self] snap, error in
            guard let self, let app = self.app, let id = snap.refId else { return }
            self.mutate(id) { p in
                p.viewer?.membership = nil
                p.viewer?.canJoin = true
                if let i = p.seats.firstIndex(where: { $0.state == .requested }) { p.seats[i] = Seat(state: .open, user: nil) }
            }
            if error == .phoneRequired { app.router.phoneSheet = true }
            app.showToast(error.errorDescription ?? "Request not sent")
            Task { await self.refreshPost(id) }
        }))
        outbox.register("withdraw", OutboxHandler(success: { _, _ in }))
        outbox.register("decision", OutboxHandler(success: { [weak self] snap, data in
            guard let self, let id = snap.refId else { return }
            _ = data
            Task { await self.loadRequests(id) }
        }))
        outbox.register("report", OutboxHandler(success: { [weak self] _, _ in self?.app?.showToast("Thanks. Our team will review it.") }))
        outbox.register("block", OutboxHandler(success: { _, _ in }))
    }
}
