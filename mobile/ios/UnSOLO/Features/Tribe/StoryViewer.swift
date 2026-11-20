import SwiftUI

/// Full-screen story viewer, opened from the story rail.
/// One page per photo of each story post by the author; progress bars on top; tap right/left to move,
/// swipe down to close; the place and author up top; the linked trip (or the author's open plan) rides
/// along as a card; reply bar + quick reactions at the bottom (sent to the author as a direct message).
struct StoryViewer: View {
    let item: StoryViewerItem
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var authorIndex = 0
    @State private var pageIndex = 0
    @State private var progress: Double = 0
    @State private var reply = ""
    @State private var dragY: CGFloat = 0
    @State private var holding = false
    @FocusState private var replying: Bool

    private static let pageSeconds: Double = 6

    struct Page: Hashable {
        let post: Post
        let media: Media?
    }

    private var authorId: String? { item.authorIds.indices.contains(authorIndex) ? item.authorIds[authorIndex] : nil }

    private var pages: [Page] {
        guard let authorId else { return [] }
        let stories = app.tribe.posts.values.filter { $0.kind == .story && $0.author.id == authorId && !$0.isLocal }
            .sorted { $0.createdAt < $1.createdAt }
        return stories.flatMap { p in p.media.isEmpty ? [Page(post: p, media: nil)] : p.media.prefix(4).map { Page(post: p, media: $0) } }
    }

    private var page: Page? { pages.indices.contains(pageIndex) ? pages[pageIndex] : pages.first }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let page {
                content(page)
            } else {
                EmptyState(symbol: "photo", title: "No stories").onAppear { dismiss() }
            }
        }
        .offset(y: max(0, dragY))
        .scaleEffect(1 - min(0.08, max(0, dragY) / 3000))
        .gesture(
            DragGesture(minimumDistance: 20)
                .onChanged { v in if v.translation.height > 0 && !replying { dragY = v.translation.height } }
                .onEnded { v in
                    if v.translation.height > 120 { dismiss() } else { withAnimation(.spring(duration: 0.3)) { dragY = 0 } }
                }
        )
        .environment(\.colorScheme, .dark)
        .statusBarHidden(true)
        .onAppear { authorIndex = item.start }
        .task(id: "\(authorIndex)-\(pageIndex)") { await run() }
    }

    // MARK: Layout

    private func content(_ page: Page) -> some View {
        ZStack {
            GeometryReader { geo in
                PcAsyncImage(media: page.media ?? page.post.trip?.image)
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipped()
                    .id(page)
                    .transition(.opacity)
            }
            .ignoresSafeArea()
            LinearGradient(stops: [.init(color: .black.opacity(0.5), location: 0), .init(color: .clear, location: 0.22),
                                   .init(color: .clear, location: 0.55), .init(color: .black.opacity(0.7), location: 1)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
                .allowsHitTesting(false)
            // Tap zones: left third goes back, the rest goes forward. Long press pauses.
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { location in
                    if replying { replying = false; return }
                    if location.x < 120 { previous() } else { next() }
                }
                .onLongPressGesture(minimumDuration: 0.25, maximumDistance: 20) {} onPressingChanged: { holding = $0 }
                .accessibilityHidden(true)
            VStack(spacing: 0) {
                top(page)
                Spacer()
                bottom(page)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Next") { next() }
        .accessibilityAction(named: "Previous") { previous() }
    }

    private func top(_ page: Page) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 4) {
                ForEach(0..<pages.count, id: \.self) { i in
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(.white.opacity(0.35))
                            Capsule().fill(.white).frame(width: geo.size.width * (i < pageIndex ? 1 : (i == pageIndex ? progress : 0)))
                        }
                    }
                    .frame(height: 3)
                }
            }
            .accessibilityElement()
            .accessibilityLabel("Story \(pageIndex + 1) of \(pages.count)")
            HStack(spacing: 10) {
                Avatar(user: page.post.author, size: 36).overlay(Circle().strokeBorder(.white, lineWidth: 2))
                VStack(alignment: .leading, spacing: 1) {
                    (Text(page.post.author.firstName).fontWeight(.bold) + Text("  ·  \(Fmt.relative(page.post.createdAt))").foregroundStyle(.white.opacity(0.8)))
                        .font(.system(size: 14)).foregroundStyle(.white)
                    if let place = page.post.place?.name ?? page.post.trip?.title {
                        Label(place, systemImage: "mappin").font(.system(size: 12.5, weight: .semibold)).foregroundStyle(.white.opacity(0.92)).lineLimit(1)
                    }
                }
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
                        .frame(width: PcTokens.touch, height: PcTokens.touch).contentShape(Rectangle())
                }
                .buttonStyle(.pcPress)
                .accessibilityLabel("Close stories")
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    private func bottom(_ page: Page) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(page.post.displayTitle)
                .font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(.ultraThinMaterial, in: Pc.shape(16))
                .fixedSize(horizontal: false, vertical: true)
            linkedCard(page.post)
            HStack(spacing: 6) {
                HStack(spacing: 8) {
                    TextField("", text: $reply, prompt: Text("Reply to \(page.post.author.firstName)…").foregroundStyle(.white.opacity(0.75)))
                        .font(.system(size: 15))
                        .foregroundStyle(.white)
                        .focused($replying)
                        .submitLabel(.send)
                        .onSubmit { send(reply, to: page.post) }
                    if !reply.trimmingCharacters(in: .whitespaces).isEmpty {
                        Button { send(reply, to: page.post) } label: {
                            Image(systemName: "paperplane.fill").font(.system(size: 15, weight: .bold)).foregroundStyle(PcTokens.dark.raised)
                                .frame(width: 34, height: 34).background(Circle().fill(PcTokens.dark.ink))
                        }
                        .buttonStyle(.pcPress)
                        .accessibilityLabel("Send reply")
                    }
                }
                .padding(.leading, 16)
                .padding(.trailing, 6)
                .frame(height: 48)
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().strokeBorder(.white.opacity(0.35), lineWidth: 1))
                if !replying {
                    ForEach(["🔥", "😍", "🙌"], id: \.self) { e in
                        Button { send(e, to: page.post) } label: {
                            Text(e).font(.system(size: 24)).frame(width: 44, height: 48)
                        }
                        .buttonStyle(.pcPress)
                        .accessibilityLabel("React \(e)")
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    @ViewBuilder private func linkedCard(_ post: Post) -> some View {
        if let trip = post.trip {
            let counts = SeatCounts(trip: trip)
            linkButton(arc: MiniArc(counts: counts, size: 38), title: "Next departure · \(Fmt.weekdayDayMonth(trip.nextDeparture))",
                       subtitle: "\(counts.isFull ? "Full" : "\(counts.open) spot\(counts.open == 1 ? "" : "s") left") · \(Fmt.rupees(trip.priceFromPaise))", cta: counts.isFull ? "See →" : "Grab a spot →") {
                go(.trip(slug: trip.slug))
            }
        } else if let plan = openPlan(by: post.author.id) {
            let counts = SeatCounts(plan: plan)
            linkButton(arc: MiniArc(counts: counts, size: 38, womenOnly: plan.audience == .women), title: plan.displayTitle,
                       subtitle: "\(post.author.firstName)'s next plan · \(counts.open) spot\(counts.open == 1 ? "" : "s")", cta: "Join →") {
                go(.post(id: plan.id))
            }
        }
    }

    private func linkButton<A: View>(arc: A, title: String, subtitle: String, cta: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                arc
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 13.5, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(1)
                    Text(subtitle).font(.system(size: 12)).foregroundStyle(Pc.ink2).lineLimit(1)
                }
                Text(cta).font(.system(size: 13, weight: .heavy)).foregroundStyle(Pc.accentInk).fixedSize().padding(.leading, 4)
            }
            .padding(.leading, 8)
            .padding(.trailing, 12)
            .padding(.vertical, 8)
            .background(Pc.raised, in: Pc.shape(18))
        }
        .buttonStyle(.pcPress)
        .accessibilityElement(children: .combine)
    }

    private func openPlan(by authorId: String) -> Post? {
        app.tribe.posts.values.filter { $0.kind == .plan && $0.author.id == authorId && $0.status == .live && $0.openSpots > 0 }
            .sorted { $0.createdAt > $1.createdAt }.first
    }

    // MARK: Actions

    private func run() async {
        guard let page else { return }
        app.marks.markSeen(page.post.id)
        progress = 0
        let step = 0.05
        while progress < 1 {
            try? await Task.sleep(for: .milliseconds(Int(step * 1000)))
            if Task.isCancelled { return }
            if holding || replying || dragY > 0 { continue }
            progress = min(1, progress + step / Self.pageSeconds)
        }
        next()
    }

    private func next() {
        if pageIndex + 1 < pages.count {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { pageIndex += 1 }
        } else if authorIndex + 1 < item.authorIds.count {
            withAnimation(.easeOut(duration: 0.2)) { authorIndex += 1; pageIndex = 0 }
        } else {
            dismiss()
        }
    }

    private func previous() {
        if pageIndex > 0 {
            pageIndex -= 1
        } else if authorIndex > 0 {
            authorIndex -= 1
            pageIndex = 0
        } else {
            progress = 0
        }
    }

    private func go(_ route: Route) {
        dismiss()
        router.push(route)
    }

    /// Replies and quick reactions go to the author as a direct message.
    private func send(_ text: String, to post: Post) {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        app.requireVerified("Sign in to reply") {
            reply = ""
            replying = false
            Task {
                if let room = await app.chat.directChat(with: post.author.id) {
                    app.chat.send(room, body: body.count <= 2 ? "\(body) on your story “\(post.displayTitle)”" : body)
                    app.showToast("Sent to \(post.author.firstName)")
                } else {
                    app.showToast("Couldn't send. Try again.")
                }
            }
        }
    }
}
