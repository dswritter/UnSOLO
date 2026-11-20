import SwiftUI

enum FeedFilter: String, CaseIterable, Hashable {
    case all, plan, story, ask
    var label: String {
        switch self {
        case .all: "For you"
        case .plan: "Plans"
        case .story: "Stories"
        case .ask: "Asks"
        }
    }
}

struct TribeFeedView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var filter: FeedFilter = .all
    @State private var place: String?

    private var items: [FeedItem] {
        let all = app.tribe.items(for: filter.rawValue)
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
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                AppHeader(title: "Tribe")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(FeedFilter.allCases, id: \.self) { f in
                            PcChip(text: f.label, selected: filter == f, showsCheck: false) {
                                withAnimation(.snappy(duration: PcTokens.motionStandard)) { filter = f }
                            }
                        }
                        placeMenu
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.top, 4)
                .padding(.bottom, 6)
                if items.isEmpty {
                    if case .failed = app.tribe.feedState[filter.rawValue] {
                        EmptyState(symbol: "wifi.slash", title: "Couldn't load the Tribe", message: "Pull to try again.")
                    } else if app.tribe.feedState[filter.rawValue] == .loading || app.tribe.feeds[filter.rawValue] == nil {
                        ProgressView().tint(Pc.ink).frame(maxWidth: .infinity).padding(40)
                    } else {
                        EmptyState(symbol: "person.3", title: "Nothing here yet", message: "Be the first: post a plan, a story or an ask.")
                    }
                }
                LazyVStack(spacing: 14) {
                    ForEach(items) { item in
                        FeedCard(item: item)
                            .onAppear {
                                if item.id == items.last?.id { Task { await app.tribe.loadMore(key: filter.rawValue) } }
                            }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                if !items.isEmpty { CaughtUpFooter(departures: app.tribe.feeds[filter.rawValue]?.nextDepartures ?? []) }
            }
        }
        .refreshable { await app.tribe.refreshFeed(key: filter.rawValue) }
        .pcScreen()
        .toolbar(.hidden, for: .navigationBar)
        .task(id: filter) { await app.tribe.refreshFeed(key: filter.rawValue) }
        .onAppear {
            #if DEBUG
            if DebugLaunch.startScreen == "tribeStories" { filter = .story }
            #endif
        }
    }

    private var placeMenu: some View {
        Menu {
            Button("All places") { place = nil }
            ForEach(places, id: \.self) { p in Button(p) { place = p } }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "mappin").font(.system(size: 12, weight: .semibold))
                Text(place ?? "All places").pcFont(.small, weight: .medium).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 10, weight: .bold))
            }
            .foregroundStyle(Pc.ink)
            .padding(.horizontal, 12)
            .frame(minHeight: 38)
            .background(Capsule().fill(Pc.tonal))
            .frame(minHeight: PcTokens.touch)
            .contentShape(Capsule())
        }
        .accessibilityLabel("Filter by place, \(place ?? "all places")")
    }
}

struct FeedSeparator: View {
    var body: some View {
        Rectangle().fill(Pc.rule.opacity(0.7)).frame(height: 8)
            .overlay(alignment: .top) { HairlineRule(color: Pc.rule2) }
            .overlay(alignment: .bottom) { HairlineRule(color: Pc.rule2) }
            .accessibilityHidden(true)
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
            PlacedTripCard(trip: t)
        }
    }
}

// MARK: - Shared card pieces

struct AuthorRow: View {
    let post: Post
    var subtitle: String?
    @Environment(Router.self) private var router

    var body: some View {
        HStack(spacing: 10) {
            Button { router.push(.profile(username: post.author.username)) } label: { Avatar(user: post.author, size: 40) }
                .buttonStyle(.plain)
                .accessibilityLabel("Open \(post.author.name)'s profile")
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(post.author.name).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                    if post.author.isIdVerified { VerifiedBadge() }
                    if post.author.isHost && post.kind != .plan { PcTag(text: "Host", style: .host) }
                }
                Text(subtitle ?? defaultSubtitle).pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
            }
            Spacer()
            PcTag(text: post.kind.label, style: post.kind == .plan ? .kindDashed : .kind)
        }
    }

    private var defaultSubtitle: String {
        let city = post.place?.name.components(separatedBy: ",").first ?? ""
        let when = post.isLocal ? "now" : Fmt.relative(post.createdAt)
        switch post.kind {
        case .story:
            if post.trip != nil {
                let c = Fmt.calendar.dateComponents([.month], from: post.createdAt)
                let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                return "Went with UnSOLO · \(months[(c.month ?? 1) - 1])"
            }
            return "\(city) · \(when)"
        default: return city.isEmpty ? when : "\(city) · \(when)"
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
                    Image(systemName: "exclamationmark.triangle").foregroundStyle(Pc.red)
                    Text("Not sent").pcFont(.small, weight: .semibold).foregroundStyle(Pc.red)
                    Spacer()
                    Button("Retry") { app.tribe.retryFailed(postId) }.buttonStyle(.pc(.outline, compact: true))
                    Button("Discard") { app.tribe.discardLocal(postId) }.buttonStyle(.pc(.danger))
                case "held":
                    Image(systemName: "hourglass").foregroundStyle(Pc.goldInk)
                    Text("Held for review · only you can see this").pcFont(.small, weight: .semibold).foregroundStyle(Pc.goldInk)
                    Spacer()
                default:
                    ProgressView().controlSize(.small).tint(Pc.ink)
                    Text(app.connectivity.isOnline ? (s.progress > 0 && s.progress < 1 ? "Uploading photos · \(Int(s.progress * 100))%" : "Sending…") : "Waiting for connection")
                        .pcFont(.small).foregroundStyle(Pc.ink2)
                    Spacer()
                    if s.progress > 0 && s.progress < 1 { FillBar(filled: Int(s.progress * 100), total: 100, width: 60) }
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .background(Pc.goldBg, in: Pc.shape(Pc.radius))
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Plan card (pencilled)

struct PlanCard: View {
    let post: Post
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            AuthorRow(post: post)
            LocalStateBar(postId: post.id)
            CommunityPlanLabel()
            Text(post.displayTitle).pcFont(.title1).foregroundStyle(Pc.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
            Text(post.body).pcFont(.body).foregroundStyle(Pc.ink).lineLimit(3).multilineTextAlignment(.leading)
            FactsRow(facts: planFacts(post))
            HStack(alignment: .center, spacing: 12) {
                SeatRow(seats: SeatBuilder.planSeats(post), cellSize: PcTokens.seatSmall, spacing: 6, maxCells: 8)
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(post.memberCount) in · \(post.openSpots) open").pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink)
                    Text("incl. organiser").pcFont(.small).foregroundStyle(Pc.ink2)
                }
                .fixedSize()
            }
            if let cost = post.estCostText {
                Text(cost + (post.audience == .verified ? " · verified only" : post.audience == .women ? " · women only" : ""))
                    .pcFont(.small).foregroundStyle(Pc.ink2)
            }
            HStack(spacing: 16) {
                Label("\(post.reactions.wantToGo) want to go", systemImage: "mappin.and.ellipse").labelStyle(CountLabelStyle())
                Label("\(post.commentCount)", systemImage: "bubble.left").labelStyle(CountLabelStyle())
                Spacer()
                JoinButton(post: post, compact: true)
            }
        }
        .padding(16)
        .pcPencilled()
    }
}

func planFacts(_ post: Post) -> [Fact] {
    [
        Fact(symbol: "calendar", text: Fmt.range(post.startsOn, post.endsOn)),
        Fact(symbol: "mappin", text: post.place?.name.components(separatedBy: ",").first ?? "Open"),
        Fact(symbol: "person.2", text: "\(post.openSpots) of \(post.spotsTotal ?? post.memberCount) open"),
    ]
}

struct CountLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon.font(.system(size: 15))
            configuration.title.pcFont(.small, weight: .semibold)
        }
        .foregroundStyle(Pc.ink)
    }
}

/// "Ask to join" with all membership states. Outline (pencilled) — never the ink "Take a seat".
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
                Text("Your plan").pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink2)
            } else if v?.membership == .approved {
                Label("You're in", systemImage: "checkmark").pcFont(.small, weight: .semibold).foregroundStyle(Pc.green)
            } else if v?.membership == .requested {
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                    Text("Requested")
                }
                .pcFont(.small, weight: .semibold)
                .foregroundStyle(Pc.ink)
                .padding(.horizontal, 14)
                .frame(minHeight: 40)
                .background(Capsule().fill(Pc.tonal))
            } else if let reason = v?.joinBlockedReason, reason != .phoneRequired {
                Text(reason.message).pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink2)
            } else if post.openSpots == 0 {
                Text("Full").pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink2)
            } else {
                Button("Ask to join") {
                    app.requireVerified("Sign in to ask to join") {
                        router.pendingJoinPostId = post.id
                        if router.path(router.tab).last != .post(id: post.id) { router.push(.post(id: post.id)) }
                    }
                }
                .buttonStyle(.pc(.outline, compact: compact))
            }
        }
    }
}

// MARK: - Story card (photos first)

struct StoryCard: View {
    let post: Post
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            AuthorRow(post: post)
            LocalStateBar(postId: post.id)
            Text(post.displayTitle).pcFont(.title2).foregroundStyle(Pc.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
            if !post.media.isEmpty { PhotoMosaic(media: post.media) }
            if let trip = post.trip { LinkedTripCard(trip: trip) }
            HStack(spacing: 16) {
                ReactionToggle(post: post, kind: .wantToGo, showLabel: true)
                Label("\(post.commentCount)", systemImage: "bubble.left").labelStyle(CountLabelStyle())
                Spacer()
                Button { app.requireVerified("Sign in to save posts") { app.tribe.toggleSave(post.id) } } label: {
                    Image(systemName: post.viewer?.saved == true ? "bookmark.fill" : "bookmark").font(.system(size: 17)).foregroundStyle(Pc.ink)
                        .frame(width: PcTokens.touch, height: PcTokens.touch)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(post.viewer?.saved == true ? "Saved" : "Save")
            }
        }
        .padding(16)
        .pcCard()
    }
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

/// "HOSTED TRIP · BOOKABLE" — the printed (solid) counterpart inside a story.
struct LinkedTripCard: View {
    let trip: TripLite
    @Environment(Router.self) private var router

    var body: some View {
        HStack(spacing: 10) {
            PcAsyncImage(media: trip.image, targetSize: CGSize(width: 52, height: 52))
                .frame(width: 52, height: 52)
                .clipShape(Pc.shape(Pc.imageRadius))
            VStack(alignment: .leading, spacing: 2) {
                Overline(text: "Hosted trip · bookable").lineLimit(1).minimumScaleFactor(0.7)
                Text(trip.title).pcFont(.bodyStrong).foregroundStyle(Pc.ink).lineLimit(1)
                Text("\(Fmt.rupees(trip.priceFromPaise)) · \(Fmt.dayMonth(trip.nextDeparture)) · \(trip.seatsLeft ?? 0) left")
                    .pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
            }
            Spacer(minLength: 4)
            Button("Take a seat") { router.push(.trip(slug: trip.slug)) }
                .buttonStyle(.pc(.primary, compact: true))
        }
        .padding(10)
        .background(Pc.tonal, in: Pc.shape(Pc.radius))
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
            app.requireVerified("Sign in to react") { app.tribe.toggleReaction(post.id, kind) }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: on ? kind.symbol + ".fill" : kind.symbol).font(.system(size: 15))
                Text(showLabel ? "\(post.reactions[kind]) \(kind.label.lowercased())" : "\(post.reactions[kind])").pcFont(.small, weight: .semibold)
            }
            .foregroundStyle(Pc.ink)
            .frame(minHeight: PcTokens.touch)
        }
        .buttonStyle(.plain)
        .disabled(post.isLocal)
        .accessibilityLabel("\(kind.label), \(post.reactions[kind])")
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// MARK: - Ask card

struct AskCard: View {
    let post: Post
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            AuthorRow(post: post)
            LocalStateBar(postId: post.id)
            Text(post.displayTitle).pcFont(.title2).foregroundStyle(Pc.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
            if !post.body.isEmpty, post.title != nil {
                Text(post.body).pcFont(.body).foregroundStyle(Pc.ink).lineLimit(2)
            }
            if let poll = post.poll { PollView(post: post, poll: poll) }
            HStack(spacing: 16) {
                ReactionToggle(post: post, kind: .helpful, showLabel: true)
                Label("\(post.commentCount) answer\(post.commentCount == 1 ? "" : "s")", systemImage: "bubble.left").labelStyle(CountLabelStyle())
                Spacer()
            }
        }
        .padding(16)
        .pcCard()
    }
}

struct PollView: View {
    let post: Post
    let poll: Poll
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(spacing: 8) {
            ForEach(poll.options) { o in
                let share = poll.totalVotes > 0 ? Double(o.votes) / Double(poll.totalVotes) : 0
                let mine = poll.myChoice == o.id
                Button {
                    guard poll.myChoice == nil, !post.isLocal else { return }
                    app.requireVerified("Sign in to vote") { app.tribe.vote(post.id, option: o) }
                } label: {
                    ZStack(alignment: .leading) {
                        GeometryReader { geo in
                            Rectangle().fill(mine ? Pc.ink.opacity(0.16) : Pc.ink.opacity(0.07)).frame(width: poll.myChoice == nil ? 0 : geo.size.width * share)
                        }
                        HStack {
                            if mine { Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)) }
                            Text(o.label).pcFont(.bodyStrong, weight: mine ? .semibold : .regular)
                            Spacer()
                            if poll.myChoice != nil { Text("\(o.votes)").pcFont(.bodyStrong).monospacedDigit() }
                        }
                        .foregroundStyle(Pc.ink)
                        .padding(.horizontal, 12)
                    }
                    .frame(minHeight: PcTokens.touch)
                    .background(Pc.tonal)
                    .clipShape(Pc.shape(Pc.radius))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(o.label), \(o.votes) votes")
                .accessibilityAddTraits(mine ? .isSelected : [])
            }
            Text(poll.myChoice == nil ? "\(poll.totalVotes) votes · tap to vote" : "\(poll.totalVotes) votes · you voted")
                .pcFont(.small).foregroundStyle(Pc.ink2).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Placed hosted trip (≈1 in 8)

struct PlacedTripCard: View {
    let trip: TripLite
    @Environment(Router.self) private var router

    var body: some View {
        Button { router.push(.trip(slug: trip.slug)) } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Overline(text: "UnSOLO hosted trip")
                    Spacer()
                    if let host = trip.host { PcTag(text: host.name, style: .host) }
                }
                PcAsyncImage(media: trip.image)
                    .frame(height: 160)
                    .clipShape(Pc.shape(Pc.imageRadius))
                Text(trip.title).pcFont(.title2).foregroundStyle(Pc.ink).multilineTextAlignment(.leading)
                FactsRow(facts: [
                    Fact(symbol: "calendar", text: Fmt.weekdayDayMonth(trip.nextDeparture)),
                    Fact(symbol: "clock", text: Fmt.duration(trip.durationDays)),
                    Fact(symbol: "person.2", text: "\(trip.seatsLeft ?? 0) left", emphasis: (trip.seatsLeft ?? 0) <= 3),
                ])
                SeatRow(seats: SeatBuilder.tripSeats(trip), cellSize: 26, spacing: 5, maxCells: 14)
                HStack {
                    Text(Fmt.rupees(trip.priceFromPaise)).pcFont(.title2).monospacedDigit().foregroundStyle(Pc.ink)
                    Text("/ person").pcFont(.small).foregroundStyle(Pc.ink2)
                    Spacer()
                    Text("Take a seat").pcFont(.bodyStrong).foregroundStyle(Pc.onInk).padding(.horizontal, 18)
                        .frame(minHeight: 44).background(Capsule().fill(Pc.ink))
                }
            }
            .padding(16)
            .pcCard()
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .contain)
    }
}

// MARK: - End of feed

struct CaughtUpFooter: View {
    let departures: [TripLite]
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(spacing: 6) {
                Image(systemName: "checkmark").font(.system(size: 22, weight: .semibold)).foregroundStyle(Pc.ink)
                    .frame(width: 56, height: 56).background(Circle().fill(Pc.tonal))
                Text("You're caught up").pcFont(.title2).foregroundStyle(Pc.ink)
                Text("New plans and stories show up here. Meanwhile, these leave soon.").pcFont(.small).foregroundStyle(Pc.ink2).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(24)
            if !departures.isEmpty {
                Overline(text: "Next departures").padding(.horizontal, 24).padding(.bottom, 6)
                VStack(spacing: 0) {
                    ForEach(Array(departures.enumerated()), id: \.element.id) { i, t in
                        DepartureRow(trip: t, category: .trips, showsDivider: i < departures.count - 1) { router.push(.trip(slug: t.slug)) }
                    }
                }
                .pcCard()
                .padding(.horizontal, 20)
            }
            Color.clear.frame(height: 24)
        }
    }
}
