import Foundation
import SwiftData

/// Cached feed ordering: refs are "post:<id>" or "trip:<slug>".
struct FeedCache: Codable, Sendable {
    var refs: [String]
    var caughtUp: Bool
    var nextDepartures: [TripLite]
    var nextCursor: String?
}

struct ExploreCache: Codable, Sendable {
    var slugs: [String]
    var nextCursor: String?
}

/// Main-actor facade over the SwiftData cache. Everything a screen shows comes from here first
/// (cold start renders the last saved state with no network), then repositories refresh it.
@MainActor
final class LocalStore {
    let container: ModelContainer
    var context: ModelContext { container.mainContext }
    private let encoder = JSON.encoder()
    private let decoder = JSON.decoder()
    /// Bumped on every write so @Observable view models can re-read.
    private(set) var revision = 0

    init(container: ModelContainer) {
        self.container = container
        container.mainContext.autosaveEnabled = true
    }

    func save() {
        revision &+= 1
        try? context.save()
    }

    private func encode<T: Encodable>(_ v: T) -> Data { (try? encoder.encode(v)) ?? Data() }
    private func decode<T: Decodable>(_ type: T.Type, _ d: Data) -> T? { try? decoder.decode(type, from: d) }

    // MARK: Entries

    func entry<T: Decodable>(_ type: T.Type, _ key: String) -> T? {
        var fd = FetchDescriptor<CacheEntry>(predicate: #Predicate { $0.key == key })
        fd.fetchLimit = 1
        guard let row = try? context.fetch(fd).first else { return nil }
        return decode(type, row.payload)
    }

    func entryDate(_ key: String) -> Date? {
        var fd = FetchDescriptor<CacheEntry>(predicate: #Predicate { $0.key == key })
        fd.fetchLimit = 1
        return (try? context.fetch(fd).first)?.updatedAt
    }

    func setEntry<T: Encodable>(_ key: String, _ value: T, isPrivate: Bool = false) {
        let data = encode(value)
        var fd = FetchDescriptor<CacheEntry>(predicate: #Predicate { $0.key == key })
        fd.fetchLimit = 1
        if let row = try? context.fetch(fd).first {
            row.payload = data
            row.updatedAt = Date()
        } else {
            context.insert(CacheEntry(key: key, payload: data, updatedAt: Date(), isPrivate: isPrivate))
        }
        save()
    }

    func removeEntry(_ key: String) {
        try? context.delete(model: CacheEntry.self, where: #Predicate { $0.key == key })
        save()
    }

    // MARK: Posts

    func post(_ id: String) -> Post? {
        cachedPostRow(id).flatMap { decode(Post.self, $0.payload) }
    }

    func postRow(_ id: String) -> CachedPost? { cachedPostRow(id) }

    private func cachedPostRow(_ id: String) -> CachedPost? {
        var fd = FetchDescriptor<CachedPost>(predicate: #Predicate { $0.id == id })
        fd.fetchLimit = 1
        return try? context.fetch(fd).first
    }

    func posts(_ ids: [String]) -> [Post] {
        guard !ids.isEmpty else { return [] }
        let fd = FetchDescriptor<CachedPost>(predicate: #Predicate { ids.contains($0.id) })
        let rows = (try? context.fetch(fd)) ?? []
        var byId: [String: Post] = [:]
        for r in rows { if let p = decode(Post.self, r.payload) { byId[r.id] = p } }
        return ids.compactMap { byId[$0] }
    }

    func localPosts() -> [(post: Post, state: String, progress: Double)] {
        let fd = FetchDescriptor<CachedPost>(predicate: #Predicate { $0.localState != nil }, sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        return ((try? context.fetch(fd)) ?? []).compactMap { row in
            decode(Post.self, row.payload).map { ($0, row.localState ?? "", row.uploadProgress) }
        }
    }

    func upsertPost(_ post: Post, localState: String? = nil, clientId: String? = nil, keepLocalState: Bool = false) {
        let data = encode(post)
        if let row = cachedPostRow(post.id) {
            row.payload = data
            row.updatedAt = post.updatedAt
            if !keepLocalState { row.localState = localState }
            if let clientId { row.clientId = clientId }
        } else {
            context.insert(CachedPost(id: post.id, kind: post.kind.rawValue, authorId: post.author.id, payload: data,
                                      updatedAt: post.updatedAt, localState: localState, clientId: clientId))
        }
        save()
    }

    func upsertPosts(_ posts: [Post]) {
        for p in posts {
            let data = encode(p)
            if let row = cachedPostRow(p.id) {
                row.payload = data
                row.updatedAt = p.updatedAt
            } else {
                context.insert(CachedPost(id: p.id, kind: p.kind.rawValue, authorId: p.author.id, payload: data, updatedAt: p.updatedAt))
            }
        }
        save()
    }

    func mutatePost(_ id: String, _ f: (inout Post) -> Void) {
        guard let row = cachedPostRow(id), var p = decode(Post.self, row.payload) else { return }
        f(&p)
        row.payload = encode(p)
        save()
    }

    func setPostLocalState(_ id: String, _ state: String?, progress: Double? = nil) {
        guard let row = cachedPostRow(id) else { return }
        row.localState = state
        if let progress { row.uploadProgress = progress }
        save()
    }

    func deletePost(_ id: String) {
        try? context.delete(model: CachedPost.self, where: #Predicate { $0.id == id })
        try? context.delete(model: CachedComment.self, where: #Predicate { $0.postId == id })
        save()
    }

    /// Swap a local optimistic post for the server copy everywhere it is referenced.
    func replaceLocalPost(localId: String, with server: Post) {
        let state = cachedPostRow(localId)?.localState
        deletePost(localId)
        upsertPost(server, localState: server.status == .held ? "held" : (state == "held" ? nil : nil))
        let keys = ((try? context.fetch(FetchDescriptor<CacheEntry>())) ?? []).filter { $0.key.hasPrefix("feed:") }
        for row in keys {
            guard var feed = decode(FeedCache.self, row.payload) else { continue }
            if let i = feed.refs.firstIndex(of: "post:\(localId)") { feed.refs[i] = "post:\(server.id)" }
            row.payload = encode(feed)
        }
        save()
    }

    // MARK: Trips

    func upsertTrips(_ trips: [TripLite]) {
        for t in trips {
            let slug = t.slug
            let data = encode(t)
            var fd = FetchDescriptor<CachedTrip>(predicate: #Predicate { $0.slug == slug })
            fd.fetchLimit = 1
            if let row = try? context.fetch(fd).first {
                row.payload = data
                row.nextDeparture = t.nextDeparture
                row.updatedAt = Date()
            } else {
                context.insert(CachedTrip(slug: t.slug, payload: data, nextDeparture: t.nextDeparture, updatedAt: Date()))
            }
        }
        save()
    }

    func trips(_ slugs: [String]) -> [TripLite] {
        guard !slugs.isEmpty else { return [] }
        let fd = FetchDescriptor<CachedTrip>(predicate: #Predicate { slugs.contains($0.slug) })
        let rows = (try? context.fetch(fd)) ?? []
        var by: [String: TripLite] = [:]
        for r in rows { if let t = decode(TripLite.self, r.payload) { by[r.slug] = t } }
        return slugs.compactMap { by[$0] }
    }

    // MARK: Feed

    func feed(_ key: String) -> (items: [FeedItem], cache: FeedCache)? {
        guard let cache = entry(FeedCache.self, "feed:\(key)") else { return nil }
        let postIds = cache.refs.filter { $0.hasPrefix("post:") }.map { String($0.dropFirst(5)) }
        let tripSlugs = cache.refs.filter { $0.hasPrefix("trip:") }.map { String($0.dropFirst(5)) }
        let posts = Dictionary(uniqueKeysWithValues: self.posts(postIds).map { ($0.id, $0) })
        let trips = Dictionary(uniqueKeysWithValues: self.trips(tripSlugs).map { ($0.slug, $0) })
        let items: [FeedItem] = cache.refs.compactMap { ref in
            if ref.hasPrefix("post:") { return posts[String(ref.dropFirst(5))].map(FeedItem.post) }
            return trips[String(ref.dropFirst(5))].map(FeedItem.placedTrip)
        }
        return (items, cache)
    }

    func saveFeed(_ key: String, _ response: FeedResponse, append: Bool = false) {
        var posts: [Post] = []
        var trips: [TripLite] = response.nextDepartures
        var refs: [String] = []
        for item in response.items {
            switch item {
            case .post(let p): posts.append(p); refs.append("post:\(p.id)")
            case .placedTrip(let t): trips.append(t); refs.append("trip:\(t.slug)")
            }
        }
        upsertPosts(posts)
        upsertTrips(trips)
        if append, var existing = entry(FeedCache.self, "feed:\(key)") {
            existing.refs += refs.filter { !existing.refs.contains($0) }
            existing.caughtUp = response.caughtUp
            existing.nextCursor = response.nextCursor
            setEntry("feed:\(key)", existing)
        } else {
            setEntry("feed:\(key)", FeedCache(refs: refs, caughtUp: response.caughtUp, nextDepartures: response.nextDepartures,
                                               nextCursor: response.nextCursor))
        }
    }

    func prependToFeeds(postId: String, kind: PostKind) {
        for key in ["all", kind.rawValue] {
            var feed = entry(FeedCache.self, "feed:\(key)") ?? FeedCache(refs: [], caughtUp: false, nextDepartures: [], nextCursor: nil)
            feed.refs.removeAll { $0 == "post:\(postId)" }
            feed.refs.insert("post:\(postId)", at: 0)
            setEntry("feed:\(key)", feed)
        }
    }

    func removeFromFeeds(postId: String) {
        let rows = ((try? context.fetch(FetchDescriptor<CacheEntry>())) ?? []).filter { $0.key.hasPrefix("feed:") }
        for row in rows {
            guard var feed = decode(FeedCache.self, row.payload) else { continue }
            feed.refs.removeAll { $0 == "post:\(postId)" }
            row.payload = encode(feed)
        }
        save()
    }

    // MARK: Comments

    func comments(postId: String) -> [Comment] {
        let fd = FetchDescriptor<CachedComment>(predicate: #Predicate { $0.postId == postId }, sortBy: [SortDescriptor(\.createdAt)])
        let rows = (try? context.fetch(fd)) ?? []
        var tops: [Comment] = []
        var replies: [String: [Comment]] = [:]
        for r in rows {
            guard var c = decode(Comment.self, r.payload) else { continue }
            c.replies = []
            if let parent = r.parentId { replies[parent, default: []].append(c) } else { tops.append(c) }
        }
        return tops.map { var c = $0; c.replies = replies[c.id] ?? []; return c }
    }

    func commentStates(postId: String) -> [String: String] {
        let fd = FetchDescriptor<CachedComment>(predicate: #Predicate { $0.postId == postId && $0.localState != nil })
        var out: [String: String] = [:]
        for r in (try? context.fetch(fd)) ?? [] { out[r.key] = r.localState }
        return out
    }

    /// Replace server comments for a post, keeping pending local ones.
    func replaceComments(postId: String, _ comments: [Comment]) {
        try? context.delete(model: CachedComment.self, where: #Predicate { $0.postId == postId && $0.localState == nil })
        for c in comments {
            insertComment(c, key: c.id)
            for r in c.replies { insertComment(r, key: r.id) }
        }
        save()
    }

    func insertComment(_ c: Comment, key: String, localState: String? = nil, clientId: String? = nil) {
        var copy = c
        copy.replies = []
        var fd = FetchDescriptor<CachedComment>(predicate: #Predicate { $0.key == key })
        fd.fetchLimit = 1
        if let row = try? context.fetch(fd).first {
            row.payload = encode(copy)
            row.localState = localState
        } else {
            context.insert(CachedComment(key: key, postId: c.postId, parentId: c.parentId, payload: encode(copy), createdAt: c.createdAt,
                                         localState: localState, clientId: clientId))
        }
        save()
    }

    func replaceLocalComment(clientId: String, with server: Comment) {
        let key = LocalID.prefix + clientId
        try? context.delete(model: CachedComment.self, where: #Predicate { $0.key == key })
        insertComment(server, key: server.id)
    }

    func setCommentState(clientId: String, _ state: String?) {
        let key = LocalID.prefix + clientId
        var fd = FetchDescriptor<CachedComment>(predicate: #Predicate { $0.key == key })
        fd.fetchLimit = 1
        (try? context.fetch(fd).first)?.localState = state
        save()
    }

    // MARK: Notifications

    func notifications() -> [AppNotification] {
        let fd = FetchDescriptor<CachedNotification>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
        return ((try? context.fetch(fd)) ?? []).compactMap { row in
            guard var n = decode(AppNotification.self, row.payload) else { return nil }
            n.isRead = row.isRead
            return n
        }
    }

    func replaceNotifications(_ items: [AppNotification]) {
        // Keep local read marks that haven't synced yet.
        let localRead = Set(((try? context.fetch(FetchDescriptor<CachedNotification>())) ?? []).filter(\.isRead).map(\.id))
        try? context.delete(model: CachedNotification.self)
        for n in items {
            context.insert(CachedNotification(id: n.id, payload: encode(n), isRead: n.isRead || localRead.contains(n.id), createdAt: n.createdAt))
        }
        save()
    }

    func markNotificationsRead(_ ids: [String]?) {
        let rows = (try? context.fetch(FetchDescriptor<CachedNotification>())) ?? []
        for r in rows where ids == nil || ids!.contains(r.id) { r.isRead = true }
        save()
    }

    // MARK: Chats and messages

    func chats() -> [ChatSummary] {
        let fd = FetchDescriptor<CachedChat>(sortBy: [SortDescriptor(\.sortDate, order: .reverse)])
        return ((try? context.fetch(fd)) ?? []).compactMap { row in
            guard var c = decode(ChatSummary.self, row.payload) else { return nil }
            c.unread = row.unread
            return c
        }
    }

    func replaceChats(_ items: [ChatSummary]) {
        try? context.delete(model: CachedChat.self)
        for c in items {
            context.insert(CachedChat(id: c.id, payload: encode(c), sortDate: c.lastMessage?.at ?? .distantPast, unread: c.unread))
        }
        save()
    }

    func markChatRead(_ roomId: String) {
        var fd = FetchDescriptor<CachedChat>(predicate: #Predicate { $0.id == roomId })
        fd.fetchLimit = 1
        (try? context.fetch(fd).first)?.unread = 0
        save()
    }

    func messages(roomId: String) -> [(message: ChatMessage, state: String?)] {
        let fd = FetchDescriptor<CachedMessage>(predicate: #Predicate { $0.roomId == roomId }, sortBy: [SortDescriptor(\.createdAt)])
        return ((try? context.fetch(fd)) ?? []).compactMap { row in decode(ChatMessage.self, row.payload).map { ($0, row.localState) } }
    }

    func upsertMessages(roomId: String, _ items: [ChatMessage]) {
        for m in items {
            let key = m.clientId ?? m.id
            var fd = FetchDescriptor<CachedMessage>(predicate: #Predicate { $0.key == key })
            fd.fetchLimit = 1
            if let row = try? context.fetch(fd).first {
                row.payload = encode(m)
                row.serverId = m.id
                row.createdAt = m.createdAt
                row.localState = nil
            } else {
                context.insert(CachedMessage(key: key, serverId: m.id, roomId: roomId, payload: encode(m), createdAt: m.createdAt))
            }
        }
        save()
    }

    func insertPendingMessage(_ m: ChatMessage, roomId: String) {
        context.insert(CachedMessage(key: m.clientId ?? m.id, serverId: nil, roomId: roomId, payload: encode(m), createdAt: m.createdAt, localState: "sending"))
        save()
    }

    func setMessageState(clientId: String, _ state: String?) {
        var fd = FetchDescriptor<CachedMessage>(predicate: #Predicate { $0.key == clientId })
        fd.fetchLimit = 1
        (try? context.fetch(fd).first)?.localState = state
        save()
    }

    // MARK: Sign-out

    /// Drop everything tied to the signed-in user. Public caches (explore, trips) stay.
    func wipePrivate() {
        try? context.delete(model: CachedNotification.self)
        try? context.delete(model: CachedChat.self)
        try? context.delete(model: CachedMessage.self)
        try? context.delete(model: OutboxItem.self)
        try? context.delete(model: CacheEntry.self, where: #Predicate { $0.isPrivate })
        try? context.delete(model: CachedPost.self, where: #Predicate { $0.localState != nil })
        save()
    }

    func wipeAll() {
        try? context.delete(model: CachedPost.self)
        try? context.delete(model: CachedTrip.self)
        try? context.delete(model: CacheEntry.self)
        try? context.delete(model: CachedComment.self)
        try? context.delete(model: CachedNotification.self)
        try? context.delete(model: CachedChat.self)
        try? context.delete(model: CachedMessage.self)
        try? context.delete(model: OutboxItem.self)
        save()
    }
}
