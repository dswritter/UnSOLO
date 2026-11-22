import PhotosUI
import SwiftUI

// 24-hour stories (GET /statuses), mirroring Android's ui/status/StatusScreens.kt.

// MARK: - Rail

/// The stories row: "Your story" first (adds one, or plays yours), then people with something new,
/// then the rest. Shown at the top of Tribe and on Explore (hidden there when nobody has a story).
struct StatusRail: View {
    var hideWhenEmpty = false
    var title: String?
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    var body: some View {
        let repo = app.statuses
        let me = session.user
        let mine = repo.rail.first { $0.user.id == me?.id }
        let others = repo.rail.filter { $0.user.id != me?.id && !app.tribe.blockedUserIds.contains($0.user.id) && !$0.items.isEmpty }
            .sorted { a, b in
                let ua = a.items.contains { !$0.isSeen }, ub = b.items.contains { !$0.isSeen }
                if ua != ub { return ua }
                return (a.latestAt ?? .distantPast) > (b.latestAt ?? .distantPast)
            }
        if !(hideWhenEmpty && others.isEmpty && mine == nil) {
            VStack(alignment: .leading, spacing: 8) {
                if let title {
                    SectionHeader(title: title, trailing: session.isSignedIn ? "Archive" : nil,
                                  trailingAction: session.isSignedIn ? { router.push(.storyArchive) } : nil)
                        .padding(.horizontal, 18)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        let u = repo.upload
                        let label = u?.error != nil ? "Tap to retry" : u != nil ? "Sharing \(Int((u!.progress * 100).rounded()))%" : "Your story"
                        Button { openMyStory(app, router, mine: mine) } label: {
                            item(StoryRing(user: me, segments: mine?.items.count ?? 1, seen: 0, size: 58, isMine: mine == nil,
                                           progress: u?.progress, failed: u?.error != nil),
                                 name: label, strong: true, failed: u?.error != nil)
                        }
                        .buttonStyle(.pcPress)
                        .accessibilityLabel(mine == nil ? "Add your story" : "Your story")
                        ForEach(others) { a in
                            Button {
                                router.statusViewer = StatusViewerItem(authorId: a.user.id)
                            } label: {
                                item(StoryRing(user: a.user, segments: a.items.count, seen: a.seenCount, size: 58), name: a.user.firstName)
                            }
                            .buttonStyle(.pcPress)
                            .accessibilityLabel("\(a.user.name)'s stories, \(a.items.count - a.seenCount) new")
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
                }
            }
            .task(id: session.isSignedIn) { if session.isSignedIn && repo.rail.isEmpty { await repo.refresh() } }
        }
    }

    private func item<R: View>(_ ring: R, name: String, strong: Bool = false, failed: Bool = false) -> some View {
        VStack(spacing: 5) {
            ring
            Text(name).font(.system(size: 11, weight: .semibold))
                .foregroundStyle(failed ? Pc.red : strong ? Pc.ink : Pc.ink2).lineLimit(1)
        }
        .frame(width: 64)
    }
}

/// What tapping "Your story" does: retry a failed one, wait for one going up, play yours, or start one.
@MainActor
func openMyStory(_ app: AppModel, _ router: Router, mine: StatusAuthor?) {
    app.requireVerified("Sign in to share a story") {
        let repo = app.statuses
        if repo.upload?.error != nil { repo.retryUpload() }
        else if repo.upload != nil { app.showToast("Your story is going up. We'll tell you when it's done.") }
        else if let mine, !mine.items.isEmpty { router.statusViewer = StatusViewerItem(authorId: mine.user.id) }
        else { router.storyComposer = StoryComposeItem() }
    }
}

/// An avatar with a story ring when the person has live stories (tap plays them), otherwise a plain avatar.
struct StatusAvatar: View {
    let user: UserLite
    var size: CGFloat = 64
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        Group {
            if let a = app.statuses.author(user.id), !a.items.isEmpty {
                Button { router.statusViewer = StatusViewerItem(authorId: user.id) } label: {
                    StoryRing(user: user, segments: a.items.count, seen: a.seenCount, size: size)
                }
                .buttonStyle(.pcPress)
                .accessibilityLabel("Play \(user.firstName)'s stories")
            } else {
                Avatar(user: user, size: size - 4)
            }
        }
        .task(id: user.id) { _ = await app.statuses.load(user: user.id) }
    }
}

/// Your own avatar on the You page: the upload ring while a story goes up, a retry when it failed,
/// your story ring when you have some (tap to play), otherwise a "+" that opens the composer.
struct MyStoryAvatar: View {
    let user: UserLite
    var size: CGFloat = 64
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        let repo = app.statuses
        let mine = repo.rail.first { $0.user.id == user.id }.flatMap { $0.items.isEmpty ? nil : $0 }
        let u = repo.upload
        Button { openMyStory(app, router, mine: mine) } label: {
            StoryRing(user: user, segments: mine?.items.count ?? 1, seen: 0, size: size, isMine: mine == nil,
                      progress: u?.progress, failed: u?.error != nil)
        }
        .buttonStyle(.pcPress)
        .accessibilityLabel(u?.error != nil ? "Retry your story" : u != nil ? "Your story is going up" : mine != nil ? "Play your stories" : "Add to your story")
    }
}

// MARK: - Viewer

/// Full-screen stories, Instagram-style: tap right/left for next/previous, hold to pause, swipe sideways
/// (a cube turn) through everyone's stories, swipe down to close, swipe up to reply (opens the keyboard).
/// Close sits top right; react, comments, add/delete and share are stacked on the right; a full-width
/// comment bar runs along the bottom (typing pauses the story).
struct StatusViewer: View {
    let item: StatusViewerItem
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var page = 0
    @State private var loaded = false
    @State private var authors: [StatusAuthor] = []
    @State private var dragX: CGFloat = 0
    @State private var dragY: CGFloat = 0
    @State private var axis: Axis?
    /// Bumped by a swipe up: the story on screen focuses its reply field.
    @State private var replyAsk = 0

    private static let replyPull: CGFloat = 80

    /// Everyone in the stories row plays in order (yours first), so swiping sideways moves between people,
    /// even when you started from someone's profile.
    private func resolve() -> [StatusAuthor] {
        let repo = app.statuses
        let me = session.user?.id
        let live = repo.rail.filter { !$0.items.isEmpty && !app.tribe.blockedUserIds.contains($0.user.id) }
        let ordered = live.filter { $0.user.id == me } + live.filter { $0.user.id != me }
        if ordered.contains(where: { $0.user.id == item.authorId }) { return ordered }
        return (repo.singles[item.authorId].map { [$0] } ?? []) + ordered
    }

    var body: some View {
        GeometryReader { geo in
            let w = max(geo.size.width, 1)
            ZStack {
                Color.black.ignoresSafeArea()
                if authors.isEmpty {
                    Text(loaded ? "This story has expired" : "Loading…").pcFont(.body).foregroundStyle(.white)
                        .task(id: loaded) {
                            guard loaded else { return }
                            try? await Task.sleep(for: .milliseconds(900))
                            if !Task.isCancelled && authors.isEmpty { dismiss() }
                        }
                } else {
                    ForEach(Array(authors.enumerated()), id: \.element.id) { i, a in
                        if abs(i - page) <= 1 {
                            // offset: 0 = on screen, -1 = the next person (to the right), 1 = the previous one.
                            let offset = Double(page - i) - Double(dragX / w)
                            StatusPlayer(authorId: a.user.id, active: i == page && axis == nil, own: a.user.id == session.user?.id, replyAsk: replyAsk,
                                         onDone: { advance(+1, w) }, onBack: { advance(-1, w) }, onClose: { dismiss() })
                                .frame(width: geo.size.width, height: geo.size.height)
                                .offset(x: CGFloat(i - page) * w + dragX)
                                .rotation3DEffect(.degrees(reduceMotion ? 0 : max(-90, min(90, -offset * 75))), axis: (0, 1, 0),
                                                  anchor: offset < 0 ? .leading : .trailing, perspective: 0.6)
                                .zIndex(i == page ? 1 : 0)
                                .allowsHitTesting(i == page)
                        }
                    }
                    if dragY < -30 {
                        VStack(spacing: 4) {
                            Image(systemName: "chevron.up").font(.system(size: 24, weight: .bold))
                            Text(dragY < -Self.replyPull ? "Let go to reply" : "Swipe up to reply").pcFont(.bodyStrong)
                        }
                        .foregroundStyle(.white)
                        .opacity(min(1, Double(-dragY / Self.replyPull)))
                        .frame(maxHeight: .infinity, alignment: .bottom)
                        .padding(.bottom, 130)
                        .allowsHitTesting(false)
                    }
                }
            }
            .offset(y: dragY > 0 ? dragY : dragY * 0.4)
            .scaleEffect(1 - min(abs(dragY), 600) / 3000)
            .simultaneousGesture(DragGesture(minimumDistance: 16).onChanged { v in
                if axis == nil { axis = abs(v.translation.width) > abs(v.translation.height) ? .horizontal : .vertical }
                if axis == .horizontal {
                    var x = v.translation.width
                    // Resist past the first and last person.
                    if (page == 0 && x > 0) || (page == authors.count - 1 && x < 0) { x *= 0.3 }
                    dragX = x
                } else {
                    dragY = max(-200, v.translation.height)
                }
            }.onEnded { v in
                if axis == .horizontal {
                    let predicted = v.predictedEndTranslation.width
                    if (dragX < -w * 0.25 || predicted < -w * 0.5) && page < authors.count - 1 { advance(+1, w) }
                    else if (dragX > w * 0.25 || predicted > w * 0.5) && page > 0 { advance(-1, w) }
                    else { withAnimation(.spring(duration: 0.3)) { dragX = 0 } }
                } else if dragY > 160 {
                    dismiss()
                } else if dragY < -Self.replyPull {
                    Haptics.tick()
                    withAnimation(.spring(duration: 0.25)) { dragY = 0 }
                    replyAsk += 1
                } else {
                    withAnimation(.spring(duration: 0.25)) { dragY = 0 }
                }
                axis = nil
            })
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .task {
            if app.statuses.rail.isEmpty { await app.statuses.refresh() }
            if !app.statuses.rail.contains(where: { $0.user.id == item.authorId }) { _ = await app.statuses.load(user: item.authorId) }
            authors = resolve()
            page = authors.firstIndex { $0.user.id == item.authorId } ?? 0
            loaded = true
            app.statuses.warmPeople()
        }
        .onChange(of: app.statuses.rail) { _, _ in
            // Keep the list in step with deletions, without jumping pages.
            let fresh = resolve()
            if fresh.map(\.id) != authors.map(\.id) {
                let current = authors.indices.contains(page) ? authors[page].id : nil
                if fresh.isEmpty { dismiss() } else {
                    authors = fresh
                    page = current.flatMap { id in fresh.firstIndex { $0.id == id } } ?? min(page, fresh.count - 1)
                }
            }
        }
    }

    /// Next (+1) or previous (-1) person; past the last one closes.
    private func advance(_ by: Int, _ w: CGFloat) {
        let target = page + by
        guard authors.indices.contains(target) else {
            if by > 0 { dismiss() } else { withAnimation(.spring(duration: 0.3)) { dragX = 0 } }
            return
        }
        withAnimation(.easeInOut(duration: reduceMotion ? 0.01 : 0.35)) {
            dragX = by > 0 ? -w : w
        } completion: {
            page = target
            dragX = 0
        }
    }
}

/// One reaction's flurry of emojis.
private struct EmojiBurst: Identifiable, Equatable {
    let id = UUID()
    let emoji: String
    let start = Date()
}

/// The reaction you tapped floats up the screen: a dozen copies rising from the react button,
/// drifting sideways, growing and fading out.
private struct FloatingEmojis: View {
    let bursts: [EmojiBurst]
    static let duration: Double = 1.9

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation) { tl in
                ZStack {
                    ForEach(bursts) { b in
                        let t = tl.date.timeIntervalSince(b.start)
                        ForEach(0..<12, id: \.self) { k in
                            let seed = Self.rand(b.id, k)
                            let local = max(0, min(1, (t - seed.delay) / 1.5))
                            if local > 0 && local < 1 {
                                Text(b.emoji)
                                    .font(.system(size: 24 + seed.size * 22))
                                    .scaleEffect(0.6 + local * 0.7)
                                    .rotationEffect(.degrees((seed.dx - 0.5) * 40 * local))
                                    .opacity(local < 0.15 ? local / 0.15 : 1 - max(0, min(1, (local - 0.6) / 0.4)))
                                    .position(x: geo.size.width * 0.86 - seed.dx * geo.size.width * 0.75 * local + sin(local * 9 + seed.dx * 6) * 24,
                                              y: geo.size.height * 0.72 - local * geo.size.height * (0.55 + seed.size * 0.3))
                            }
                        }
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Stable per-particle randomness from the burst id.
    private static func rand(_ id: UUID, _ k: Int) -> (dx: Double, size: Double, delay: Double) {
        var h = UInt64(truncatingIfNeeded: id.hashValue) &+ UInt64(k) &* 0x9E3779B97F4A7C15
        func next() -> Double { h ^= h << 13; h ^= h >> 7; h ^= h << 17; return Double(h % 10_000) / 10_000 }
        return (next(), next(), next() * 0.38)
    }
}

private struct StatusPlayer: View {
    let authorId: String
    let active: Bool
    let own: Bool
    var replyAsk = 0
    let onDone: () -> Void
    let onBack: () -> Void
    let onClose: () -> Void
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var idx: Int?
    @State private var progress: Double = 0
    @State private var paused = false
    @State private var held = false
    @State private var picker = false
    @State private var commentsOpen = false
    @State private var confirmDelete = false
    @State private var image: UIImage?
    @State private var thumb: UIImage?
    @State private var draft = ""
    @State private var sending = false
    @State private var bursts: [EmojiBurst] = []
    @FocusState private var typing: Bool

    private static let duration: Double = 5.5

    private var author: StatusAuthor? { app.statuses.author(authorId) }
    private var items: [StatusItem] { author?.items ?? [] }
    private var index: Int { min(max(0, idx ?? 0), max(0, items.count - 1)) }
    private var item: StatusItem? { items.indices.contains(index) ? items[index] : nil }
    private var ready: Bool { item.map { !$0.isImage || image != nil } ?? false }
    private var running: Bool { active && !paused && !picker && !commentsOpen && !confirmDelete && !typing && ready }

    private struct ClockKey: Equatable { let id: String?; let running: Bool }

    var body: some View {
        ZStack {
            GeometryReader { geo in
                ZStack {
                    Color.black
                    content
                    LinearGradient(stops: [.init(color: .black.opacity(0.5), location: 0), .init(color: .clear, location: 0.18),
                                           .init(color: .clear, location: 0.65), .init(color: .black.opacity(0.6), location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                        .allowsHitTesting(false)
                    // Tap left third = back, elsewhere = next; hold = pause.
                    Color.clear.contentShape(Rectangle())
                        .gesture(SpatialTapGesture().onEnded { v in
                            if held { held = false; return }
                            if typing { typing = false; return }
                            if picker { picker = false; return }
                            v.location.x < geo.size.width / 3 ? prev() : next()
                        })
                        .onLongPressGesture(minimumDuration: 0.25, maximumDistance: 12, perform: { held = true }, onPressingChanged: { paused = $0 })
                }
            }
            .ignoresSafeArea()
            VStack(spacing: 0) {
                top
                Spacer(minLength: 0)
                bottom
            }
            FloatingEmojis(bursts: bursts).ignoresSafeArea()
        }
        .onAppear { if idx == nil { idx = items.firstIndex { !$0.isSeen } ?? 0 } }
        .task(id: item?.id) { await loadImage() }
        .task(id: ClockKey(id: item?.id, running: running)) {
            guard running, item != nil else { return }
            while progress < 1 {
                try? await Task.sleep(for: .milliseconds(40))
                if Task.isCancelled { return }
                progress = min(1, progress + 0.04 / Self.duration)
            }
            next()
        }
        .onChange(of: active, initial: true) { _, on in markSeen(on); if !on { typing = false } }
        .onChange(of: replyAsk) { _, n in if n > 0 && active { typing = true } }
        .onChange(of: item?.id) { _, _ in markSeen(active); draft = "" }
        .sheet(isPresented: $commentsOpen) {
            if let item { StatusCommentsSheet(itemId: item.id, own: own).presentationDetents([.medium, .large]).pcSheet() }
        }
        .confirmationDialog("Delete this story?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                guard let item else { return }
                let wasLast = items.count == 1
                Task {
                    if await app.statuses.delete(item.id) { if wasLast { onClose() } }
                    else { app.showToast("Couldn't delete it. Try again.") }
                }
            }
            Button("Keep", role: .cancel) {}
        } message: { Text("It stops showing right away. Your copy stays in your archive on this phone.") }
    }

    private func markSeen(_ on: Bool) {
        guard on, let item else { return }
        app.statuses.prefetchComments(item)
        guard !own, !item.isSeen else { return }
        app.statuses.markSeen(authorId: authorId, id: item.id)
    }

    private func next() {
        progress = 0
        if index < items.count - 1 { idx = index + 1 } else { onDone() }
    }

    private func prev() {
        progress = 0
        if index > 0 { idx = index - 1 } else { onBack() }
    }

    private func react(_ kind: String) {
        guard let item else { return }
        app.requireVerified("Sign in to react") {
            let adding = item.myReaction != kind
            Haptics.strong()
            if adding { bursts.append(EmojiBurst(emoji: StoryReaction.emoji(kind) ?? "🏔️")) }
            Task {
                await app.statuses.react(item, kind: kind)
                try? await Task.sleep(for: .seconds(FloatingEmojis.duration))
                bursts.removeAll { Date().timeIntervalSince($0.start) > FloatingEmojis.duration }
            }
        }
    }

    private func sendComment() {
        guard let item else { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        app.requireVerified("Sign in to comment") {
            sending = true
            Task {
                if await app.statuses.comment(item.id, body: text) != nil {
                    Haptics.strong()
                    draft = ""
                    typing = false
                    app.showToast("Comment sent")
                } else {
                    app.showToast("Couldn't send that. Try again.")
                }
                sending = false
            }
        }
    }

    private func loadImage() async {
        image = nil
        thumb = nil
        guard let m = item?.media, item?.isImage == true else { return }
        let maxPixel = UIScreen.main.bounds.height * UIScreen.main.scale
        if let t = m.thumbUrl ?? PcAsyncImage.derivedThumb(m.url), let r = await ImagePipeline.shared.image(t, maxPixel: 480) { thumb = r.image }
        let full = await ImagePipeline.shared.image(m.url, maxPixel: maxPixel)
        if Task.isCancelled { return }
        // A broken photo still moves on (shows the preview, or black).
        image = full?.image ?? thumb ?? UIImage()
    }

    @ViewBuilder private var content: some View {
        if let item {
            if item.isImage {
                ZStack {
                    if let image {
                        Image(uiImage: image).resizable().scaledToFit()
                    } else {
                        if let thumb { Image(uiImage: thumb).resizable().scaledToFit().opacity(0.5) }
                        ProgressView().tint(.white).controlSize(.large)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                MentionText(text: item.caption ?? "", font: .system(size: 26, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(32)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(red: 0.102, green: 0.102, blue: 0.180))
            }
        }
    }

    private var top: some View {
        VStack(spacing: 8) {
            HStack(spacing: 4) {
                ForEach(items.indices, id: \.self) { i in
                    GeometryReader { g in
                        Capsule().fill(.white.opacity(0.35))
                            .overlay(alignment: .leading) {
                                Capsule().fill(.white).frame(width: g.size.width * (i < index ? 1 : i == index ? progress : 0))
                            }
                    }
                    .frame(height: 3)
                }
            }
            .padding(.horizontal, 10)
            HStack(spacing: 10) {
                if let user = author?.user {
                    Button {
                        guard !user.username.isEmpty else { return }
                        router.statusViewer = nil
                        router.push(.profile(username: user.username))
                    } label: {
                        HStack(spacing: 10) {
                            Avatar(user: user, size: 36)
                            Text(own ? "Your story" : user.firstName).font(.system(size: 15, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                            if let item { Text("· \(Fmt.relative(item.createdAt))").font(.system(size: 12)).foregroundStyle(.white.opacity(0.8)).lineLimit(1).fixedSize() }
                        }
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 18, weight: .bold)).foregroundStyle(.white).frame(width: 44, height: 44)
                }
                .accessibilityLabel("Close")
            }
            .padding(.leading, 12)
            .padding(.trailing, 4)
        }
        .padding(.top, 6)
    }

    @ViewBuilder private var bottom: some View {
        if let item {
            VStack(spacing: 10) {
                HStack(alignment: .bottom, spacing: 8) {
                    if item.isImage, let caption = item.caption, !caption.isEmpty {
                        MentionText(text: caption, font: .system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .background(RoundedRectangle(cornerRadius: 16).fill(Color.black.opacity(0.42)))
                    }
                    Spacer(minLength: 0)
                    actionColumn(item)
                }
                .padding(.leading, 14)
                .padding(.trailing, 6)
                if picker {
                    HStack(spacing: 4) {
                        ForEach(StoryReaction.all, id: \.key) { r in
                            Button { picker = false; react(r.key) } label: {
                                Text(r.emoji).font(.system(size: 30)).padding(6)
                                    .background(Circle().fill(item.myReaction == r.key ? .white.opacity(0.25) : .clear))
                            }
                            .accessibilityLabel(StoryReaction.label(r.key))
                        }
                    }
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .background(Capsule().fill(.black.opacity(0.75)))
                    .transition(.scale.combined(with: .opacity))
                }
                commentBar(item)
            }
            .padding(.bottom, 8)
            .animation(.snappy(duration: 0.2), value: picker)
        }
    }

    private func actionColumn(_ item: StatusItem) -> some View {
        let mine = item.myReaction
        let total = item.totalReactions
        return VStack(spacing: 6) {
            // Tap: "Take me there" (or take your reaction back). Hold: pick another.
            VStack(spacing: 2) {
                Text(StoryReaction.emoji(mine) ?? "🏔️").font(.system(size: 26)).opacity(mine == nil ? 0.85 : 1)
                    .scaleEffect(mine != nil ? 1.15 : 1)
                    .animation(.spring(response: 0.3, dampingFraction: 0.35), value: mine)
                Text(total > 0 ? "\(total)" : "React").font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.9))
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .contentShape(Rectangle())
            .onTapGesture { react(mine ?? "wanderlust") }
            .onLongPressGesture(minimumDuration: 0.35) { Haptics.strong(); picker.toggle() }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(mine == nil ? "Take me there" : "Your reaction: \(StoryReaction.label(mine!))")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(named: "More reactions") { picker.toggle() }
            action("bubble.left", (item.commentCount ?? 0) > 0 ? "\(item.commentCount!)" : "Comments") { commentsOpen = true }
            if own {
                action("plus", "Add") { router.statusViewer = nil; Task { try? await Task.sleep(for: .milliseconds(450)); router.storyComposer = StoryComposeItem() } }
                action("trash", "Delete") { confirmDelete = true }
            }
            if let user = author?.user {
                ShareLink(item: URL(string: "https://unsolo.in/profile/\(user.username)")!,
                          message: Text(own ? "My story on UnSOLO" : "\(user.firstName)'s story on UnSOLO")) {
                    actionLabel("paperplane", "Share")
                }
            }
        }
    }

    private func commentBar(_ item: StatusItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if own && !typing {
                Text("Disappears \(StatusTimeText.expiresIn(item.expiresAt)) · saved on this phone").font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7)).padding(.leading, 6)
            }
            HStack(spacing: 4) {
                TextField("", text: $draft, prompt: Text(own ? "Add a comment…" : "Reply to \(author?.user.firstName ?? "them")…").foregroundStyle(.white.opacity(0.75)),
                          axis: .vertical)
                    .lineLimit(1...3)
                    .font(.system(size: 14))
                    .foregroundStyle(.white)
                    .tint(.white)
                    .focused($typing)
                    .submitLabel(.send)
                    .onSubmit(sendComment)
                    .onChange(of: draft) { _, v in if v.count > 500 { draft = String(v.prefix(500)) } }
                if !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    if sending { ProgressView().tint(.white).frame(width: 44, height: 44) }
                    else {
                        Button(action: sendComment) {
                            Image(systemName: "paperplane.fill").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).frame(width: 44, height: 44)
                        }
                        .accessibilityLabel("Send")
                    }
                } else {
                    Button { react("wanderlust") } label: { Text("🏔️").font(.system(size: 22)).frame(width: 44, height: 44) }
                        .accessibilityLabel("Take me there")
                }
            }
            .padding(.leading, 18)
            .padding(.trailing, 4)
            .frame(minHeight: 46)
            .background(Capsule().fill(.black.opacity(typing ? 0.55 : 0.25)))
            .overlay(Capsule().strokeBorder(.white.opacity(typing ? 1 : 0.55), lineWidth: typing ? 2 : 1))
            .animation(.easeOut(duration: 0.15), value: typing)
        }
        .padding(.horizontal, 12)
    }

    private func action(_ symbol: String, _ label: String, _ run: @escaping () -> Void) -> some View {
        Button(action: run) { actionLabel(symbol, label) }.buttonStyle(.plain).accessibilityLabel(label)
    }

    private func actionLabel(_ symbol: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Image(systemName: symbol).font(.system(size: 22, weight: .semibold)).foregroundStyle(.white).frame(height: 28)
            Text(label).font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.9))
        }
        .padding(.horizontal, 10).padding(.vertical, 5)
        .contentShape(Rectangle())
    }
}

enum StatusTimeText {
    /// "in 5h", "in 10m", "soon".
    static func expiresIn(_ date: Date, now: Date = Date()) -> String {
        let s = date.timeIntervalSince(now)
        if s >= 3600 { return "in \(Int(s / 3600))h" }
        if s > 60 { return "in \(Int(s / 60))m" }
        return "soon"
    }
}

/// Comments on a story: everyone who can see it sees them. The saved copy shows at once and a fresh one
/// replaces it quietly. Your own story shows the reactions breakdown on top.
private struct StatusCommentsSheet: View {
    let itemId: String
    let own: Bool
    @Environment(AppModel.self) private var app
    @State private var fetched = false
    @State private var text = ""
    @State private var sending = false

    var body: some View {
        let item = app.statuses.item(itemId)
        let list = app.statuses.comments[itemId] ?? ((fetched || (item?.commentCount ?? 0) == 0) ? [] : nil)
        VStack(alignment: .leading, spacing: 12) {
            SheetHeader(title: "Comments")
            if own, let r = item?.reactions, !r.isEmpty {
                HStack(spacing: 12) {
                    ForEach(StoryReaction.all, id: \.key) { k in
                        if let n = r[k.key] { Text("\(k.emoji) \(n)").pcFont(.bodyStrong).foregroundStyle(Pc.ink) }
                    }
                }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let list {
                        if list.isEmpty {
                            Text("No comments yet. Say something kind.").pcFont(.body).foregroundStyle(Pc.ink2)
                        }
                        ForEach(list) { c in
                            HStack(alignment: .top, spacing: 10) {
                                Avatar(user: c.author, size: 30)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(c.author.firstName).pcFont(.small, weight: .bold).foregroundStyle(Pc.ink)
                                        if let at = c.createdAt { Text(Fmt.relative(at)).pcFont(.label).foregroundStyle(Pc.ink3) }
                                    }
                                    Text(c.body).pcFont(.body).foregroundStyle(Pc.ink)
                                }
                            }
                        }
                    } else {
                        ProgressView().tint(Pc.ink2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 8) {
                TextField("Add a comment…", text: $text, axis: .vertical)
                    .lineLimit(1...4)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .pcField()
                    .onChange(of: text) { _, v in if v.count > 500 { text = String(v.prefix(500)) } }
                Button(sending ? "Sending…" : "Send") {
                    app.requireVerified("Sign in to comment") {
                        sending = true
                        Task {
                            if await app.statuses.comment(itemId, body: text) != nil { text = "" }
                            else { app.showToast("Couldn't post that. Try again.") }
                            sending = false
                        }
                    }
                }
                .buttonStyle(.pc(.accent, compact: true))
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sending)
            }
        }
        .padding(20)
        .task { _ = await app.statuses.loadComments(itemId); fetched = true }
    }
}

// MARK: - Mentions

enum Mentions {
    /// `@username` anywhere in a caption (not inside an email).
    static let pattern = #"(^|[^A-Za-z0-9_.@\-])@([A-Za-z0-9_][A-Za-z0-9_.\-]{0,39})"#
    /// An `@name` being typed at the end of the caption.
    static let tailPattern = #"(^|\s)@([A-Za-z0-9_.\-]{0,40})$"#

    struct Hit { let range: Range<String.Index>; let name: String }

    static func find(_ text: String) -> [Hit] {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [] }
        let ns = text as NSString
        return re.matches(in: text, range: NSRange(location: 0, length: ns.length)).compactMap { m in
            guard let r2 = Range(m.range(at: 2), in: text) else { return nil }
            var name = String(text[r2])
            while name.hasSuffix(".") || name.hasSuffix("-") { name.removeLast() }
            guard !name.isEmpty, let at = text.index(r2.lowerBound, offsetBy: -1, limitedBy: text.startIndex),
                  let end = text.index(at, offsetBy: name.count + 1, limitedBy: text.endIndex) else { return nil }
            return Hit(range: at..<end, name: name)
        }
    }

    static func names(_ text: String) -> Set<String> { Set(find(text).map { $0.name.lowercased() }) }

    /// The @name being typed at the end: where its "@" starts, and what's typed after it.
    static func tail(_ text: String) -> (start: String.Index, query: String)? {
        guard let re = try? NSRegularExpression(pattern: tailPattern),
              let m = re.firstMatch(in: text, range: NSRange(location: 0, length: (text as NSString).length)),
              let r2 = Range(m.range(at: 2), in: text),
              let at = text.index(r2.lowerBound, offsetBy: -1, limitedBy: text.startIndex) else { return nil }
        return (at, String(text[r2]))
    }

    /// The caption with each @username bold, underlined and linked to their profile.
    static func attributed(_ text: String) -> AttributedString {
        var out = AttributedString()
        var last = text.startIndex
        for h in find(text) {
            out += AttributedString(String(text[last..<h.range.lowerBound]))
            var m = AttributedString("@" + h.name)
            m.inlinePresentationIntent = .stronglyEmphasized
            m.underlineStyle = .single
            m.link = URL(string: "unsolo://profile/\(h.name)")
            out += m
            last = h.range.upperBound
        }
        out += AttributedString(String(text[last...]))
        return out
    }
}

/// Caption text with tappable @mentions (each opens that profile).
struct MentionText: View {
    let text: String
    var font: Font = .body
    @Environment(Router.self) private var router

    var body: some View {
        Text(Mentions.attributed(text))
            .font(font)
            .tint(.white)
            .environment(\.openURL, OpenURLAction { url in
                if let link = DeepLink.parse(url), case .profile(let u) = link {
                    router.statusViewer = nil
                    router.push(.profile(username: u))
                    return .handled
                }
                return .discarded
            })
    }
}

/// People matching the @name being typed, in a row above the caption. Tapping one finishes it.
private struct MentionSuggestions: View {
    @Binding var caption: String
    @Environment(AppModel.self) private var app
    @State private var hits: [UserLite] = []
    @State private var searching = false

    var body: some View {
        let tail = Mentions.tail(caption)
        Group {
            if let tail {
                if tail.query.isEmpty {
                    Text("Type a name or username to mention someone").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
                } else if hits.isEmpty {
                    Text(searching ? "Looking for “\(tail.query)”…" : "No one called “\(tail.query)” on UnSOLO").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(hits) { u in
                                Button { caption = String((String(caption[..<tail.start]) + "@\(u.username) ").prefix(500)) } label: {
                                    HStack(spacing: 8) {
                                        Avatar(user: u, size: 28)
                                        VStack(alignment: .leading, spacing: 0) {
                                            Text(u.name).font(.system(size: 12, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                                            Text("@\(u.username)").font(.system(size: 11)).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
                                        }
                                    }
                                    .padding(.leading, 4).padding(.trailing, 12).padding(.vertical, 4)
                                    .background(Capsule().fill(Color(white: 0.07).opacity(0.8)))
                                }
                                .buttonStyle(.pcPress)
                                .accessibilityLabel("Mention \(u.name)")
                            }
                        }
                    }
                }
            }
        }
        .task(id: tail?.query) {
            app.statuses.warmPeople()
            guard let q = tail?.query, !q.isEmpty else { hits = []; return }
            // People we already know show at once; the server's answer fills in a moment later.
            hits = app.statuses.peopleNow(q)
            searching = true
            try? await Task.sleep(for: .milliseconds(120))
            if Task.isCancelled { return }
            hits = await app.statuses.people(q)
            searching = false
        }
    }
}

/// Search people on UnSOLO by name or username and pick one to tag.
struct PeoplePickerSheet: View {
    let onPick: (UserLite) -> Void
    @Environment(AppModel.self) private var app
    @State private var q = ""
    @State private var hits: [UserLite]? = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SheetHeader(title: "Tag people")
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(Pc.ink2)
                TextField("Search by name or username", text: $q).textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .pcField()
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    if hits == nil {
                        ProgressView().tint(Pc.ink2)
                    } else if q.trimmingCharacters(in: .whitespaces).isEmpty {
                        Text("Find travellers to mention. They'll get a notification if they can see your story.").pcFont(.small).foregroundStyle(Pc.ink2)
                    } else if hits!.isEmpty {
                        Text("No one called “\(q.trimmingCharacters(in: .whitespaces))” on UnSOLO").pcFont(.body).foregroundStyle(Pc.ink2)
                    } else {
                        ForEach(hits!) { u in
                            Button { onPick(u) } label: { PersonRow(user: u) }
                                .buttonStyle(.pcPress)
                                .accessibilityLabel("Tag \(u.name)")
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(20)
        .task(id: q) {
            let t = q.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "@", with: "")
            app.statuses.warmPeople()
            guard !t.isEmpty else { hits = []; return }
            let now = app.statuses.peopleNow(t)
            hits = now.isEmpty ? nil : now
            try? await Task.sleep(for: .milliseconds(120))
            if Task.isCancelled { return }
            hits = await app.statuses.people(t)
        }
    }
}

/// Avatar, name and @username (people lists, pickers).
struct PersonRow: View {
    let user: UserLite
    var size: CGFloat = 40
    var body: some View {
        HStack(spacing: 12) {
            Avatar(user: user, size: size)
            VStack(alignment: .leading, spacing: 1) {
                Text(user.name).pcFont(.bodyStrong).foregroundStyle(Pc.ink).lineLimit(1)
                Text("@\(user.username)").pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
            }
            Spacer(minLength: 4)
            if user.isIdVerified { VerifiedBadge() }
            if user.isHost { PcTag(text: "Host", style: .host) }
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }
}

// MARK: - Composer

/// Share a story: up to 10 photos (from the library or your archive), an optional caption, who can see it.
/// Opens the photo picker straight away; text-only works too. Share closes at once and the story goes up
/// in the background (the ring on "Your story" shows how far).
/// A photo in the composer: the original bytes, the upright preview it's edited on, and how it's framed.
private struct ComposerShot: Identifiable, Sendable {
    let id = UUID()
    let data: Data
    let image: UIImage
    var fit = StoryFit()

    init?(_ data: Data) {
        guard let img = StoryMath.decode(data) else { return nil }
        self.data = data
        image = img
    }

    /// Untouched photos go up as they are; moved ones exactly as framed.
    var upload: Data { fit.touched ? (StoryMath.render(image, fit: fit) ?? data) : data }
}

struct StatusComposer: View {
    let archiveId: String?
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var shots: [ComposerShot] = []
    @State private var moved = false
    @State private var preparing = false
    @State private var caption = ""
    @State private var audience = "all"
    @State private var tagging = false
    @State private var pickerOpen = false
    @State private var picked: [PhotosPickerItem] = []
    @State private var page: UUID?
    @State private var showArchive = false
    @FocusState private var typing: Bool

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if shots.isEmpty {
                TextField("", text: $caption, prompt: Text("Type a story, or add photos").foregroundStyle(.white.opacity(0.5)), axis: .vertical)
                    .font(.system(size: 24, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .focused($typing)
                    .padding(28)
            } else {
                pager
            }
            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.system(size: 16, weight: .bold)).foregroundStyle(.white).frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Cancel")
                    Spacer()
                    Button("Archive") { showArchive = true }.buttonStyle(.plain).font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                        .padding(.horizontal, 12)
                }
                .padding(.horizontal, 4)
                Spacer()
                bottom
            }
        }
        .preferredColorScheme(.dark)
        .photosPicker(isPresented: $pickerOpen, selection: $picked, maxSelectionCount: max(1, 10 - shots.count), matching: .images, photoLibrary: .shared())
        .onChange(of: picked) { _, items in
            guard !items.isEmpty else { return }
            Task {
                for it in items {
                    if shots.count < 10, let d = try? await it.loadTransferable(type: Data.self), let shot = ComposerShot(d) { add(shot) }
                }
                picked = []
            }
        }
        .sheet(isPresented: $tagging) {
            PeoplePickerSheet { u in
                tagging = false
                let base = caption.trimmingCharacters(in: .whitespaces)
                caption = String(((base.isEmpty ? "" : base + " ") + "@\(u.username) ").prefix(500))
            }
            .presentationDetents([.medium, .large]).pcSheet()
        }
        .sheet(isPresented: $showArchive) {
            NavigationStack {
                StatusArchiveView(onPick: { a in
                    showArchive = false
                    loadArchived(a.id)
                })
            }
            .pcSheet()
        }
        .onChange(of: caption) { _, v in if v.count > 500 { caption = String(v.prefix(500)) } }
        .task {
            if let archiveId { loadArchived(archiveId) } else { pickerOpen = true }
        }
    }

    private func loadArchived(_ id: String) {
        app.statuses.loadArchive()
        guard let a = app.statuses.archive.first(where: { $0.id == id }), let d = try? Data(contentsOf: app.statuses.url(of: a)) else { return }
        if shots.count < 10, let shot = ComposerShot(d) { add(shot) }
        if caption.isEmpty { caption = a.caption ?? "" }
    }

    private func add(_ shot: ComposerShot) {
        shots.append(shot)
        if page == nil { page = shot.id }
    }

    private var pageIndex: Int { shots.firstIndex { $0.id == page } ?? 0 }

    /// Zoomed in past "whole": one finger drags the photo, so the pager stops.
    private var currentZoomed: Bool {
        guard let s = shots.first(where: { $0.id == page }), s.fit.touched else { return false }
        return s.fit.scale > StoryMath.fitScale(s.fit.frame, s.image.size, StoryMath.snap(s.fit.angle)) * 1.02
    }

    /// Each photo full screen in a 9:16 frame, edited in place; swipe sideways for the next one.
    private var pager: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach($shots) { $shot in
                    ZStack(alignment: .topTrailing) {
                        StoryCanvas(image: shot.image, fit: $shot.fit, onMove: { moved = true })
                        VStack(alignment: .trailing, spacing: 8) {
                            Button { remove(shot.id) } label: {
                                Image(systemName: "xmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(.white)
                                    .frame(width: 36, height: 36).background(Circle().fill(.black.opacity(0.4)))
                            }
                            .accessibilityLabel("Remove this photo")
                            if shot.fit.touched {
                                chip("Reset", selected: false) {
                                    withAnimation(.easeOut(duration: 0.2)) { shot.fit = StoryFit(frame: shot.fit.frame) }
                                }
                                .accessibilityLabel("Reset the photo")
                            }
                        }
                        .padding(.top, 56).padding(.trailing, 8)
                    }
                    .containerRelativeFrame([.horizontal, .vertical])
                    .id(shot.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $page)
        .scrollIndicators(.hidden)
        .scrollDisabled(currentZoomed)
        .ignoresSafeArea(.keyboard)
        .overlay(alignment: .top) {
            VStack(spacing: 8) {
                if shots.count > 1 {
                    Text("\(pageIndex + 1) / \(shots.count)").font(.system(size: 11, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 10).padding(.vertical, 4).background(Capsule().fill(.black.opacity(0.45)))
                }
                if !moved {
                    Text("Pinch, twist or drag the photo to fit your story").font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 12).padding(.vertical, 6).background(Capsule().fill(.black.opacity(0.5)))
                        .transition(.opacity)
                }
            }
            .padding(.top, 14)
            .allowsHitTesting(false)
            .animation(.easeOut(duration: 0.2), value: moved)
        }
    }

    private func remove(_ id: UUID) {
        guard let i = shots.firstIndex(where: { $0.id == id }) else { return }
        shots.remove(at: i)
        if page == id { page = shots.isEmpty ? nil : shots[min(i, shots.count - 1)].id }
    }

    private func share() {
        let list = shots
        preparing = true
        Task {
            // Moved photos are drawn off the main thread; untouched ones go as they are.
            let photos = await Task.detached(priority: .userInitiated) { list.map(\.upload) }.value
            preparing = false
            if app.statuses.shareInBackground(photos: photos, caption: caption, audience: audience) {
                app.showToast(photos.isEmpty ? "Sharing your story…" : "Sharing your story… you can keep using the app.")
                dismiss()
            }
        }
    }

    private var bottom: some View {
        VStack(alignment: .leading, spacing: 10) {
            MentionSuggestions(caption: $caption)
            if !shots.isEmpty {
                TextField("", text: $caption, prompt: Text("Add a caption…").foregroundStyle(.white.opacity(0.6)), axis: .vertical)
                    .lineLimit(1...4)
                    .font(.system(size: 14))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 22).fill(Color(white: 0.07).opacity(0.6)))
            }
            HStack(spacing: 8) {
                Button { pickerOpen = true } label: {
                    Image(systemName: "camera").font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 44, height: 44).background(Circle().fill(.white.opacity(0.16)))
                }
                .accessibilityLabel("Add photos")
                chip("@ Tag people", selected: false) { tagging = true }
                let tagged = Mentions.names(caption).count
                if tagged > 0 { Text("\(tagged) tagged").font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.75)) }
            }
            HStack(spacing: 8) {
                chip("Everyone", selected: audience == "all") { audience = "all" }
                chip("Followers", selected: audience == "followers") { audience = "followers" }
                Spacer()
                Button(preparing ? "Sharing…" : "Share", action: share)
                .buttonStyle(.pcAccent)
                .disabled((shots.isEmpty && caption.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) || app.statuses.posting || preparing)
            }
        }
        .padding(14)
    }

    private func chip(_ label: String, selected: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(.system(size: 12, weight: .bold)).foregroundStyle(selected ? .black : .white)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(Capsule().fill(selected ? .white : .white.opacity(0.16)))
        }
        .buttonStyle(.pcPress)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Archive

/// Stories you've shared from this phone, kept after they disappear. Tap one to share it again.
struct StatusArchiveView: View {
    var onPick: ((ArchivedStatus) -> Void)?
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        let list = app.statuses.archive
        ScrollView {
            if list.isEmpty {
                EmptyState(symbol: "archivebox", title: "Nothing archived yet",
                           message: "Stories you share are kept here on your phone after they disappear, so you can share them again.")
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Only on this phone. Tap one to share it again.").pcFont(.small).foregroundStyle(Pc.ink2).padding(.horizontal, 16)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 3), spacing: 4) {
                        ForEach(list) { a in
                            Button {
                                if let onPick { onPick(a) } else { router.storyComposer = StoryComposeItem(archiveId: a.id) }
                            } label: {
                                Color.clear.aspectRatio(9 / 16, contentMode: .fit)
                                    .overlay {
                                        if let img = UIImage(contentsOfFile: app.statuses.url(of: a).path) {
                                            Image(uiImage: img).resizable().scaledToFill()
                                        }
                                    }
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                    .overlay(alignment: .bottomLeading) {
                                        Text(Fmt.relative(a.postedAt)).font(.system(size: 11, weight: .semibold)).foregroundStyle(.white)
                                            .padding(.horizontal, 8).padding(.vertical, 2).background(Capsule().fill(.black.opacity(0.45))).padding(6)
                                    }
                            }
                            .buttonStyle(.pcPress)
                            .contextMenu {
                                Button("Remove from archive", systemImage: "trash", role: .destructive) { app.statuses.removeFromArchive(a.id) }
                            }
                            .accessibilityLabel("Share again, from \(Fmt.relative(a.postedAt))")
                        }
                    }
                    .padding(.horizontal, 4)
                }
            }
        }
        .pcScreen()
        .pcNavigationBar("Story archive")
        .onAppear { app.statuses.loadArchive() }
    }
}
