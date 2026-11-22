import Foundation
import Observation

/// A story going up in the background: `progress` 0…1 across all photos; `error` once it failed (tap to retry).
struct StoryUpload: Equatable {
    var progress: Double
    var photos: Int
    var error: String?
}

/// A story you shared, kept on this phone after it expires so you can share it again.
struct ArchivedStatus: Codable, Hashable, Identifiable {
    var id: String
    var file: String
    var caption: String?
    var postedAt: Date
}

/// 24-hour stories: the rail (people you can see, yours first), one person's for their profile,
/// sharing in the background (compress → upload → POST /statuses, copies kept in the on-phone archive),
/// seen marks, reactions and comments. Mirrors Android's StatusRepository.
@MainActor
@Observable
final class StatusRepo: AppBound {
    @ObservationIgnored weak var app: AppModel?
    var rail: [StatusAuthor] = []
    var upload: StoryUpload?
    var posting = false
    var archive: [ArchivedStatus] = []
    /// Authors outside the rail (opened from a profile).
    var singles: [String: StatusAuthor] = [:]

    @ObservationIgnored private var lastShare: (photos: [Data], caption: String?, audience: String)?
    @ObservationIgnored private var seenQueue: Set<String> = []
    @ObservationIgnored private var seenTask: Task<Void, Never>?

    static let maxArchive = 200

    func bind(_ app: AppModel) { self.app = app }

    func loadCached() {
        if let cached = app?.store.entry([StatusAuthor].self, "statuses") {
            rail = cached.map { a in var a = a; a.items = a.items.filter { $0.expiresAt > Date() }; return a }.filter { !$0.items.isEmpty }
        }
    }

    func refresh() async {
        guard let app, app.session.isSignedIn else { return }
        if let r = try? await app.api.statuses() {
            rail = r.authors
            app.store.setEntry("statuses", r.authors, isPrivate: true)
        }
    }

    func author(_ userId: String) -> StatusAuthor? {
        rail.first { $0.user.id == userId } ?? singles[userId]
    }

    /// One person's live stories (from the rail when we have them).
    func load(user userId: String) async -> StatusAuthor? {
        if let a = rail.first(where: { $0.user.id == userId }) { return a }
        guard let app, app.session.isSignedIn else { return nil }
        let a = (try? await app.api.statuses(user: userId))?.authors.first
        singles[userId] = a
        return a
    }

    // MARK: Seen

    /// Marks locally at once; sends in one batch a moment later.
    func markSeen(authorId: String, id: String) {
        patchItem(id) { $0.seen = true }
        if let i = rail.firstIndex(where: { $0.user.id == authorId }) { rail[i].unseen = rail[i].items.contains { !$0.isSeen } }
        seenQueue.insert(id)
        seenTask?.cancel()
        seenTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(1500))
            guard let self, !Task.isCancelled, let app = self.app else { return }
            let ids = Array(self.seenQueue.prefix(50))
            self.seenQueue.removeAll()
            if !ids.isEmpty { try? await app.api.seenStatuses(ids) }
        }
    }

    private func patchItem(_ id: String, _ f: (inout StatusItem) -> Void) {
        for a in rail.indices {
            if let i = rail[a].items.firstIndex(where: { $0.id == id }) { f(&rail[a].items[i]) }
        }
        for k in singles.keys {
            if let i = singles[k]?.items.firstIndex(where: { $0.id == id }) { f(&singles[k]!.items[i]) }
        }
    }

    func item(_ id: String) -> StatusItem? {
        for a in rail { if let i = a.items.first(where: { $0.id == id }) { return i } }
        for a in singles.values { if let i = a.items.first(where: { $0.id == id }) { return i } }
        return nil
    }

    // MARK: Reactions and comments

    /// Tap = your reaction moves at once; the server's counts replace the guess. Same kind again = take it back.
    func react(_ item: StatusItem, kind: String) async {
        guard let app else { return }
        let next: String? = item.myReaction == kind ? nil : kind
        patchItem(item.id) { it in
            var r = it.reactions ?? [:]
            if let old = item.myReaction { r[old] = max(0, (r[old] ?? 1) - 1) }
            if let n = next { r[n, default: 0] += 1 }
            it.reactions = r.filter { $0.value > 0 }
            it.myReaction = next
        }
        Haptics.tick()
        do {
            let r = try await app.api.reactStatus(item.id, kind: next)
            patchItem(item.id) { $0.reactions = r.reactions; $0.myReaction = r.myReaction }
        } catch {
            patchItem(item.id) { $0.reactions = item.reactions; $0.myReaction = item.myReaction }
            app.showToast("Couldn't react. Try again.")
        }
    }

    // MARK: Comments: the saved copy shows at once, the fresh one replaces it

    /// Comments per story, as last seen (memory, backed by the on-phone cache).
    var comments: [String: [StatusComment]] = [:]
    @ObservationIgnored private var loadingComments: Set<String> = []

    private func putComments(_ id: String, _ list: [StatusComment]) {
        comments[id] = list
        app?.store.setEntry("status_comments:\(id)", list, isPrivate: true)
    }

    /// Saved copy first (instant), then the server's. Returns false if the refresh failed.
    @discardableResult
    func loadComments(_ id: String) async -> Bool {
        guard let app else { return false }
        if comments[id] == nil, let saved = app.store.entry([StatusComment].self, "status_comments:\(id)") { comments[id] = saved }
        guard let r = try? await app.api.statusComments(id) else { return false }
        putComments(id, r.items)
        return true
    }

    /// Loads a story's comments in the background while it plays, so opening them is instant.
    func prefetchComments(_ item: StatusItem) {
        let n = item.commentCount ?? 0
        guard n > 0, comments[item.id]?.count != n, !loadingComments.contains(item.id) else { return }
        loadingComments.insert(item.id)
        Task {
            await loadComments(item.id)
            loadingComments.remove(item.id)
        }
    }

    func comment(_ id: String, body: String) async -> StatusComment? {
        guard let app else { return nil }
        guard let c = try? await app.api.commentStatus(id, body: body.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
        patchItem(id) { $0.commentCount = ($0.commentCount ?? 0) + 1 }
        putComments(id, (comments[id] ?? []) + [c])
        return c
    }

    func delete(_ id: String) async -> Bool {
        guard let app else { return false }
        do {
            try await app.api.deleteStatus(id)
            rail = rail.compactMap { a in var a = a; a.items.removeAll { $0.id == id }; return a.items.isEmpty ? nil : a }
            for k in singles.keys { singles[k]?.items.removeAll { $0.id == id } }
            return true
        } catch { return false }
    }

    // MARK: Sharing

    /// Starts sharing in the background and returns at once. Progress shows as a ring on "Your story";
    /// a toast says when it's up (or why it failed, tap to retry).
    @discardableResult
    func shareInBackground(photos: [Data], caption: String?, audience: String) -> Bool {
        guard let app else { return false }
        if posting { app.showToast("Your last story is still going up."); return false }
        let list = Array(photos.prefix(10))
        lastShare = (list, caption, audience)
        posting = true
        upload = StoryUpload(progress: 0, photos: list.count)
        Task {
            let err = await share(list, caption: caption, audience: audience)
            posting = false
            if let err {
                upload = StoryUpload(progress: upload?.progress ?? 0, photos: list.count, error: err)
                app.showToast("\(err) Tap Your story to try again.")
            } else {
                upload = nil
                lastShare = nil
                app.showToast(list.isEmpty ? "Your story is up." : "Your story is up. It disappears in 24 hours and stays in your archive.")
            }
        }
        return true
    }

    func retryUpload() {
        guard let l = lastShare else { return }
        upload = nil
        shareInBackground(photos: l.photos, caption: l.caption, audience: l.audience)
    }

    func dismissUpload() { if !posting { upload = nil; lastShare = nil } }

    /// Returns nil on success, else a message to show.
    private func share(_ photos: [Data], caption: String?, audience: String) async -> String? {
        guard let app else { return "Couldn't share your story." }
        var refs: [StatusMediaRef] = []
        var jpegs: [Data] = []
        // Each photo: a little for compressing, the rest for sending; the last 5% is creating the story.
        let per = photos.isEmpty ? 0 : 0.95 / Double(photos.count)
        func report(_ i: Int, _ f: Double) { upload?.progress = min(0.95, Double(i) * per + f * per) }
        for (i, raw) in photos.enumerated() {
            let jpeg = await Task.detached(priority: .userInitiated) { try? ImageCompressor.compress(raw).data }.value
            guard let jpeg else { return "Couldn't read a photo. Try another." }
            report(i, 0.15)
            do {
                let media = try await app.api.upload(jpeg: jpeg, purpose: "story") { sent in
                    Task { @MainActor [weak self] in
                        guard let self, let u = self.upload, u.error == nil else { return }
                        self.upload?.progress = max(u.progress, min(0.95, Double(i) * per + (0.15 + 0.85 * sent) * per))
                    }
                }
                refs.append(StatusMediaRef(url: media.url))
                jpegs.append(jpeg)
                report(i, 1)
            } catch APIError.offline {
                return "You're offline."
            } catch {
                return (error as? LocalizedError)?.errorDescription ?? "Couldn't upload that photo."
            }
        }
        let text = caption?.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try await app.api.createStatus(CreateStatusBody(media: refs, caption: (text?.isEmpty ?? true) ? nil : text, audience: audience))
            upload?.progress = 1
            for j in jpegs { addToArchive(j, caption: text) }
            await refresh()
            return nil
        } catch APIError.offline {
            return "You're offline."
        } catch {
            return (error as? LocalizedError)?.errorDescription ?? "Couldn't share your story."
        }
    }

    // MARK: @mentions: instant local matches, then the server's

    @ObservationIgnored private var peopleHits: [String: [UserLite]] = [:]
    @ObservationIgnored private var known: [UserLite] = []
    @ObservationIgnored private var warmed = false

    /// People you follow and people in the stories row, matched on the phone while the search runs.
    func warmPeople() {
        guard !warmed, let app else { return }
        warmed = true
        known = rail.map(\.user).filter { $0.id != app.session.user?.id }
        guard let me = app.session.user?.username else { return }
        Task {
            if let f = try? await app.api.following(me) {
                var seen = Set<String>()
                known = (f.items + known).filter { seen.insert($0.id).inserted }
            }
        }
    }

    static func matches(_ u: UserLite, _ q: String) -> Bool {
        let t = q.lowercased(), un = u.username.lowercased(), n = u.name.lowercased()
        return un.hasPrefix(t) || n.split(separator: " ").contains { $0.hasPrefix(t) } || (t.count >= 3 && (un.contains(t) || n.contains(t)))
    }

    private func merged(_ a: [UserLite], _ b: [UserLite]) -> [UserLite] {
        var seen = Set<String>()
        return Array((a + b).filter { seen.insert($0.id).inserted }.prefix(10))
    }

    /// Matches we already have for `q`: earlier answers for it (or a shorter start of it), plus people you follow.
    func peopleNow(_ q: String) -> [UserLite] {
        let t = q.lowercased()
        var cached = peopleHits[t]
        if cached == nil {
            for n in stride(from: t.count - 1, through: 1, by: -1) {
                if let hit = peopleHits[String(t.prefix(n))] { cached = hit.filter { Self.matches($0, t) }; break }
            }
        }
        return merged(known.filter { Self.matches($0, t) }, cached ?? [])
    }

    /// People to @mention, by name or username (answers are remembered for this session).
    func people(_ q: String) async -> [UserLite] {
        let t = q.lowercased()
        if let hit = peopleHits[t] { return merged(known.filter { Self.matches($0, t) }, hit) }
        guard let r = try? await app?.api.people(q) else { return peopleNow(q) }
        peopleHits[t] = r.items
        return merged(known.filter { Self.matches($0, t) }, r.items)
    }

    // MARK: Archive (this phone only)

    static var archiveDir: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("status-archive", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
    private static var indexURL: URL { archiveDir.appendingPathComponent("index.json") }

    func url(of a: ArchivedStatus) -> URL { Self.archiveDir.appendingPathComponent(a.file) }

    func loadArchive() {
        let list = (try? JSON.decoder().decode([ArchivedStatus].self, from: Data(contentsOf: Self.indexURL))) ?? []
        archive = list.filter { FileManager.default.fileExists(atPath: url(of: $0).path) }
    }

    private func addToArchive(_ jpeg: Data, caption: String?) {
        loadArchive()
        let id = UUID().uuidString.lowercased()
        let file = "\(id).jpg"
        guard (try? jpeg.write(to: Self.archiveDir.appendingPathComponent(file), options: .atomic)) != nil else { return }
        var list = [ArchivedStatus(id: id, file: file, caption: (caption?.isEmpty ?? true) ? nil : caption, postedAt: Date())] + archive
        if list.count > Self.maxArchive {
            for old in list[Self.maxArchive...] { try? FileManager.default.removeItem(at: url(of: old)) }
            list = Array(list.prefix(Self.maxArchive))
        }
        archive = list
        saveArchive()
    }

    func removeFromArchive(_ id: String) {
        guard let a = archive.first(where: { $0.id == id }) else { return }
        try? FileManager.default.removeItem(at: url(of: a))
        archive.removeAll { $0.id == id }
        saveArchive()
    }

    private func saveArchive() {
        if let data = try? JSON.encoder().encode(archive) { try? data.write(to: Self.indexURL, options: .atomic) }
    }

    func clear() { rail = []; singles = [:]; comments = [:]; peopleHits = [:]; known = []; warmed = false }
}
