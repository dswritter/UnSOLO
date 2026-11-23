import SwiftUI

enum FeedFilter: String, CaseIterable, Hashable {
    case all, plan, story, ask, poll
    var label: String {
        switch self {
        case .all: "For you"
        case .plan: "Plans"
        case .story: "Stories"
        case .ask: "Questions"
        case .poll: "Polls"
        }
    }
    /// Server feed key. Polls are asks that carry a poll, filtered on the client.
    var feedKey: String { self == .poll ? "ask" : rawValue }

    func includes(_ item: FeedItem) -> Bool {
        guard case .post(let p) = item else { return self == .all }
        switch self {
        case .ask: return p.kind == .ask && p.poll == nil
        case .poll: return p.kind == .ask && p.poll != nil
        default: return true
        }
    }
}

struct TribeFeedView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var filter: FeedFilter = .all
    @State private var place: String?

    private var items: [FeedItem] {
        let all = app.tribe.items(for: filter.feedKey).filter { filter.includes($0) }
        guard let place else { return all }
        return all.filter { item in
            if case .post(let p) = item { return p.place?.name.localizedCaseInsensitiveContains(place) ?? false }
            return false
        }
    }

    private var places: [String] {
        let names = app.tribe.items(for: "all").compactMap { item -> String? in
            if case .post(let p) = item { return p.place?.name.components(separatedBy: ",").first }
            return nil
        }
        return Array(Set(names)).sorted()
    }

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                AppHeader(title: "Tribe").id("top")
                StatusRail().padding(.top, 2)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(FeedFilter.allCases, id: \.self) { f in
                            PcChip(text: f.label, selected: filter == f, showsCheck: false) {
                                withAnimation(.snappy(duration: PcTokens.motionStandard)) { filter = f }
                            }
                        }
                        placeMenu
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.top, 10)
                .padding(.bottom, 6)
                if items.isEmpty {
                    if case .failed = app.tribe.feedState[filter.feedKey] {
                        EmptyState(symbol: "wifi.slash", title: "Couldn't load the Tribe", message: "Pull to try again.")
                    } else if app.tribe.feedState[filter.feedKey] == .loading || app.tribe.feeds[filter.feedKey] == nil {
                        ProgressView().tint(Pc.ink2).frame(maxWidth: .infinity).padding(40)
                    } else {
                        EmptyState(symbol: "person.3", title: "Nothing here yet", message: "Be the first: post a plan, a story or a question.")
                    }
                }
                LazyVStack(spacing: 10) {
                    ForEach(items) { item in
                        FeedCard(item: item)
                            .onAppear {
                                if item.id == items.last?.id { Task { await app.tribe.loadMore(key: filter.feedKey) } }
                            }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 4)
                if !items.isEmpty { CaughtUpFooter(departures: app.tribe.feeds[filter.feedKey]?.nextDepartures ?? []) }
            }
        }
        .refreshable {
            async let a: Void = app.tribe.refreshFeed(key: filter.feedKey)
            async let b: Void = app.statuses.refresh()
            _ = await (a, b)
        }
        .onChange(of: router.reselected[.tribe]) { _, _ in withAnimation { proxy.scrollTo("top", anchor: .top) } }
        }
        .pcScreen()
        .toolbar(.hidden, for: .navigationBar)
        .task(id: filter) { await app.tribe.refreshFeed(key: filter.feedKey) }
        .task { if app.tribe.feeds["all"] == nil, filter != .all { await app.tribe.refreshFeed(key: "all") } }
        .onAppear {
            #if DEBUG
            switch DebugLaunch.startScreen {
            case "tribeStories": filter = .story
            case "tribePlans": filter = .plan
            case "tribePolls": filter = .poll
            default: break
            }
            #endif
        }
    }

    private var placeMenu: some View {
        Menu {
            Button("All places") { place = nil }
            ForEach(places, id: \.self) { p in Button(p) { place = p } }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "mappin").font(.system(size: 12, weight: .bold))
                Text(place ?? "All places").font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 9.5, weight: .heavy))
            }
            .foregroundStyle(place == nil ? Pc.ink : Pc.raised)
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .background(Capsule().fill(place == nil ? Pc.raised : Pc.ink))
            .overlay { if place == nil { Capsule().strokeBorder(Pc.rule, lineWidth: 1) } }
            .frame(minHeight: PcTokens.touch)
            .contentShape(Capsule())
        }
        .accessibilityLabel("Filter by place, \(place ?? "all places")")
    }
}

// MARK: - Story rail

/// Authors with stories in the feed: one arc per story (pine unseen, rule seen). "Your story" is gold with a +.
struct StoryRail: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    struct Entry: Identifiable {
        let author: UserLite
        let stories: [Post]
        var id: String { author.id }
    }

    static func entries(_ app: AppModel, excluding me: String?) -> [Entry] {
        let stories = app.tribe.posts.values.filter { $0.kind == .story && !$0.isLocal && $0.status == .live && !app.tribe.blockedUserIds.contains($0.author.id) }
        let byAuthor = Dictionary(grouping: stories) { $0.author.id }
        return byAuthor.values
            .compactMap { list -> Entry? in
                let sorted = list.sorted { $0.createdAt < $1.createdAt }
                guard let a = sorted.first?.author, a.id != me else { return nil }
                return Entry(author: a, stories: sorted)
            }
            .sorted { ($0.stories.last?.createdAt ?? .distantPast) > ($1.stories.last?.createdAt ?? .distantPast) }
    }

    var body: some View {
        let entries = Self.entries(app, excluding: session.user?.id)
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 12) {
                Button {
                    app.requireVerified("Sign in to share a story") { router.openCompose(.story) }
                } label: {
                    item(StoryRing(user: session.user, size: 56, isMine: true), name: "Your story")
                }
                .buttonStyle(.pcPress)
                .accessibilityLabel("Add your story")
                ForEach(Array(entries.enumerated()), id: \.element.id) { i, e in
                    let seen = e.stories.filter { app.marks.seenStories.contains($0.id) }.count
                    Button {
                        router.storyViewer = StoryViewerItem(authorIds: entries.map(\.author.id), start: i)
                    } label: {
                        item(StoryRing(user: e.author, segments: e.stories.count, seen: seen, size: 56), name: e.author.firstName)
                    }
                    .buttonStyle(.pcPress)
                    .accessibilityLabel("\(e.author.name)'s stories, \(e.stories.count - seen) new")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }
    }

    private func item<R: View>(_ ring: R, name: String) -> some View {
        VStack(spacing: 5) {
            ring
            Text(name).font(.system(size: 11, weight: .semibold)).foregroundStyle(Pc.ink2).lineLimit(1)
        }
        .frame(width: 60)
    }
}

struct FeedCard: View {
    let item: FeedItem
    @Environment(Router.self) private var router

    var body: some View {
        switch item {
        case .post(let p):
            // Inner controls (join, react, save, author) are Buttons; the card itself uses a tap gesture
            // so those keep priority.
            Group {
                switch p.kind {
                case .plan: PlanCard(post: p)
                case .story: StoryCard(post: p)
                case .ask: AskCard(post: p)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { if !p.isLocal { router.push(.post(id: p.id)) } }
            .accessibilityElement(children: .contain)
            .accessibilityAction(named: "Open") { if !p.isLocal { router.push(.post(id: p.id)) } }
        case .placedTrip(let t):
            TripCard(trip: t)
        }
    }
}

// MARK: - Shared card pieces

struct AuthorRow: View {
    let post: Post
    var subtitle: String?
    var showsKindTag = true
    @Environment(Router.self) private var router

    var body: some View {
        HStack(spacing: 10) {
            Button { router.push(.profile(username: post.author.username)) } label: { Avatar(user: post.author, size: 32) }
                .buttonStyle(.pcPress)
                .frame(minWidth: PcTokens.touch, minHeight: PcTokens.touch)
                .padding(.horizontal, -6)
                .accessibilityLabel("Open \(post.author.name)'s profile")
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 5) {
                    Text(post.author.name).font(.system(size: 13.5, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(1)
                    if post.author.isIdVerified { VerifiedBadge() }
                    if post.author.isHost && post.kind != .plan { PcTag(text: "Host", style: .host) }
                    Text("· \(post.isLocal ? "now" : Fmt.relative(post.createdAt))").font(.system(size: 12)).foregroundStyle(Pc.ink3).lineLimit(1)
                }
                Text(subtitle ?? defaultSubtitle).font(.system(size: 12)).foregroundStyle(Pc.ink2).lineLimit(1)
            }
            Spacer(minLength: 4)
            if showsKindTag { kindTag }
        }
    }

    @ViewBuilder private var kindTag: some View {
        switch post.kind {
        case .plan:
            if post.audience == .women { PcTag(text: "Women only", style: .women) }
        case .ask:
            PcTag(text: post.poll == nil ? "Question" : "Poll", style: .verified, icon: post.poll == nil ? "questionmark.circle.fill" : "chart.bar.fill")
        case .story:
            EmptyView()
        }
    }

    private var defaultSubtitle: String {
        let city = post.place?.name.components(separatedBy: ",").first
        switch post.kind {
        case .plan: return "Plan · looking for people"
        case .story: return ["Story", post.trip?.title ?? city].compactMap { $0 }.joined(separator: " · ")
        case .ask: return ["Asking the Tribe", city].compactMap { $0 }.joined(separator: " · ")
        }
    }
}

struct LocalStateBar: View {
    let postId: String
    @Environment(AppModel.self) private var app

    var body: some View {
        if let s = app.tribe.local[postId] {
            HStack(spacing: 10) {
                switch s.state {
                case "failed":
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Pc.red)
                    Text("Not sent").pcFont(.small, weight: .semibold).foregroundStyle(Pc.red)
                    Spacer()
                    Button("Retry") { app.tribe.retryFailed(postId) }.buttonStyle(.pc(.outline, compact: true))
                    Button("Discard") { app.tribe.discardLocal(postId) }.buttonStyle(.pc(.danger))
                case "held":
                    Image(systemName: "hourglass").foregroundStyle(Pc.goldInk)
                    Text("Held for review · only you can see this").pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink)
                    Spacer()
                default:
                    ProgressView().controlSize(.small).tint(Pc.ink2)
                    Text(app.connectivity.isOnline ? (s.progress > 0 && s.progress < 1 ? "Uploading photos · \(Int(s.progress * 100))%" : "Sending…") : "Waiting for connection")
                        .pcFont(.small).foregroundStyle(Pc.ink2)
                    Spacer()
                    if s.progress > 0 && s.progress < 1 { FillBar(filled: Int(s.progress * 100), total: 100, width: 60) }
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .background(Pc.tonal, in: Pc.shape(Pc.radius))
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Plan card (pencilled)

struct PlanCard: View {
    let post: Post
    var ringSize: CGFloat = 92
    @Environment(AppModel.self) private var app

    var body: some View {
        let counts = SeatCounts(plan: post)
        VStack(alignment: .leading, spacing: 10) {
            AuthorRow(post: post)
            LocalStateBar(postId: post.id)
            VStack(alignment: .leading, spacing: 4) {
                Text(post.displayTitle).font(.system(size: 16.5, weight: .bold, design: .rounded)).foregroundStyle(Pc.ink)
                    .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                Text(post.body).font(.system(size: 13)).foregroundStyle(Pc.ink2).lineLimit(3).multilineTextAlignment(.leading)
            }
            HStack(alignment: .center, spacing: 14) {
                SeatRing(seats: RingSeats.plan(post), size: ringSize, plan: true, womenOnly: post.audience == .women,
                         dots: .none, centre: .user(post.author), waiting: post.viewer?.membership == .requested ? app.session.user : nil)
                VStack(alignment: .leading, spacing: 8) {
                    FactsRow(facts: planFacts(post))
                    SeatCaption(counts: counts, noun: "spots")
                    JoinButton(post: post, compact: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, 2)
        }
        .padding(14)
        .pcPencilled()
    }
}

func planFacts(_ post: Post) -> [Fact] {
    var facts = [Fact(symbol: "calendar", text: Fmt.range(post.startsOn, post.endsOn))]
    if let a = Fmt.day(post.startsOn), let b = Fmt.day(post.endsOn),
       let n = Fmt.calendar.dateComponents([.day], from: a, to: b).day, n >= 0 {
        facts.append(Fact(symbol: "clock", text: n == 0 ? "1 day" : "\(n + 1) days"))
    }
    if let place = post.place?.name.components(separatedBy: ",").first { facts.append(Fact(symbol: "mappin", text: place)) }
    if let cost = post.estCostText {
        facts.append(Fact(symbol: "wallet.bifold", text: cost.replacingOccurrences(of: "Est. ", with: "~")))
    }
    return facts
}

struct CountLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon.font(.system(size: 16, weight: .bold))
            configuration.title.font(.system(size: 13, weight: .bold)).monospacedDigit()
        }
        .foregroundStyle(Pc.ink2)
    }
}

/// "Request to join" with all membership states (pine, compact in feeds).
struct JoinButton: View {
    let post: Post
    var compact = false
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        let v = post.viewer
        Group {
            if post.isLocal {
                EmptyView()
            } else if v?.isAuthor == true {
                PcTag(text: "Your plan", style: .organiser)
            } else if v?.membership == .approved {
                Label("You're in", systemImage: "checkmark.circle.fill").font(.system(size: 13, weight: .bold)).foregroundStyle(Pc.ink)
            } else if v?.membership == .requested {
                HStack(spacing: 6) {
                    Image(systemName: "clock.fill")
                    Text("Requested")
                }
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Pc.ink)
                .padding(.horizontal, 12)
                .frame(minHeight: 34)
                .background(Capsule().fill(Pc.tonal))
            } else if let reason = v?.joinBlockedReason, reason != .phoneRequired {
                Text(reason.message).pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink2)
            } else if post.openSpots == 0 {
                PcTag(text: "Full", style: .full)
            } else {
                Button("Request to join") {
                    app.requireVerified("Sign in to request to join") {
                        router.pendingJoinPostId = post.id
                        if router.path(router.tab).last != .post(id: post.id) { router.push(.post(id: post.id)) }
                    }
                }
                .buttonStyle(.pc(.primary, compact: compact))
            }
        }
    }
}

// MARK: - Story card (photo first)

struct StoryCard: View {
    let post: Post
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            AuthorRow(post: post).padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 8)
            LocalStateBar(postId: post.id).padding(.horizontal, 16)
            if let first = post.media.first {
                Color.clear
                    .aspectRatio(16 / 10, contentMode: .fit)
                    .overlay { PcAsyncImage(media: first) }
                    .clipped()
                    .overlay(alignment: .bottomTrailing) {
                        if post.media.count > 1 {
                            Label("\(post.media.count)", systemImage: "square.on.square").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                                .padding(.horizontal, 10).frame(height: 26).background(Capsule().fill(PcTokens.light.scrim)).padding(10)
                        }
                    }
            }
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(post.displayTitle).font(.system(size: 14.5, weight: .bold)).foregroundStyle(Pc.ink).multilineTextAlignment(.leading)
                    if post.title != nil {
                        Text(post.body).font(.system(size: 13.5)).foregroundStyle(Pc.ink2).lineLimit(2).multilineTextAlignment(.leading)
                    }
                }
                if let trip = post.trip { NextDepartureLink(trip: trip) }
                ReactionsBar(post: post)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)
        }
        .clipShape(Pc.shape())
        .pcCard()
    }
}

/// Heart (love), comments, share … save.
struct ReactionsBar: View {
    let post: Post
    var showsSave = true
    @Environment(AppModel.self) private var app

    var body: some View {
        HStack(spacing: 18) {
            ReactionToggle(post: post, kind: .love)
            Label("\(post.commentCount)", systemImage: "bubble.left").labelStyle(CountLabelStyle())
                .accessibilityLabel("\(post.commentCount) comments")
            ShareLink(item: DeepLink.post(id: post.id).webURL, subject: Text(post.displayTitle)) {
                Image(systemName: "square.and.arrow.up").font(.system(size: 15, weight: .bold)).foregroundStyle(Pc.ink2)
                    .frame(minWidth: 32, minHeight: PcTokens.touch)
            }
            .accessibilityLabel("Share")
            Spacer()
            if showsSave {
                Button { app.requireVerified("Sign in to save posts") { app.tribe.toggleSave(post.id) } } label: {
                    Image(systemName: post.viewer?.saved == true ? "bookmark.fill" : "bookmark").font(.system(size: 15, weight: .bold))
                        .foregroundStyle(post.viewer?.saved == true ? Pc.ink : Pc.ink2)
                        .frame(width: PcTokens.touch, height: PcTokens.touch)
                }
                .buttonStyle(.pcPress)
                .disabled(post.isLocal)
                .accessibilityLabel(post.viewer?.saved == true ? "Saved" : "Save")
            }
        }
    }
}

/// "Next departure · Fri 18 Dec · 3 spots left · ₹8,499 · Grab a spot →" with a mini arc.
struct NextDepartureLink: View {
    let trip: TripLite
    var label = "Next departure"
    @Environment(Router.self) private var router

    var body: some View {
        let counts = SeatCounts(trip: trip)
        Button { router.push(.trip(slug: trip.slug)) } label: {
            HStack(spacing: 10) {
                MiniArc(counts: counts, size: 34)
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(label) · \(Fmt.weekdayDayMonth(trip.nextDeparture))").font(.system(size: 12.5, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(1).minimumScaleFactor(0.85)
                    Text("\(counts.short) · \(Fmt.rupees(trip.priceFromPaise))")
                        .font(.system(size: 12)).foregroundStyle(Pc.ink2).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text(counts.isFull ? "See →" : "Grab a spot →").font(.system(size: 12.5, weight: .heavy)).foregroundStyle(Pc.accentInk).fixedSize()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(minHeight: PcTokens.touch)
            .background(Pc.tonal, in: Pc.shape(16))
            .contentShape(Rectangle())
        }
        .buttonStyle(.pcPress)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(trip.title), \(Fmt.weekdayDayMonth(trip.nextDeparture)), \(counts.accessibilityText()), \(Fmt.rupees(trip.priceFromPaise)). Grab a spot")
        .accessibilityAddTraits(.isButton)
    }
}

/// Legacy name used by post detail.
struct LinkedTripCard: View {
    let trip: TripLite
    var body: some View { NextDepartureLink(trip: trip) }
}

struct PhotoMosaic: View {
    let media: [Media]
    var height: CGFloat = 200

    var body: some View {
        HStack(spacing: 4) {
            PcAsyncImage(media: media[0])
                .frame(maxWidth: .infinity)
                .frame(height: height)
                .clipShape(Pc.shape(Pc.imageRadius))
            if media.count > 1 {
                VStack(spacing: 4) {
                    PcAsyncImage(media: media[1]).clipShape(Pc.shape(Pc.imageRadius))
                    if media.count > 2 {
                        ZStack {
                            PcAsyncImage(media: media[2]).clipShape(Pc.shape(Pc.imageRadius))
                            if media.count > 3 {
                                Rectangle().fill(.black.opacity(0.35)).clipShape(Pc.shape(Pc.imageRadius))
                                Text("+\(media.count - 3)").pcFont(.title2).foregroundStyle(.white)
                            }
                        }
                    }
                }
                .frame(width: 110, height: height)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("\(media.count) photo\(media.count == 1 ? "" : "s")")
    }
}

struct ReactionToggle: View {
    let post: Post
    let kind: ReactionKind
    var showLabel = false
    @Environment(AppModel.self) private var app

    var body: some View {
        let on = post.myReactions.contains(kind)
        Button {
            app.requireVerified("Sign in to react") { withAnimation(.snappy) { app.tribe.toggleReaction(post.id, kind) } }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: on ? symbol + ".fill" : symbol).font(.system(size: 16, weight: .bold))
                    .contentTransition(.symbolEffect(.replace))
                Text(showLabel ? "\(post.reactions[kind]) \(kind.label.lowercased())" : "\(post.reactions[kind])").font(.system(size: 13, weight: .bold)).monospacedDigit()
            }
            .foregroundStyle(on ? onColor : Pc.ink2)
            .frame(minHeight: PcTokens.touch)
        }
        .buttonStyle(.pcPress)
        .disabled(post.isLocal)
        .accessibilityLabel("\(kind.label), \(post.reactions[kind])")
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var symbol: String { kind == .helpful ? "arrow.up.circle" : kind.symbol }
    private var onColor: Color { kind == .love ? Pc.red : Pc.ink }
}

// MARK: - Ask card

struct AskCard: View {
    let post: Post
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            AuthorRow(post: post)
            LocalStateBar(postId: post.id)
            Text(post.displayTitle).font(.system(size: 16.5, weight: .bold, design: .rounded)).foregroundStyle(Pc.ink)
                .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
            if !post.body.isEmpty, post.title != nil, post.body != post.title {
                Text(post.body).font(.system(size: 13)).foregroundStyle(Pc.ink2).lineLimit(2)
            }
            if let poll = post.poll { PollView(post: post, poll: poll) }
            if let answer = hostAnswer { HostAnswer(comment: answer) }
            HStack(spacing: 16) {
                ReactionToggle(post: post, kind: .helpful)
                Label("\(post.commentCount) answer\(post.commentCount == 1 ? "" : "s")", systemImage: "bubble.left").labelStyle(CountLabelStyle())
                Spacer()
                if !post.isLocal {
                    Button("Answer") { router.push(.post(id: post.id)) }.buttonStyle(.pc(.quiet, compact: true))
                }
            }
        }
        .padding(16)
        .pcCard()
        .task(id: post.id) {
            // The host's answer is highlighted on the card; comments come from the post endpoint (cached after the first load).
            guard post.kind == .ask, !post.isLocal, post.commentCount > 0 else { return }
            if app.tribe.comments[post.id] == nil { app.tribe.loadComments(post.id) }
            if app.tribe.comments[post.id]?.isEmpty ?? true { await app.tribe.refreshPost(post.id) }
        }
    }

    private var hostAnswer: Comment? {
        (app.tribe.comments[post.id] ?? []).first { $0.author.isHost && $0.author.id != post.author.id && $0.pollChoice == nil }
    }
}

/// Host answer highlight: ink left rule, HOST badge.
struct HostAnswer: View {
    let comment: Comment
    var body: some View {
        HStack(spacing: 12) {
            Capsule().fill(Pc.ink).frame(width: 3)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Avatar(user: comment.author, size: 20)
                    Text(comment.author.name).font(.system(size: 12, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(1)
                    PcTag(text: "Host", style: .host)
                    Text("· answered").font(.system(size: 11)).foregroundStyle(Pc.ink3)
                }
                Text(comment.body).font(.system(size: 13)).foregroundStyle(Pc.ink).lineLimit(3).fixedSize(horizontal: false, vertical: true)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }
}

/// Tap-to-vote rows; after voting, result bars grow and your choice gets an ink outline and a check.
struct PollView: View {
    let post: Post
    let poll: Poll
    @Environment(AppModel.self) private var app

    var body: some View {
        let voted = poll.myChoice != nil
        let total = max(poll.totalVotes, 1)
        VStack(spacing: 7) {
            ForEach(poll.options) { o in
                let share = Double(o.votes) / Double(total)
                let mine = poll.myChoice == o.id
                Button {
                    guard !post.isLocal else { return }
                    app.requireVerified("Sign in to vote") { withAnimation(.easeOut(duration: 0.3)) { app.tribe.vote(post.id, option: o) } }
                } label: {
                    ZStack(alignment: .leading) {
                        if voted {
                            GeometryReader { geo in
                                Rectangle().fill(Pc.tonalStrong).frame(width: max(0, geo.size.width * share))
                            }
                        }
                        HStack(spacing: 6) {
                            if mine { Image(systemName: "checkmark.circle.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.ink) }
                            Text(o.label).font(.system(size: 13, weight: .semibold)).foregroundStyle(Pc.ink).lineLimit(1)
                            Spacer()
                            if voted { Text("\(Int((share * 100).rounded()))%").font(.system(size: 13, weight: .bold)).monospacedDigit().foregroundStyle(Pc.ink) }
                        }
                        .padding(.horizontal, 14)
                    }
                    .frame(minHeight: 44)
                    .background(voted ? Pc.tonal : Pc.raised)
                    .clipShape(Pc.shape(14))
                    .overlay {
                        if mine { Pc.shape(14).strokeBorder(Pc.ink, lineWidth: 2) }
                        else if !voted { Pc.shape(14).strokeBorder(Pc.rule, lineWidth: 1.5) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.pcPress)
                .accessibilityLabel(voted ? "\(o.label), \(Int((share * 100).rounded())) percent\(mine ? ", your vote" : "")" : "Vote for \(o.label)")
                .accessibilityHint(mine ? "Takes back your vote" : voted ? "Changes your vote" : "")
                .accessibilityAddTraits(mine ? .isSelected : [])
            }
            Text(voted ? "\(poll.totalVotes) \(poll.totalVotes == 1 ? "vote" : "votes") · tap to change" : "Tap an option to vote · \(poll.totalVotes) votes")
                .font(.system(size: 12, weight: .semibold)).foregroundStyle(Pc.ink3).frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 2)
        }
    }
}

// MARK: - Placed hosted trip (≈1 in 8)

struct PlacedTripCard: View {
    let trip: TripLite
    var body: some View { TripCard(trip: trip) }
}

// MARK: - End of feed

struct CaughtUpFooter: View {
    let departures: [TripLite]
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(spacing: 6) {
                Image(systemName: "checkmark").font(.system(size: 19, weight: .heavy)).foregroundStyle(Pc.ink)
                    .frame(width: 56, height: 56).background(Circle().fill(Pc.tonal))
                Text("You're caught up").pcFont(.title2).foregroundStyle(Pc.ink)
                Text("New plans and stories show up here. Meanwhile, these leave soon.").pcFont(.small).foregroundStyle(Pc.ink2).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(24)
            if !departures.isEmpty {
                Overline(text: "Leaving soon").padding(.horizontal, 24).padding(.bottom, 4)
                VStack(spacing: 0) {
                    ForEach(Array(departures.enumerated()), id: \.element.id) { i, t in
                        TripListRow(trip: t, showsDivider: i < departures.count - 1) { router.push(.trip(slug: t.slug)) }
                    }
                }
                .padding(.horizontal, 12)
                .pcCard()
                .padding(.horizontal, 14)
            }
            Color.clear.frame(height: 24)
        }
    }
}
