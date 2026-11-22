import SwiftUI

struct YouView: View {
    @Environment(AppModel.self) private var app
    @Environment(SessionStore.self) private var session
    @Environment(Router.self) private var router

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    AppHeader(title: "You") {
                        if let u = session.user {
                            ShareLink(item: URL(string: "https://unsolo.in/profile/\(u.username)")!) {
                                Image(systemName: "square.and.arrow.up").font(.system(size: 16)).foregroundStyle(Pc.ink)
                                    .frame(width: PcTokens.touch, height: PcTokens.touch)
                            }
                            .accessibilityLabel("Share profile")
                        }
                        Button { router.push(.settings) } label: {
                            Image(systemName: "gearshape").font(.system(size: 16.5)).foregroundStyle(Pc.ink)
                                .frame(width: PcTokens.touch, height: PcTokens.touch)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Settings")
                    }
                    .id("top")
                    if let me = session.me {
                        ProfileContent(username: me.user.username, isMe: true)
                    } else {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Browse freely. Sign in to join.").pcFont(.title2).foregroundStyle(Pc.ink)
                            Text("Posting, joining plans and chats need an account with a verified email or phone.").pcFont(.body).foregroundStyle(Pc.ink2)
                            Button("Sign in or create an account") { router.authSheet = true }.buttonStyle(.pc(.primary, fullWidth: true))
                            Button("Settings") { router.push(.settings) }.buttonStyle(.pc(.outline, fullWidth: true))
                        }
                        .padding(16)
                    }
                }
            }
            .onChange(of: router.reselected[.you]) { _, _ in withAnimation { proxy.scrollTo("top", anchor: .top) } }
            .refreshable {
                guard let u = session.user?.username else { return }
                await app.profiles.refresh(u)
                await app.statuses.refresh()
                await app.profiles.loadPhoneRequests()
            }
        }
        .pcScreen()
        .toolbar(.hidden, for: .navigationBar)
        .task { if session.isSignedIn { await session.refreshMe() } }
    }
}

struct ProfileView: View {
    let username: String
    @Environment(SessionStore.self) private var session
    @Environment(AppModel.self) private var app
    var body: some View {
        ScrollView { ProfileContent(username: username, isMe: session.user?.username == username) }
            .refreshable { await app.profiles.refresh(username); await app.statuses.refresh() }
            .pcScreen()
            .pcNavigationBar()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: URL(string: "https://unsolo.in/profile/\(username)")!) { Image(systemName: "square.and.arrow.up") }
                        .accessibilityLabel("Share profile")
                }
            }
    }
}

struct ProfileContent: View {
    enum Tab: String, Hashable { case posts, plans, trips, reviews, badges, listings }
    let username: String
    let isMe: Bool
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @State private var tab: Tab = .posts
    @State private var report: ReportTarget?
    @State private var confirmBlock = false
    @State private var opening = false
    @State private var editStatus = false
    @State private var loading = true

    private var profile: ProfileResponse? { app.profiles.profile(username) }
    private var posts: [Post] {
        var list = (profile?.posts ?? []).map { app.tribe.posts[$0.id] ?? $0 }
        if isMe {
            let local = app.tribe.local.keys.compactMap { app.tribe.posts[$0] }.filter { p in !list.contains { $0.id == p.id } }
            list = local + list
        }
        return list
    }
    private var plans: [Post] { posts.filter { $0.kind == .plan } }
    private var tiles: [Post] { posts.filter { $0.kind != .plan } }
    /// Nothing fresh yet: placeholders where the details go (a cached copy shows with a thin bar instead).
    private var waiting: Bool { loading && profile?.stats == nil }

    var body: some View {
        ScrollViewReader { proxy in
            VStack(alignment: .leading, spacing: 0) {
                if let p = profile {
                    header(p)
                    if loading { ProgressView().progressViewStyle(.linear).tint(Pc.gold).padding(.horizontal, 20).padding(.vertical, 4) }
                    if waiting { ProfileSkeleton() } else { ProfileAbout(profile: p, onEditStatus: isMe ? { editStatus = true } : nil) }
                    actions(p)
                    if let ph = p.phone {
                        PhoneRow(phone: ph, onRequest: { app.requireVerified("Sign in to ask for their number") { Task { await app.profiles.requestPhone(username) } } })
                    }
                    if isMe { PhoneRequestsCard() }
                    if !waiting {
                        ProfileStatsRow(profile: p, fallbackTrips: isMe ? app.trips.myTrips.past.count : nil) { key in
                            switch key {
                            case "leaderboard": router.push(.leaderboard)
                            case "followers", "following": router.push(.people(username: username, kind: key))
                            default:
                                tab = Tab(rawValue: key) ?? .posts
                                withAnimation { proxy.scrollTo("tabs", anchor: .top) }
                            }
                        }
                    }
                    if !isMe { ConnectionsCard(connections: p.connections, mutualPlaces: p.travel?.mutualPlaces ?? []) }
                    if let h = p.host {
                        if isMe { PeopleRail(title: "Reached out to you", people: h.reachedOut ?? []) }
                        PeopleRail(title: "Travellers hosted", people: h.travellers ?? [], total: h.travellerCount)
                    }
                    if let l = p.listings, !l.isEmpty {
                        SectionHeader(title: isMe ? "Your listings" : "Their trips and listings").padding(.horizontal, 20).padding(.top, 14)
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 12) {
                                ForEach(l) { t in TripCard(trip: t, category: ExploreCategory(kind: t.kind)).frame(width: 250) }
                            }
                            .padding(.horizontal, 16).padding(.vertical, 6)
                        }
                    }
                    ChipTabs(items: tabItems, selection: $tab)
                        .padding(.top, 14)
                        .id("tabs")
                    if let open = p.openPlan, tab == .posts { planRow(open).padding(.horizontal, 20).padding(.top, 12) }
                    switch tab {
                    case .posts: postsGrid
                    case .plans: plansList
                    case .trips: TravelSection(travel: p.travel, own: isMe, pastFallback: isMe ? app.trips.myTrips.past : [])
                    case .reviews: ReviewsSection(profile: p)
                    case .badges: BadgesSection(badges: p.badges, own: isMe)
                    case .listings:
                        VStack(spacing: 12) {
                            ForEach(p.listings ?? []) { t in TripCard(trip: t, category: ExploreCategory(kind: t.kind)) }
                        }
                        .padding(16)
                    }
                    if isMe { ownLinks }
                    Color.clear.frame(height: 24)
                } else if case .failed(let m) = app.profiles.state[username] {
                    EmptyState(symbol: "person.crop.circle.badge.exclamationmark", title: "Profile unavailable", message: m)
                } else {
                    ProfileSkeleton().padding(.top, 20)
                }
            }
        }
        .task {
            await reload()
            await app.analytics.track("screen.view", screen: isMe ? "you" : "profile")
        }
        .sheet(item: $report) { ReportSheet(target: $0) }
        .sheet(isPresented: $editStatus) { StatusEditSheet().presentationDetents([.height(360)]).pcSheet() }
        .confirmationDialog("Block \(profile?.user.name ?? "")?", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("Block", role: .destructive) { if let id = profile?.user.id { app.tribe.block(userId: id) } }
        } message: { Text("You won't see their posts, comments or messages.") }
    }

    private func reload() async {
        await app.profiles.refresh(username)
        loading = false
        if isMe {
            async let a: Void = app.trips.refresh()
            async let b: Void = app.profiles.loadPhoneRequests()
            async let c: Void = app.statuses.refresh()
            _ = await (a, b, c)
        }
    }

    private var tabItems: [(Tab, String)] {
        var items: [(Tab, String)] = [(.posts, "Posts · \(tiles.count)"), (.plans, "Plans · \(plans.count)"), (.trips, "Travel"), (.reviews, "Reviews"), (.badges, "Badges")]
        if let l = profile?.listings, !l.isEmpty { items.append((.listings, "Listings · \(l.count)")) }
        return items
    }

    private func header(_ p: ProfileResponse) -> some View {
        HStack(spacing: 14) {
            if isMe { MyStoryAvatar(user: p.user.lite, size: 68) } else { StatusAvatar(user: p.user.lite, size: 68) }
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(p.user.name).pcFont(.title1).foregroundStyle(Pc.ink).lineLimit(1)
                    if p.user.isIdVerified { VerifiedBadge() }
                    if p.user.isHost { PcTag(text: "Host", style: .host) }
                }
                Text("@\(p.user.username)").pcFont(.small).foregroundStyle(Pc.ink2)
            }
            Spacer()
            if !isMe {
                Menu {
                    Button("Report profile", systemImage: "flag") { report = ReportTarget(type: "user", id: p.user.id, name: p.user.name) }
                    Button("Block", systemImage: "hand.raised", role: .destructive) { confirmBlock = true }
                } label: {
                    Image(systemName: "ellipsis").frame(width: PcTokens.touch, height: PcTokens.touch).foregroundStyle(Pc.ink)
                }
                .accessibilityLabel("More")
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    private func actions(_ p: ProfileResponse) -> some View {
        HStack(spacing: 10) {
            if isMe {
                Button("Edit profile") { router.push(.editProfile) }.buttonStyle(.pc(.outline, fullWidth: true, compact: true))
                // The + on your photo adds a story.
                Button("Invite friends") { router.push(.referrals) }
                    .buttonStyle(.pc(.accent, fullWidth: true, compact: true))
                if session.me?.user.isHost == true || app.flags.hostOffersEnabled {
                    Button("Hosting") { router.push(.hostHub) }.buttonStyle(.pc(.outline, fullWidth: true, compact: true))
                }
            } else {
                let following = p.isFollowing
                Button(following ? "Following" : p.followsYou == true ? "Follow back" : "Follow") {
                    app.requireSignIn("Sign in to follow") { Task { await app.profiles.setFollow(username, on: !following) } }
                }
                .buttonStyle(.pc(following ? .outline : .primary, fullWidth: true, compact: true))
                Button(opening ? "Opening…" : "Message") {
                    app.requireSignIn("Sign in to message") {
                        opening = true
                        Task {
                            if let room = await app.chat.directChat(with: p.user.id) { router.push(.chat(roomId: room, title: p.user.name)) }
                            opening = false
                        }
                    }
                }
                .buttonStyle(.pc(.outline, fullWidth: true, compact: true))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    @ViewBuilder private var postsGrid: some View {
        if tiles.isEmpty {
            EmptyState(symbol: "square.grid.2x2", title: "No posts yet", message: isMe ? "Share a story from a trip or ask the Tribe something." : "Nothing shared yet.")
        } else {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
                ForEach(tiles) { p in
                    Button { if !p.isLocal { router.push(.post(id: p.id)) } } label: { tile(p) }.buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
    }

    private func tile(_ p: Post) -> some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let m = p.media.first {
                    PcAsyncImage(media: m)
                } else {
                    ZStack(alignment: .topLeading) {
                        Rectangle().fill(Pc.raised)
                        Text(p.displayTitle).pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink).lineLimit(5).padding(8)
                    }
                }
            }
            .overlay(alignment: .bottomLeading) {
                HStack(spacing: 4) {
                    Text(p.kind.label.uppercased()).font(.system(size: 10, weight: .semibold)).foregroundStyle(Pc.ink)
                    if let s = app.tribe.local[p.id]?.state { Text("· \(s)").font(.system(size: 10, weight: .semibold)).foregroundStyle(Pc.ink) }
                }
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background(Capsule().fill(Pc.raised.opacity(0.9)))
                .padding(6)
            }
            .clipShape(Pc.shape(Pc.imageRadius))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(p.kind.label): \(p.displayTitle)")
    }

    private func planRow(_ p: Post) -> some View {
        Button { if !p.isLocal { router.push(.post(id: p.id)) } } label: {
            HStack(spacing: 12) {
                MiniArc(counts: SeatCounts(plan: p), womenOnly: p.audience == .women)
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.displayTitle).font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.ink)
                    Text("Plan · \(p.memberCount) of \(p.spotsTotal ?? p.seats.count) · \(p.openSpots) spots open").pcFont(.small).foregroundStyle(Pc.ink2)
                    if let s = app.tribe.local[p.id]?.state { Text(s == "held" ? "Held for review" : s.capitalized).pcFont(.small, weight: .semibold).foregroundStyle(Pc.goldInk) }
                }
                Spacer()
                Text(Fmt.range(p.startsOn, p.endsOn)).pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
            }
            .padding(14)
            .pcPencilled()
        }
        .buttonStyle(.pcPress)
    }

    @ViewBuilder private var plansList: some View {
        if plans.isEmpty { EmptyState(symbol: "person.2", title: "No plans", message: "Plans are informal trips and meetups people can ask to join.") }
        VStack(spacing: 10) { ForEach(plans) { planRow($0) } }.padding(16)
    }

    private var ownLinks: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: 8)
            linkRow("Travel buddies", subtitle: "People going where you're going", icon: "person.2.wave.2") { router.push(.buddies) }
            linkRow("Offers", subtitle: "Promo codes and combos", icon: "bolt") { router.push(.offers) }
            linkRow("Leaderboard", subtitle: "Points from stories and trips", icon: "trophy") { router.push(.leaderboard) }
            linkRow("Story archive", subtitle: "Stories you shared, kept on this phone", icon: "archivebox") { router.push(.storyArchive) }
            linkRow("Settings", subtitle: "Landing tab, notifications, privacy", icon: "gearshape") { router.push(.settings) }
        }
    }

    private func linkRow(_ title: String, subtitle: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 15)).frame(width: 28).foregroundStyle(Pc.ink)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                    Text(subtitle).pcFont(.small).foregroundStyle(Pc.ink2)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Pc.ink2)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
            .pcCard()
            .padding(.horizontal, 20)
            .padding(.top, 10)
        }
        .buttonStyle(.plain)
    }
}

extension ExploreCategory {
    /// Category for a TripLite `kind` ("stay", "activity", "rental", else trips).
    init(kind: String?) {
        switch kind {
        case "stay": self = .stays
        case "activity": self = .activities
        case "rental": self = .rentals
        default: self = .trips
        }
    }
}
