import Foundation
import Observation

// MARK: - My trips

@MainActor
@Observable
final class TripsRepo: AppBound {
    @ObservationIgnored weak var app: AppModel?
    var myTrips: MyTripsResponse = .empty
    var state: LoadState = .idle

    func bind(_ app: AppModel) { self.app = app }

    func loadCached() {
        if let cached = app?.store.entry(MyTripsResponse.self, "mytrips") { myTrips = cached; app?.tribe.absorb(cached.plans + cached.requested) }
    }

    func refresh() async {
        guard let app, app.session.isSignedIn else { return }
        state = .loading
        do {
            let r = try await app.api.myTrips()
            myTrips = r
            app.store.setEntry("mytrips", r, isPrivate: true)
            app.store.upsertPosts(r.plans + r.requested)
            app.tribe.absorb(r.plans + r.requested)
            state = .loaded
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    /// Plans I organise (used by Activity → Requests).
    var organisedPlans: [Post] { myTrips.plans.filter { $0.viewer?.isAuthor == true } }
}

// MARK: - Activity (notifications)

@MainActor
@Observable
final class ActivityRepo: AppBound {
    @ObservationIgnored weak var app: AppModel?
    var items: [AppNotification] = []
    var state: LoadState = .idle
    /// Inline join-request decisions made from Activity or a push, by notification id (true = approved).
    var decisions: [String: Bool] = [:]

    var unread: Int { items.filter { !$0.isRead }.count }

    /// Inline Approve/Decline for "tribe_join_request" rows that carry postId + actorId.
    func decide(_ n: AppNotification, approve: Bool) {
        guard let app, let d = n.inlineDecision else { return }
        decisions[n.id] = approve
        app.tribe.decide(postId: d.postId, userId: d.userId, approve: approve)
        markRead([n.id])
    }

    func bind(_ app: AppModel) {
        self.app = app
        app.outbox.register("notif.read", OutboxHandler(success: { _, _ in }))
    }

    func loadCached() { items = app?.store.notifications() ?? [] }

    func refresh() async {
        guard let app, app.session.isSignedIn else { return }
        state = .loading
        do {
            let r = try await app.api.notifications(cursor: nil)
            app.store.replaceNotifications(r.items)
            items = app.store.notifications()
            app.session.unreadNotifications = unread
            state = .loaded
        } catch {
            state = .failed(error.localizedDescription)
        }
        for plan in app.trips.organisedPlans { await app.tribe.loadRequests(plan.id) }
    }

    func markRead(_ ids: [String]?) {
        guard let app else { return }
        app.store.markNotificationsRead(ids)
        items = app.store.notifications()
        app.session.unreadNotifications = unread
        PushManager.shared.setBadge(unread)
        let body = NotificationsReadBody(ids: ids, all: ids == nil ? true : nil)
        let key = ids.map { "notif.read:" + $0.sorted().joined(separator: ",").prefix(200) } ?? "notif.read:all"
        app.outbox.enqueue(kind: "notif.read", method: .post, path: "/notifications/read", body: app.outbox.encodeBody(body),
                           clientId: String(key), coalesce: true)
        Task { await app.outbox.drain() }
    }
}

// MARK: - Chat

struct ChatLine: Identifiable, Equatable {
    let message: ChatMessage
    let state: String?
    var id: String { message.clientId ?? message.id }
}

/// Chat list + rooms. Sends are optimistic (pending bubble keyed by clientId, swapped for the server copy).
/// While a room is open it polls `?after=` every 4 s, backing off to 15 s after a minute without new messages.
@MainActor
@Observable
final class ChatRepo: AppBound {
    @ObservationIgnored weak var app: AppModel?
    var chats: [ChatSummary] = []
    var lines: [String: [ChatLine]] = [:]
    var state: LoadState = .idle
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    @ObservationIgnored private var lastNewAt = Date()

    static let fastInterval: Duration = .seconds(4)
    static let slowInterval: Duration = .seconds(15)
    static let backoffAfter: TimeInterval = 60

    func bind(_ app: AppModel) {
        self.app = app
        app.outbox.register("message", OutboxHandler(success: { [weak self] snap, data in
            guard let self, let app = self.app, let roomId = snap.refId,
                  let m = try? JSON.decoder().decode(ChatMessage.self, from: data) else { return }
            var copy = m
            copy.clientId = copy.clientId ?? snap.clientId
            app.store.upsertMessages(roomId: roomId, [copy])
            self.reloadRoom(roomId)
        }, failure: { [weak self] snap, _ in
            guard let self, let roomId = snap.refId else { return }
            self.app?.store.setMessageState(clientId: snap.clientId, "failed")
            self.reloadRoom(roomId)
        }))
        app.outbox.register("chat.read", OutboxHandler(success: { _, _ in }))
    }

    func loadCached() { chats = app?.store.chats() ?? [] }

    var unreadTotal: Int { chats.reduce(0) { $0 + $1.unread } }

    func refreshChats() async {
        guard let app, app.session.isSignedIn else { return }
        state = .loading
        do {
            let r = try await app.api.chats(type: nil, cursor: nil)
            app.store.replaceChats(r.items)
            chats = app.store.chats()
            app.session.unreadMessages = unreadTotal
            state = .loaded
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func reloadRoom(_ roomId: String) {
        lines[roomId] = (app?.store.messages(roomId: roomId) ?? []).map { ChatLine(message: $0.message, state: $0.state) }
    }

    func open(_ roomId: String) {
        reloadRoom(roomId)
        markRead(roomId)
        lastNewAt = Date()
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            await self?.fetchLatest(roomId, initial: true)
            while !Task.isCancelled {
                guard let self else { return }
                let interval = Date().timeIntervalSince(self.lastNewAt) > Self.backoffAfter ? Self.slowInterval : Self.fastInterval
                try? await Task.sleep(for: interval)
                if Task.isCancelled { return }
                await self.fetchLatest(roomId, initial: false)
            }
        }
    }

    func close() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func fetchLatest(_ roomId: String, initial: Bool) async {
        guard let app else { return }
        let after = initial ? nil : lines[roomId]?.last(where: { $0.state == nil })?.message.createdAt
        guard let r = try? await app.api.messages(roomId: roomId, after: after) else { return }
        if !r.items.isEmpty {
            let known = Set((lines[roomId] ?? []).map(\.message.id))
            if r.items.contains(where: { !known.contains($0.id) }) { lastNewAt = Date() }
            app.store.upsertMessages(roomId: roomId, r.items)
            reloadRoom(roomId)
            if !initial { markRead(roomId) }
        }
    }

    func send(_ roomId: String, body: String) {
        guard let app, let me = app.session.user else { return }
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let clientId = UUID().uuidString.lowercased()
        let pending = ChatMessage(id: LocalID.prefix + clientId, clientId: clientId, author: me, body: text, type: "text", createdAt: Date(), editedAt: nil)
        app.store.insertPendingMessage(pending, roomId: roomId)
        reloadRoom(roomId)
        lastNewAt = Date()
        app.outbox.enqueue(kind: "message", method: .post, path: "/chats/\(roomId)/messages",
                           body: app.outbox.encodeBody(MessageBody(clientId: clientId, body: text)), clientId: clientId, refId: roomId)
        Task { await app.outbox.drain() }
    }

    func retry(_ line: ChatLine, roomId: String) {
        guard let app, let clientId = line.message.clientId else { return }
        app.store.setMessageState(clientId: clientId, "sending")
        app.outbox.retryFailed()
        reloadRoom(roomId)
        Task { await app.outbox.drain() }
    }

    func markRead(_ roomId: String) {
        guard let app else { return }
        app.store.markChatRead(roomId)
        if let i = chats.firstIndex(where: { $0.id == roomId }) { chats[i].unread = 0 }
        app.session.unreadMessages = unreadTotal
        app.outbox.enqueue(kind: "chat.read", method: .post, path: "/chats/\(roomId)/read", body: nil, clientId: "read:\(roomId)", coalesce: true)
        Task { await app.outbox.drain() }
    }

    func directChat(with userId: String) async -> String? {
        guard let app else { return nil }
        let r = try? await app.api.directChat(userId: userId)
        if r != nil { await refreshChats() }
        return r?.roomId
    }
}

// MARK: - Profiles

@MainActor
@Observable
final class ProfileRepo: AppBound {
    @ObservationIgnored weak var app: AppModel?
    var profiles: [String: ProfileResponse] = [:]
    var state: [String: LoadState] = [:]

    func bind(_ app: AppModel) { self.app = app }

    func profile(_ username: String) -> ProfileResponse? {
        if let p = profiles[username] { return p }
        if let p = app?.store.entry(ProfileResponse.self, "profile:\(username)") { profiles[username] = p; return p }
        return nil
    }

    func refresh(_ username: String) async {
        guard let app else { return }
        state[username] = .loading
        do {
            let p = try await app.api.user(username)
            profiles[username] = p
            app.store.setEntry("profile:\(username)", p)
            app.tribe.absorb(p.posts)
            state[username] = .loaded
        } catch {
            state[username] = .failed(error.localizedDescription)
        }
    }
}
