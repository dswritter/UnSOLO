import SwiftUI

struct PostDetailView: View {
    let postId: String
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var showJoin = false
    @State private var report: ReportTarget?
    @State private var confirmBlock: UserLite?
    @State private var replyTo: Comment?
    @State private var draft = ""
    @State private var confirmWithdraw = false
    @State private var confirmCancel = false
    @FocusState private var composerFocused: Bool

    private var post: Post? { app.tribe.post(postId) }

    var body: some View {
        Group {
            if let post {
                content(post)
            } else if case .failed(let m) = app.tribe.detailState[postId] {
                EmptyState(symbol: "exclamationmark.triangle", title: "Not available", message: m)
            } else {
                ProgressView().tint(Pc.ink).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .pcScreen()
        .task {
            app.tribe.loadComments(postId)
            await app.tribe.refreshPost(postId)
            await app.analytics.track("screen.view", screen: "post_detail")
            if router.pendingJoinPostId == postId {
                router.pendingJoinPostId = nil
                if post?.viewer?.membership != .requested { showJoin = true }
            }
        }
        .sheet(isPresented: $showJoin) {
            if let post { JoinRequestSheet(post: post).presentationDetents([.medium, .large]) }
        }
        .sheet(item: $report) { target in ReportSheet(target: target).presentationDetents([.large]) }
        .confirmationDialog("Block \(confirmBlock?.firstName ?? "")?", isPresented: Binding(get: { confirmBlock != nil }, set: { if !$0 { confirmBlock = nil } }), titleVisibility: .visible) {
            Button("Block", role: .destructive) {
                if let u = confirmBlock { app.tribe.block(userId: u.id); dismiss() }
            }
        } message: {
            Text("You won't see their posts, comments or messages. They aren't told.")
        }
    }

    @ViewBuilder private func content(_ post: Post) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    switch post.kind {
                    case .plan: planHeader(post)
                    case .story: storyHeader(post)
                    case .ask: askHeader(post)
                    }
                    comments(post).id("comments")
                    if post.kind == .plan { inlineComposer(post).padding(16) }
                    Color.clear.frame(height: 20)
                }
            }
            .ignoresSafeArea(edges: post.kind == .story && !post.media.isEmpty ? .top : [])
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await app.tribe.refreshPost(postId) }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if post.kind == .plan { planBar(post) } else { commentBar(post) }
            }
            .onChange(of: replyTo) { _, c in if c != nil { withAnimation { proxy.scrollTo("comments", anchor: .top) } } }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(post.kind == .story && !post.media.isEmpty ? .hidden : .visible, for: .navigationBar)
        .toolbarBackground(Pc.paper, for: .navigationBar)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                ShareLink(item: DeepLink.post(id: post.id).webURL, subject: Text(post.displayTitle), message: Text(shareText(post))) {
                    Image(systemName: "square.and.arrow.up")
                }
                .simultaneousGesture(TapGesture().onEnded { Task { await app.analytics.track("share.plan", props: ["channel": "system"]) } })
                .accessibilityLabel("Share")
                moreMenu(post)
            }
        }
    }

    private func shareText(_ post: Post) -> String {
        post.kind == .plan ? "\(post.author.firstName) needs \(post.openSpots) for \(post.place?.name ?? post.displayTitle) on UnSOLO" : post.displayTitle
    }

    private func moreMenu(_ post: Post) -> some View {
        Menu {
            if post.viewer?.isAuthor == true {
                if post.kind == .plan && post.status == .live {
                    Button("Cancel plan", systemImage: "xmark.circle", role: .destructive) { confirmCancel = true }
                }
                Button("Delete post", systemImage: "trash", role: .destructive) { app.tribe.delete(post.id); dismiss() }
            } else {
                Button("Report post", systemImage: "flag") {
                    app.requireSignIn("Sign in to report") { report = ReportTarget(type: "post", id: post.id, name: post.displayTitle) }
                }
                Button("Block \(post.author.firstName)", systemImage: "hand.raised", role: .destructive) {
                    app.requireSignIn("Sign in to block") { confirmBlock = post.author }
                }
            }
        } label: {
            Image(systemName: "flag").accessibilityLabel("Report or block")
        }
        .confirmationDialog("Cancel this plan?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Cancel plan", role: .destructive) { app.tribe.cancelPlan(post.id) }
        } message: { Text("Everyone in it gets a notification.") }
    }

    // MARK: Plan

    @ViewBuilder private func planHeader(_ post: Post) -> some View {
        let v = post.viewer
        VStack(alignment: .leading, spacing: 12) {
            CommunityPlanLabel()
            if post.status == .cancelled { PcTag(text: "Cancelled", style: .waitlist) }
            Text(post.displayTitle).pcFont(.display).foregroundStyle(Pc.ink).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                Button { router.push(.profile(username: post.author.username)) } label: { Avatar(user: post.author, size: 44) }.buttonStyle(.plain)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(post.author.name).pcFont(.bodyStrong).foregroundStyle(Pc.ink).lineLimit(1)
                        if post.author.isIdVerified { VerifiedBadge() }
                    }
                    HStack(spacing: 6) {
                        PcTag(text: "Organiser", style: .organiser)
                        Text("Posted \(Fmt.relative(post.createdAt)) ago").pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                }
                Spacer()
                if v?.isAuthor != true {
                    Button("Profile") { router.push(.profile(username: post.author.username)) }.buttonStyle(.pc(.quiet, compact: true))
                }
            }
            FactsRow(facts: planFacts(post))
            let seats = SeatBuilder.planSeats(post)
            HStack(alignment: .firstTextBaseline) {
                Text("Who's in").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                Text("· \(post.memberCount) of \(post.spotsTotal ?? post.memberCount)").pcFont(.small).foregroundStyle(Pc.ink2)
                Spacer()
                Text("\(post.openSpots) spot\(post.openSpots == 1 ? "" : "s") open").pcFont(.small).foregroundStyle(Pc.ink2)
            }
            SeatRow(seats: seats, cellSize: PcTokens.seat, spacing: 8, maxCells: 12)
            if v?.membership == .requested {
                HStack(spacing: 8) {
                    Image(systemName: "clock")
                    Text("Your seat is requested. \(post.author.firstName) usually replies within a day; requests expire after 72h.")
                }
                .pcFont(.small).foregroundStyle(Pc.ink)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Pc.goldBg, in: Pc.shape(Pc.radius))
            }
            Text(post.body).pcFont(.body).foregroundStyle(Pc.ink).fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 4) {
                if let cost = post.estCostText { Text(cost + ". UnSOLO doesn't take payments for plans.").pcFont(.small).foregroundStyle(Pc.ink2) }
                if let meeting = post.meetingPoint {
                    Label(meeting, systemImage: "mappin").pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink)
                } else {
                    Text("Meeting point is shared once you're approved. Meet first in a public place.").pcFont(.small).foregroundStyle(Pc.ink2)
                }
            }
            if v?.isAuthor == true { organiserTools(post) }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    @ViewBuilder private func organiserTools(_ post: Post) -> some View {
        let requests = (app.tribe.requests[post.id] ?? []).filter { $0.state == .requested }
        VStack(alignment: .leading, spacing: 10) {
            if !requests.isEmpty {
                SectionHeader(title: "Requests", trailing: "\(requests.count)")
                ForEach(requests, id: \.user.id) { r in JoinRequestRow(postId: post.id, request: r) }
            }
            let offers = app.tribe.offers[post.id] ?? []
            if !offers.isEmpty {
                Button { router.push(.offerReview(postId: post.id)) } label: {
                    HStack {
                        PcTag(text: "Host", style: .host)
                        Text("\(offers.count) host offer\(offers.count == 1 ? "" : "s") to run this plan").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .padding(14)
                    .frame(minHeight: PcTokens.touch)
                    .pcCard()
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 6)
    }

    private func planBar(_ post: Post) -> some View {
        let v = post.viewer
        let others = SeatBuilder.planSeats(post).compactMap { s -> String? in
            guard [.organiser, .member].contains(s.state) else { return nil }
            return s.user?.firstName
        }
        let names = others.isEmpty ? post.author.firstName : ListFormatter.localizedString(byJoining: Array(others.prefix(2)))
        return BottomActionBar {
            if v?.isAuthor == true {
                Text("Your plan").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                Text("\(app.tribe.requests[post.id]?.filter { $0.state == .requested }.count ?? 0) requests waiting").pcFont(.small).foregroundStyle(Pc.ink2)
            } else if v?.membership == .requested {
                Text("Request sent").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                Text("Waiting for \(post.author.firstName) · expires in 72h").pcFont(.small).foregroundStyle(Pc.ink2)
            } else if v?.membership == .approved {
                Text("You're in").pcFont(.bodyStrong).foregroundStyle(Pc.green)
                Text("Say hi in the plan chat").pcFont(.small).foregroundStyle(Pc.ink2)
            } else {
                Text("Join \(names)").pcFont(.bodyStrong).foregroundStyle(Pc.ink).lineLimit(1)
                Text("\(post.author.firstName) approves each request · intro needed").pcFont(.small).foregroundStyle(Pc.ink2)
            }
        } trailing: {
            if v?.isAuthor == true {
                ShareLink(item: DeepLink.post(id: post.id).webURL, message: Text(shareText(post))) { Text("Share plan") }
                    .buttonStyle(.pcOutline)
            } else if v?.membership == .requested {
                Button("Withdraw") { confirmWithdraw = true }
                    .buttonStyle(.pcOutline)
                    .confirmationDialog("Withdraw your request?", isPresented: $confirmWithdraw, titleVisibility: .visible) {
                        Button("Withdraw request", role: .destructive) { app.tribe.withdraw(post.id) }
                    }
            } else if v?.membership == .approved {
                Button("Plan chat") { router.push(.messages) }.buttonStyle(.pcOutline)
            } else if let reason = v?.joinBlockedReason, reason != .phoneRequired {
                Text(reason.message).pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink2).multilineTextAlignment(.trailing)
            } else if post.openSpots == 0 || post.status != .live {
                Text(post.status == .cancelled ? "Cancelled" : "Full").pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink2)
            } else {
                Button("Ask to join") { app.requireVerified("Sign in to ask to join") { showJoin = true } }
                    .buttonStyle(.pcOutline)
            }
        }
    }

    // MARK: Story

    @ViewBuilder private func storyHeader(_ post: Post) -> some View {
        if !post.media.isEmpty { StoryPager(media: post.media) }
        VStack(alignment: .leading, spacing: 12) {
            AuthorRow(post: post, subtitle: post.trip.map { "\($0.title) · \(Fmt.relative(post.createdAt))" })
            Text(post.displayTitle).pcFont(.title1).foregroundStyle(Pc.ink).fixedSize(horizontal: false, vertical: true)
            Text(post.body).pcFont(.body).foregroundStyle(Pc.ink).fixedSize(horizontal: false, vertical: true)
            reactionButtons(post)
            if let trip = post.trip { LinkedTripCard(trip: trip) }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
    }

    private func reactionButtons(_ post: Post) -> some View {
        HStack(spacing: 8) {
            ForEach(ReactionKind.allCases, id: \.self) { kind in
                let on = post.myReactions.contains(kind)
                Button { app.requireVerified("Sign in to react") { app.tribe.toggleReaction(post.id, kind) } } label: {
                    HStack(spacing: 4) {
                        Image(systemName: on ? kind.symbol + ".fill" : kind.symbol)
                        Text(kind.label).pcFont(.small, weight: .semibold).lineLimit(1).minimumScaleFactor(0.7)
                        Text("\(post.reactions[kind])").pcFont(.code, weight: .regular).lineLimit(1).fixedSize()
                    }
                    .foregroundStyle(Pc.ink)
                    .padding(.horizontal, 6)
                    .frame(maxWidth: .infinity, minHeight: PcTokens.touch)
                    .background(Capsule().fill(on ? Pc.ink.opacity(0.14) : Pc.tonal))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(kind.label), \(post.reactions[kind])")
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }

    // MARK: Ask

    @ViewBuilder private func askHeader(_ post: Post) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            AuthorRow(post: post)
            Text(post.displayTitle).pcFont(.title1).foregroundStyle(Pc.ink).fixedSize(horizontal: false, vertical: true)
            if post.title != nil { Text(post.body).pcFont(.body).foregroundStyle(Pc.ink).fixedSize(horizontal: false, vertical: true) }
            if let poll = post.poll { PollView(post: post, poll: poll) }
            HStack {
                ReactionToggle(post: post, kind: .helpful, showLabel: true)
                Spacer()
            }
            Text("No links or prices in answers. Hosts answer as people, with their HOST tag.").pcFont(.small).foregroundStyle(Pc.ink2)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
    }

    // MARK: Comments

    @ViewBuilder private func comments(_ post: Post) -> some View {
        let list = app.tribe.comments[post.id] ?? []
        let states = app.tribe.commentStates[post.id] ?? [:]
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(post.kind == .ask ? "Answers" : "Comments").pcFont(.title2).foregroundStyle(Pc.ink).accessibilityAddTraits(.isHeader)
                Spacer()
                Text("\(post.commentCount)").pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
            HairlineRule()
            if list.isEmpty {
                Text(post.kind == .ask ? "No answers yet. Know the place? Help out." : "No comments yet.")
                    .pcFont(.small).foregroundStyle(Pc.ink2).padding(16)
            }
            ForEach(list) { c in
                CommentRow(comment: c, post: post, state: states[c.id], onReply: { replyTo = c; composerFocused = true },
                           onReport: { report = ReportTarget(type: "comment", id: c.id, name: "comment by \(c.author.firstName)") })
                ForEach(c.replies) { r in
                    CommentRow(comment: r, post: post, state: states[r.id], isReply: true, onReply: nil,
                               onReport: { report = ReportTarget(type: "comment", id: r.id, name: "reply by \(r.author.firstName)") })
                }
                HairlineRule().padding(.leading, 64)
            }
        }
        .padding(.top, 8)
    }

    private func inlineComposer(_ post: Post) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let replyTo { replyChip(replyTo) }
            HStack(spacing: 8) {
                TextField(replyTo == nil ? "Ask a question about this plan" : "Reply to \(replyTo!.author.firstName)", text: $draft, axis: .vertical)
                    .pcFont(.body)
                    .lineLimit(1...4)
                    .focused($composerFocused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .pcField()
                Button { sendComment(post) } label: {
                    Image(systemName: "paperplane").font(.system(size: 17, weight: .semibold)).foregroundStyle(Pc.onInk)
                        .frame(width: PcTokens.touch, height: PcTokens.touch).background(Pc.ink, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send comment")
            }
        }
    }

    private func commentBar(_ post: Post) -> some View {
        VStack(spacing: 6) {
            if let replyTo { replyChip(replyTo) }
            HStack(spacing: 10) {
                Avatar(user: session.user, size: 36)
                TextField(post.kind == .ask ? "Add an answer" : "Add a comment", text: $draft, axis: .vertical)
                    .pcFont(.body)
                    .lineLimit(1...4)
                    .focused($composerFocused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .pcField()
                if !draft.isEmpty {
                    Button { sendComment(post) } label: {
                        Image(systemName: "paperplane").font(.system(size: 17, weight: .semibold)).foregroundStyle(Pc.onInk)
                            .frame(width: PcTokens.touch, height: PcTokens.touch).background(Pc.ink, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Send")
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
        .background(Pc.paper)
        .overlay(alignment: .top) { HairlineRule() }
    }

    private func replyChip(_ c: Comment) -> some View {
        HStack {
            Text("Replying to \(c.author.firstName)").pcFont(.small).foregroundStyle(Pc.ink2)
            Spacer()
            Button { replyTo = nil } label: { Image(systemName: "xmark").font(.system(size: 12, weight: .bold)) }
                .buttonStyle(.plain).frame(width: 32, height: 32).accessibilityLabel("Cancel reply")
        }
    }

    private func sendComment(_ post: Post) {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        app.requireVerified("Sign in to comment") {
            app.tribe.addComment(post.id, body: text, parentId: replyTo?.id)
            draft = ""
            replyTo = nil
            composerFocused = false
        }
    }
}

struct StoryPager: View {
    let media: [Media]
    @State private var page = 0
    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TabView(selection: $page) {
                ForEach(Array(media.enumerated()), id: \.offset) { i, m in PcAsyncImage(media: m).tag(i) }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: 320)
            Text("\(page + 1) / \(media.count)")
                .font(.system(size: 12, weight: .semibold).monospacedDigit()).foregroundStyle(.white)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Capsule().fill(.black.opacity(0.45)))
                .padding(14)
        }
    }
}

struct CommentRow: View {
    let comment: Comment
    let post: Post
    var state: String?
    var isReply = false
    var onReply: (() -> Void)?
    var onReport: () -> Void
    @Environment(Router.self) private var router

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if isReply { Capsule().fill(Pc.rule).frame(width: 2).padding(.leading, 30) }
            Avatar(user: comment.author, size: 34)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(comment.author.firstName).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                    if comment.author.id == post.author.id { PcTag(text: post.kind == .plan ? "Organiser" : "Author", style: post.kind == .plan ? .organiser : .author) }
                    if comment.author.isHost { PcTag(text: "Host", style: .host) }
                    Text(comment.id.hasPrefix(LocalID.prefix) ? "now" : Fmt.relative(comment.createdAt)).pcFont(.small).foregroundStyle(Pc.ink2)
                }
                Text(comment.body).pcFont(.body).foregroundStyle(Pc.ink).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 16) {
                    if state == "sending" { Text("Sending…").pcFont(.small).foregroundStyle(Pc.ink2) }
                    if state == "failed" { Text("Not sent").pcFont(.small, weight: .semibold).foregroundStyle(Pc.red) }
                    if let onReply, state == nil {
                        Button("Reply", action: onReply).buttonStyle(.plain).pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink2)
                            .frame(minHeight: 32)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .opacity(state == "sending" ? 0.6 : 1)
        .contextMenu {
            Button("Report comment", systemImage: "flag", action: onReport)
            Button("View profile", systemImage: "person") { router.push(.profile(username: comment.author.username)) }
        }
        .accessibilityElement(children: .combine)
    }
}

struct JoinRequestRow: View {
    let postId: String
    let request: JoinRequest
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Avatar(user: request.user.lite, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(request.user.name).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                        if request.user.isIdVerified { VerifiedBadge() }
                    }
                    Text(stats).pcFont(.small).foregroundStyle(Pc.ink2)
                }
            }
            Text("“\(request.intro)”").pcFont(.small).foregroundStyle(Pc.ink).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button("Decline") { app.tribe.decide(postId: postId, userId: request.user.id, approve: false) }
                    .buttonStyle(.pc(.outline, fullWidth: true))
                Button("Approve") { app.tribe.decide(postId: postId, userId: request.user.id, approve: true) }
                    .buttonStyle(.pc(.primary, fullWidth: true))
            }
        }
        .padding(12)
        .ruledFrame(color: Pc.rule2)
    }

    private var stats: String {
        var parts: [String] = []
        if let t = request.user.tripsCount { parts.append("\(t) trip\(t == 1 ? "" : "s")") }
        if let r = request.user.reviewsAvg { parts.append("★ \(String(format: "%.1f", r))") }
        if let m = request.user.mutuals, m > 0 { parts.append("\(m) mutual") }
        if request.user.isIdVerified { parts.append("verified") }
        return parts.joined(separator: " · ")
    }
}

/// Ask to join: a required intro (10–500 characters). On send the seat turns "requested" immediately.
struct JoinRequestSheet: View {
    let post: Post
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var intro = ""
    @FocusState private var focused: Bool

    private var count: Int { intro.trimmingCharacters(in: .whitespacesAndNewlines).count }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Ask to join").pcFont(.title1).foregroundStyle(Pc.ink).padding(.top, 20)
            Text("Say a little about yourself. \(post.author.firstName) sees your trips and reviews with your intro, and approves each request.")
                .pcFont(.small).foregroundStyle(Pc.ink2)
            TextEditor(text: $intro)
                .focused($focused)
                .pcFont(.body)
                .scrollContentBackground(.hidden)
                .padding(8)
                .frame(minHeight: 120)
                .pcField(focused: focused)
                .accessibilityLabel("Your intro")
            HStack {
                Text(count < 10 ? "At least 10 characters" : "Requests expire after 72h").pcFont(.small).foregroundStyle(Pc.ink2)
                Spacer()
                Text("\(count)/500").pcFont(.code, weight: .regular).foregroundStyle(count > 500 ? Pc.red : Pc.ink2)
            }
            Spacer()
            Button("Send request") {
                app.tribe.join(post.id, intro: intro.trimmingCharacters(in: .whitespacesAndNewlines))
                dismiss()
            }
            .buttonStyle(.pc(.primary, fullWidth: true))
            .disabled(!(10...500).contains(count))
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
        .pcScreen()
        .onAppear { focused = true }
    }
}

struct ReportTarget: Identifiable {
    let type: String
    let id: String
    let name: String
}

struct ReportSheet: View {
    let target: ReportTarget
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var reason: String?
    @State private var details = ""

    static let reasons: [(String, String)] = [
        ("spam", "Spam"), ("scam_money", "Scam or asking for money"), ("harassment", "Harassment"),
        ("unsafe_meetup", "Unsafe meetup"), ("fake_profile", "Fake profile"), ("hate", "Hate"),
        ("sexual", "Sexual content"), ("other", "Something else"),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Why are you reporting this \(target.type)?").pcFont(.title2).foregroundStyle(Pc.ink).padding(16)
                    HairlineRule()
                    ForEach(Self.reasons, id: \.0) { code, label in
                        Button { reason = code } label: {
                            HStack {
                                Text(label).pcFont(.body).foregroundStyle(Pc.ink)
                                Spacer()
                                Image(systemName: reason == code ? "largecircle.fill.circle" : "circle").foregroundStyle(Pc.ink)
                            }
                            .padding(.horizontal, 20)
                            .frame(minHeight: 52)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(reason == code ? .isSelected : [])
                        HairlineRule()
                    }
                    FormRow(label: "Details (optional)") {
                        TextField("What happened?", text: $details, axis: .vertical).pcFont(.body).lineLimit(2...5)
                    }
                    Text("Safety reports (harassment, unsafe meetups, sexual content) are reviewed within 2 hours. You can also block from the menu.")
                        .pcFont(.small).foregroundStyle(Pc.ink2).padding(16)
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button("Send report") {
                    if let reason { app.tribe.report(targetType: target.type, targetId: target.id, reason: reason, details: details.isEmpty ? nil : details) }
                    dismiss()
                }
                .buttonStyle(.pc(.primary, fullWidth: true))
                .disabled(reason == nil)
                .padding(16)
                .background(Pc.paper)
            }
            .pcScreen()
            .navigationTitle("Report")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
