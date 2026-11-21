import SwiftUI

struct YouView: View {
    @Environment(SessionStore.self) private var session
    @Environment(Router.self) private var router

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                AppHeader(title: "You") {
                    Button { router.push(.settings) } label: {
                        Image(systemName: "gearshape").font(.system(size: 16.5)).foregroundStyle(Pc.ink)
                            .frame(width: PcTokens.touch, height: PcTokens.touch)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Settings")
                }
                if let me = session.me {
                    ProfileContent(username: me.user.username, isMe: true)
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Browse as a guest, or sign in to post, join plans and see your trips.").pcFont(.body).foregroundStyle(Pc.ink)
                        Button("Sign in or create an account") { router.authSheet = true }.buttonStyle(.pc(.primary, fullWidth: true))
                        Button("Settings") { router.push(.settings) }.buttonStyle(.pc(.outline, fullWidth: true))
                    }
                    .padding(16)
                }
            }
        }
        .pcScreen()
        .toolbar(.hidden, for: .navigationBar)
        .task { if session.isSignedIn { await session.refreshMe() } }
    }
}

struct ProfileView: View {
    let username: String
    var body: some View {
        ScrollView { ProfileContent(username: username, isMe: false) }
            .pcScreen()
            .pcNavigationBar()
    }
}

struct ProfileContent: View {
    enum Tab: Hashable { case posts, plans, trips }
    let username: String
    let isMe: Bool
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @State private var tab: Tab = .posts
    @State private var report: ReportTarget?
    @State private var confirmBlock = false
    @State private var opening = false

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

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let p = profile {
                header(p)
                stats(p)
                ChipTabs(items: [(.posts, "Posts"), (.plans, "Plans · \(plans.count)"), (.trips, "Trips")], selection: $tab)
                    .padding(.top, 14)
                switch tab {
                case .posts: postsGrid
                case .plans: plansList
                case .trips: tripsList(p)
                }
                if isMe { ownLinks }
            } else if case .failed(let m) = app.profiles.state[username] {
                EmptyState(symbol: "person.crop.circle.badge.exclamationmark", title: "Profile unavailable", message: m)
            } else {
                ProgressView().tint(Pc.ink2).frame(maxWidth: .infinity).padding(40)
            }
        }
        .task {
            await app.profiles.refresh(username)
            await app.analytics.track("screen.view", screen: "you")
        }
        .sheet(item: $report) { ReportSheet(target: $0) }
        .confirmationDialog("Block \(profile?.user.name ?? "")?", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("Block", role: .destructive) { if let id = profile?.user.id { app.tribe.block(userId: id) } }
        } message: { Text("You won't see their posts, comments or messages.") }
    }

    private func header(_ p: ProfileResponse) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                Avatar(user: p.user.lite, size: 64)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(p.user.name).pcFont(.title1).foregroundStyle(Pc.ink)
                        if p.user.isIdVerified { VerifiedBadge() }
                        if p.user.isHost { PcTag(text: "Host", style: .host) }
                    }
                    Text(["@\(p.user.username)", p.user.homeCity].compactMap { $0 }.joined(separator: " · ")).pcFont(.small).foregroundStyle(Pc.ink2)
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
            if let bio = p.user.bio, !bio.isEmpty { Text(bio).pcFont(.body).foregroundStyle(Pc.ink) }
            if !isMe {
                HStack(spacing: 10) {
                    Button(p.isFollowing ? "Following" : "Follow") {}
                        .buttonStyle(.pc(p.isFollowing ? .outline : .primary, fullWidth: true))
                        .disabled(true)
                        .accessibilityHint("Following isn't in the API contract yet")
                    Button(opening ? "Opening…" : "Message") {
                        app.requireSignIn("Sign in to message") {
                            opening = true
                            Task {
                                if let room = await app.chat.directChat(with: p.user.id) { router.push(.chat(roomId: room, title: p.user.name)) }
                                opening = false
                            }
                        }
                    }
                    .buttonStyle(.pc(.outline, fullWidth: true))
                }
            }
            if let open = p.openPlan, !isMe {
                Button { router.push(.post(id: open.id)) } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(open.displayTitle).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                            Text("Plan · \(open.memberCount) of \(open.spotsTotal ?? 0) · \(open.openSpots) spots open").pcFont(.small).foregroundStyle(Pc.ink2)
                        }
                        Spacer()
                        Text(Fmt.range(open.startsOn, open.endsOn)).pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
                    }
                    .padding(14)
                    .pcPencilled()
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func stats(_ p: ProfileResponse) -> some View {
        HStack(spacing: 0) {
            stat("\(p.user.tripsCount)", "trips")
            stat("\(posts.count)", "posts")
            stat("\(p.user.followers)", "followers")
        }
        .pcCard()
        .padding(.horizontal, 20)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(PcFont.rounded(22)).foregroundStyle(Pc.ink)
            Text(label).pcFont(.small).foregroundStyle(Pc.ink2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var postsGrid: some View {
        if posts.isEmpty {
            EmptyState(symbol: "square.grid.2x2", title: isMe ? "Your posts show up here" : "No posts yet")
        } else {
            if let plan = plans.first, tab == .posts {
                planRow(plan).padding(.horizontal, 20).padding(.top, 12)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(posts.filter { $0.kind != .plan }) { p in
                    Button { if !p.isLocal { router.push(.post(id: p.id)) } } label: { tile(p) }.buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
        }
    }

    private func tile(_ p: Post) -> some View {
        ZStack(alignment: .bottomLeading) {
            if let m = p.media.first {
                PcAsyncImage(media: m)
            } else {
                Rectangle().fill(Pc.raised)
                Text(p.displayTitle).pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink).padding(8).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
            HStack(spacing: 4) {
                Text(p.kind.label.uppercased()).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(.white)
                if let s = app.tribe.local[p.id]?.state { Text("· \(s)").font(.system(size: 10.5, weight: .semibold)).foregroundStyle(.white) }
            }
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(.black.opacity(0.5)))
            .padding(6)
        }
        .aspectRatio(1, contentMode: .fill)
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
                    Text("Plan · \(p.memberCount) of \(p.spotsTotal ?? 0) · \(p.openSpots) spots open").pcFont(.small).foregroundStyle(Pc.ink2)
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
        if plans.isEmpty { EmptyState(symbol: "person.2", title: "No plans") }
        VStack(spacing: 10) { ForEach(plans) { planRow($0) } }.padding(16)
    }

    @ViewBuilder private func tripsList(_ p: ProfileResponse) -> some View {
        if isMe {
            let my = app.trips.myTrips
            VStack(spacing: 0) {
                ForEach(my.upcoming + my.past) { b in PastTripRow(booking: b) }
            }
            if my.upcoming.isEmpty && my.past.isEmpty { EmptyState(symbol: "ticket", title: "No trips yet") }
        } else {
            Text("\(p.user.tripsCount) trips with UnSOLO").pcFont(.body).foregroundStyle(Pc.ink).padding(16)
        }
    }

    private var ownLinks: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: 8)
            if session.me?.user.isHost == true {
                linkRow("Hosting", subtitle: "Plans looking for a host, your departures", icon: "tent") { router.push(.hostHub) }
            }
            linkRow("Settings", subtitle: "Landing tab, notifications, privacy", icon: "gearshape") { router.push(.settings) }
        }
        .padding(.bottom, 24)
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
