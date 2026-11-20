import Foundation
import SwiftData

// SwiftData cache. Each row stores the contract JSON (`payload`) plus the columns needed to query and
// order it. Views read through LocalStore; repositories write after each network refresh.

@Model
final class CachedPost {
    @Attribute(.unique) var id: String
    var kind: String
    var authorId: String
    var payload: Data
    var updatedAt: Date
    /// nil when it mirrors the server; "sending" | "held" | "failed" for local, optimistic posts.
    var localState: String?
    var clientId: String?
    var uploadProgress: Double

    init(id: String, kind: String, authorId: String, payload: Data, updatedAt: Date, localState: String? = nil, clientId: String? = nil) {
        self.id = id
        self.kind = kind
        self.authorId = authorId
        self.payload = payload
        self.updatedAt = updatedAt
        self.localState = localState
        self.clientId = clientId
        uploadProgress = 0
    }
}

@Model
final class CachedTrip {
    @Attribute(.unique) var slug: String
    var payload: Data
    var nextDeparture: String?
    var updatedAt: Date

    init(slug: String, payload: Data, nextDeparture: String?, updatedAt: Date) {
        self.slug = slug
        self.payload = payload
        self.nextDeparture = nextDeparture
        self.updatedAt = updatedAt
    }
}

/// Generic keyed payloads: feed/explore orderings, trip details, my trips, /me, preferences, suggestions.
@Model
final class CacheEntry {
    @Attribute(.unique) var key: String
    var payload: Data
    var updatedAt: Date
    var isPrivate: Bool

    init(key: String, payload: Data, updatedAt: Date, isPrivate: Bool) {
        self.key = key
        self.payload = payload
        self.updatedAt = updatedAt
        self.isPrivate = isPrivate
    }
}

@Model
final class CachedComment {
    /// Server id, or "local-<clientId>" while sending.
    @Attribute(.unique) var key: String
    var postId: String
    var parentId: String?
    var payload: Data
    var createdAt: Date
    var localState: String?
    var clientId: String?

    init(key: String, postId: String, parentId: String?, payload: Data, createdAt: Date, localState: String? = nil, clientId: String? = nil) {
        self.key = key
        self.postId = postId
        self.parentId = parentId
        self.payload = payload
        self.createdAt = createdAt
        self.localState = localState
        self.clientId = clientId
    }
}

@Model
final class CachedNotification {
    @Attribute(.unique) var id: String
    var payload: Data
    var isRead: Bool
    var createdAt: Date

    init(id: String, payload: Data, isRead: Bool, createdAt: Date) {
        self.id = id
        self.payload = payload
        self.isRead = isRead
        self.createdAt = createdAt
    }
}

@Model
final class CachedChat {
    @Attribute(.unique) var id: String
    var payload: Data
    var sortDate: Date
    var unread: Int

    init(id: String, payload: Data, sortDate: Date, unread: Int) {
        self.id = id
        self.payload = payload
        self.sortDate = sortDate
        self.unread = unread
    }
}

@Model
final class CachedMessage {
    /// clientId for messages sent from this device (so the server copy replaces the pending bubble), else server id.
    @Attribute(.unique) var key: String
    var serverId: String?
    var roomId: String
    var payload: Data
    var createdAt: Date
    var localState: String?

    init(key: String, serverId: String?, roomId: String, payload: Data, createdAt: Date, localState: String? = nil) {
        self.key = key
        self.serverId = serverId
        self.roomId = roomId
        self.payload = payload
        self.createdAt = createdAt
        self.localState = localState
    }
}

/// A pending write. `clientId` is the idempotency key sent to the server, so retries never duplicate.
@Model
final class OutboxItem {
    @Attribute(.unique) var clientId: String
    var kind: String
    var method: String
    var path: String
    var body: Data?
    var attempts: Int
    var nextAttemptAt: Date
    var state: String // "pending" | "failed"
    var lastError: String?
    var createdAt: Date
    var refId: String?
    /// Media uploads this write waits for (JSON array of UploadSlot).
    var uploadsJSON: Data?

    init(clientId: String, kind: String, method: String, path: String, body: Data?, refId: String?, createdAt: Date, uploadsJSON: Data? = nil) {
        self.clientId = clientId
        self.kind = kind
        self.method = method
        self.path = path
        self.body = body
        attempts = 0
        nextAttemptAt = createdAt
        state = "pending"
        lastError = nil
        self.createdAt = createdAt
        self.refId = refId
        self.uploadsJSON = uploadsJSON
    }
}

struct UploadSlot: Codable, Sendable, Hashable {
    var localPath: String
    var width: Int
    var height: Int
    var media: Media?
}

enum Schema1 {
    @MainActor
    static func makeContainer(inMemory: Bool = false) -> ModelContainer {
        let schema = Schema([
            CachedPost.self, CachedTrip.self, CacheEntry.self, CachedComment.self, CachedNotification.self,
            CachedChat.self, CachedMessage.self, OutboxItem.self,
        ])
        let config = ModelConfiguration("UnSOLO", schema: schema, isStoredInMemoryOnly: inMemory)
        if let c = try? ModelContainer(for: schema, configurations: [config]) { return c }
        // The cache is disposable: if the store can't be opened (e.g. schema change), start fresh.
        let url = config.url
        for suffix in ["", "-shm", "-wal"] { try? FileManager.default.removeItem(atPath: url.path + suffix) }
        if let c = try? ModelContainer(for: schema, configurations: [config]) { return c }
        return try! ModelContainer(for: schema, configurations: [ModelConfiguration(isStoredInMemoryOnly: true)])
    }
}
