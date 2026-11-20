import Foundation
import SwiftData

/// Exponential backoff with a cap and proportional jitter.
struct BackoffPolicy: Sendable {
    var base: TimeInterval = 2
    var factor: Double = 2
    var maxDelay: TimeInterval = 15 * 60
    var maxAttempts = 10
    /// 0.2 means ±20 %.
    var jitter: Double = 0.2

    /// Delay before retry number `attempt` (1-based). `random` in 0…1 lets tests be deterministic.
    func delay(attempt: Int, random: Double = Double.random(in: 0...1)) -> TimeInterval {
        let exp = base * pow(factor, Double(max(0, attempt - 1)))
        let capped = min(exp, maxDelay)
        let spread = capped * jitter * (random * 2 - 1)
        return max(0.5, min(maxDelay, capped + spread))
    }
}

/// Immutable view of an outbox row handed to completion handlers.
struct OutboxSnapshot: Sendable {
    let clientId: String
    let kind: String
    let method: HTTPMethod
    let path: String
    let body: Data?
    let refId: String?
    let attempts: Int
}

protocol OutboxSending: Sendable {
    func send(method: HTTPMethod, path: String, body: Data?) async throws -> Data
}

extension APIClient: OutboxSending {
    func send(method: HTTPMethod, path: String, body: Data?) async throws -> Data {
        try await send(method, path, body: body).0
    }
}

struct OutboxHandler {
    var success: @MainActor (OutboxSnapshot, Data) -> Void
    var failure: @MainActor (OutboxSnapshot, APIError) -> Void = { _, _ in }
}

/// Pending writes (posts, comments, reactions, joins, messages, read receipts …).
/// - Idempotent: one row per `clientId`; the same `clientId` goes to the server on every retry.
/// - Retries transient failures (offline, 5xx, 429) with exponential backoff; client errors fail fast.
/// - Drained when connectivity returns, on foreground, after each enqueue and from a BGProcessingTask.
@MainActor
final class OutboxEngine {
    private let context: ModelContext
    private let sender: any OutboxSending
    let policy: BackoffPolicy
    var now: () -> Date
    var random: () -> Double = { Double.random(in: 0...1) }
    private var handlers: [String: OutboxHandler] = [:]
    private(set) var isDraining = false
    private var wakeTask: Task<Void, Never>?
    var isOnline: () -> Bool = { true }
    var onChange: (() -> Void)?

    init(context: ModelContext, sender: any OutboxSending, policy: BackoffPolicy = BackoffPolicy(), now: @escaping () -> Date = Date.init) {
        self.context = context
        self.sender = sender
        self.policy = policy
        self.now = now
    }

    func register(_ kind: String, _ handler: OutboxHandler) { handlers[kind] = handler }

    // MARK: Enqueue

    /// Returns false when an item with this clientId already exists (and `coalesce` is false).
    /// With `coalesce`, the existing pending item is overwritten (e.g. toggling a reaction twice).
    @discardableResult
    func enqueue(kind: String, method: HTTPMethod, path: String, body: Data?, clientId: String, refId: String? = nil,
                 uploads: [UploadSlot]? = nil, coalesce: Bool = false) -> Bool {
        if let existing = item(clientId) {
            guard coalesce else { return false }
            existing.method = method.rawValue
            existing.path = path
            existing.body = body
            existing.attempts = 0
            existing.state = "pending"
            existing.nextAttemptAt = now()
            try? context.save()
            onChange?()
            return true
        }
        let row = OutboxItem(clientId: clientId, kind: kind, method: method.rawValue, path: path, body: body, refId: refId,
                             createdAt: now(), uploadsJSON: uploads.flatMap { try? JSONEncoder().encode($0) })
        context.insert(row)
        try? context.save()
        onChange?()
        return true
    }

    func encodeBody<T: Encodable>(_ value: T) -> Data? { try? JSON.encoder().encode(value) }

    // MARK: Queries

    func item(_ clientId: String) -> OutboxItem? {
        var fd = FetchDescriptor<OutboxItem>(predicate: #Predicate { $0.clientId == clientId })
        fd.fetchLimit = 1
        return try? context.fetch(fd).first
    }

    func all() -> [OutboxItem] {
        (try? context.fetch(FetchDescriptor<OutboxItem>(sortBy: [SortDescriptor(\.createdAt)]))) ?? []
    }

    var pendingCount: Int { all().filter { $0.state == "pending" }.count }

    func remove(_ clientId: String) {
        try? context.delete(model: OutboxItem.self, where: #Predicate { $0.clientId == clientId })
        try? context.save()
        onChange?()
    }

    func retryFailed() {
        for row in all() where row.state == "failed" {
            row.state = "pending"
            row.attempts = 0
            row.nextAttemptAt = now()
        }
        try? context.save()
    }

    // MARK: Uploads

    func resolveUpload(clientId: String, index: Int, media: Media) {
        guard let row = item(clientId), let data = row.uploadsJSON,
              var slots = try? JSONDecoder().decode([UploadSlot].self, from: data), slots.indices.contains(index) else { return }
        slots[index].media = media
        row.uploadsJSON = try? JSONEncoder().encode(slots)
        try? context.save()
    }

    func uploads(for clientId: String) -> [UploadSlot] {
        guard let data = item(clientId)?.uploadsJSON else { return [] }
        return (try? JSONDecoder().decode([UploadSlot].self, from: data)) ?? []
    }

    private func isReady(_ row: OutboxItem) -> Bool {
        guard let data = row.uploadsJSON, let slots = try? JSONDecoder().decode([UploadSlot].self, from: data) else { return true }
        return slots.allSatisfy { $0.media != nil }
    }

    /// Inject resolved upload media into the JSON body (`media: [...]`).
    private func bodyWithMedia(_ row: OutboxItem) -> Data? {
        guard let data = row.uploadsJSON, let slots = try? JSONDecoder().decode([UploadSlot].self, from: data), !slots.isEmpty,
              let body = row.body, var obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let mediaData = try? JSONEncoder().encode(slots.compactMap(\.media)),
              let mediaObj = try? JSONSerialization.jsonObject(with: mediaData) else { return row.body }
        obj["media"] = mediaObj
        return try? JSONSerialization.data(withJSONObject: obj)
    }

    // MARK: Drain

    struct DrainReport: Equatable { var sent = 0, retried = 0, failed = 0, skipped = 0 }

    @discardableResult
    func drain() async -> DrainReport {
        var report = DrainReport()
        guard !isDraining else { return report }
        guard isOnline() else { return report }
        isDraining = true
        defer {
            isDraining = false
            scheduleWake()
        }
        let ready = all().filter { $0.state == "pending" && $0.nextAttemptAt <= now() }
        for row in ready {
            guard isReady(row) else { report.skipped += 1; continue }
            let snap = OutboxSnapshot(clientId: row.clientId, kind: row.kind, method: HTTPMethod(rawValue: row.method) ?? .post,
                                      path: row.path, body: bodyWithMedia(row), refId: row.refId, attempts: row.attempts)
            do {
                let data = try await sender.send(method: snap.method, path: snap.path, body: snap.body)
                context.delete(row)
                try? context.save()
                handlers[snap.kind]?.success(snap, data)
                report.sent += 1
            } catch {
                let api = (error as? APIError) ?? .transport(String(describing: error))
                row.attempts += 1
                row.lastError = api.errorDescription
                if api.isRetryable && row.attempts < policy.maxAttempts {
                    var delay = policy.delay(attempt: row.attempts, random: random())
                    if case .rateLimited(let after?) = api { delay = max(delay, after) }
                    row.nextAttemptAt = now().addingTimeInterval(delay)
                    report.retried += 1
                    if case .offline = api { try? context.save(); break } // stop the pass; connectivity will wake us
                } else {
                    row.state = "failed"
                    report.failed += 1
                    handlers[snap.kind]?.failure(snap, api)
                }
                try? context.save()
            }
        }
        onChange?()
        return report
    }

    /// While the app runs, wake for the earliest retry.
    private func scheduleWake() {
        wakeTask?.cancel()
        guard let next = all().filter({ $0.state == "pending" }).map(\.nextAttemptAt).min() else { return }
        let wait = max(1, next.timeIntervalSince(now()))
        wakeTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(wait))
            guard !Task.isCancelled else { return }
            await self?.drain()
        }
    }

    func cancelWake() { wakeTask?.cancel() }
}
