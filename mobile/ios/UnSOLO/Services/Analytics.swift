import Foundation

/// Batched analytics. Events are appended to a queue persisted on disk, flushed every 30 s,
/// when the app backgrounds, and in batches of ≤ 50 to POST /events. Names follow ^[a-z][a-z0-9_.]{1,63}$.
actor Analytics {
    static let flushInterval: Duration = .seconds(30)
    static let batchSize = 50

    private var queue: [AnalyticsEvent] = []
    private let fileURL: URL
    private let send: @Sendable ([AnalyticsEvent]) async throws -> Void
    private var flushLoop: Task<Void, Never>?
    let anonId: String
    private(set) var sessionId: String
    private var lastActive = Date()

    init(send: @escaping @Sendable ([AnalyticsEvent]) async throws -> Void, directory: URL? = nil) {
        let dir = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("analytics-queue.json")
        self.send = send
        let defaults = UserDefaults.standard
        if let id = defaults.string(forKey: "analytics.anonId") {
            anonId = id
        } else {
            let id = UUID().uuidString.lowercased()
            defaults.set(id, forKey: "analytics.anonId")
            anonId = id
        }
        sessionId = UUID().uuidString.lowercased()
        if let data = try? Data(contentsOf: fileURL), let saved = try? JSON.decoder().decode([AnalyticsEvent].self, from: data) {
            queue = saved
        }
    }

    static func isValidName(_ name: String) -> Bool {
        name.range(of: #"^[a-z][a-z0-9_.]{1,63}$"#, options: .regularExpression) != nil
    }

    func track(_ name: String, screen: String? = nil, props: [String: String]? = nil) {
        guard Self.isValidName(name) else { return }
        var props = props
        if let p = props, (try? JSONEncoder().encode(p).count) ?? 0 > 4096 { props = nil }
        queue.append(AnalyticsEvent(name: name, screen: screen, props: props, ts: Date(), anonId: anonId, sessionId: sessionId))
        if queue.count > 500 { queue.removeFirst(queue.count - 500) }
        persist()
        if queue.count >= Self.batchSize { Task { await self.flush() } }
    }

    /// New session after 30 minutes in the background.
    func foregrounded() {
        if Date().timeIntervalSince(lastActive) > 30 * 60 { sessionId = UUID().uuidString.lowercased() }
        lastActive = Date()
        startLoop()
    }

    func backgrounded() async {
        lastActive = Date()
        flushLoop?.cancel()
        flushLoop = nil
        await flush()
    }

    func startLoop() {
        guard flushLoop == nil else { return }
        flushLoop = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: Self.flushInterval)
                await self.flush()
            }
        }
    }

    func flush() async {
        while !queue.isEmpty {
            let batch = Array(queue.prefix(Self.batchSize))
            do {
                try await send(batch)
                queue.removeFirst(min(batch.count, queue.count))
                persist()
            } catch {
                return // keep events; next flush retries
            }
        }
    }

    var pending: Int { queue.count }

    private func persist() {
        if let data = try? JSON.encoder().encode(queue) { try? data.write(to: fileURL, options: .atomic) }
    }
}
