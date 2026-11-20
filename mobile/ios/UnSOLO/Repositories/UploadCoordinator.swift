import Foundation

/// Photo pipeline for posts: raw picker data → ImageIO downsample + JPEG ≤ 2 MB (GPS stripped) → background
/// upload → media attached to the queued POST /posts. Survives relaunch: unresolved slots are resumed at launch.
@MainActor
final class UploadCoordinator: UploaderDelegate {
    static var directory: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("uploads", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private let uploader: any MediaUploading
    private weak var app: AppModel?
    private var progress: [String: [Int: Double]] = [:]
    private var attempts: [String: Int] = [:]
    private var purposes: [String: String] = [:]
    /// "clientId|index" of uploads currently running, so retries don't start duplicates.
    private var inFlight: Set<String> = []

    init(uploader: any MediaUploading) {
        self.uploader = uploader
    }

    func bind(_ app: AppModel) {
        self.app = app
        uploader.setDelegate(self)
    }

    func start(clientId: String, purpose: String) {
        purposes[clientId] = purpose
        guard let app else { return }
        let slots = app.outbox.uploads(for: clientId)
        Task {
            let token = await app.auth.accessToken
            for (i, slot) in slots.enumerated() where slot.media == nil && !self.inFlight.contains("\(clientId)|\(i)") {
                self.inFlight.insert("\(clientId)|\(i)")
                let jpg = URL(fileURLWithPath: slot.localPath)
                let raw = jpg.deletingPathExtension().appendingPathExtension("raw")
                if !FileManager.default.fileExists(atPath: jpg.path) {
                    // Compress off the main actor.
                    let ok = await Task.detached(priority: .userInitiated) { () -> Bool in
                        guard let data = try? Data(contentsOf: raw), let out = try? ImageCompressor.compress(data) else { return false }
                        return (try? out.data.write(to: jpg, options: .atomic)) != nil
                    }.value
                    if !ok {
                        self.uploadFinished(clientId: clientId, index: i, result: .failure(.transport("Couldn't read that photo")))
                        continue
                    }
                }
                await uploader.upload(file: jpg, clientId: clientId, index: i, purpose: purpose, token: token)
            }
        }
    }

    /// Resume uploads for queued posts whose photos never finished (e.g. the app was killed).
    func resumeAll() {
        guard let app else { return }
        Task {
            let active = await uploader.activeTaskKeys()
            for item in app.outbox.all() where item.kind == "post.create" && item.state == "pending" {
                let slots = app.outbox.uploads(for: item.clientId)
                let missing = slots.enumerated().contains { i, s in s.media == nil && !active.contains("\(item.clientId)|\(i)") }
                if missing { start(clientId: item.clientId, purpose: purposes[item.clientId] ?? "post") }
            }
        }
    }

    func uploadProgress(clientId: String, index: Int, fraction: Double) {
        progress[clientId, default: [:]][index] = fraction
        guard let app else { return }
        let count = max(1, app.outbox.uploads(for: clientId).count)
        let total = (progress[clientId]?.values.reduce(0, +) ?? 0) / Double(count)
        app.tribe.uploadProgress(localId: LocalID.post(clientId: clientId), fraction: total)
    }

    func uploadFinished(clientId: String, index: Int, result: Result<Media, APIError>) {
        inFlight.remove("\(clientId)|\(index)")
        guard let app else { return }
        switch result {
        case .success(let media):
            app.outbox.resolveUpload(clientId: clientId, index: index, media: media)
            progress[clientId, default: [:]][index] = 1
            uploadProgress(clientId: clientId, index: index, fraction: 1)
            if app.outbox.uploads(for: clientId).allSatisfy({ $0.media != nil }) {
                progress[clientId] = nil
                Task { await app.outbox.drain() }
            }
        case .failure(let error):
            let n = (attempts[clientId] ?? 0) + 1
            attempts[clientId] = n
            guard n <= 5 else {
                app.tribe.local[LocalID.post(clientId: clientId)]?.state = "failed"
                app.store.setPostLocalState(LocalID.post(clientId: clientId), "failed")
                return
            }
            let delay = app.outbox.policy.delay(attempt: n)
            Task {
                if error == .unauthorized { _ = try? await app.auth.refreshedToken(after: await app.auth.accessToken) }
                try? await Task.sleep(for: .seconds(delay))
                self.start(clientId: clientId, purpose: self.purposes[clientId] ?? "post")
            }
        }
    }
}
