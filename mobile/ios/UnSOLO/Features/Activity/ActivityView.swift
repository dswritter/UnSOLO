import SwiftUI

struct ActivityView: View {
    enum Segment: Hashable { case all, requests, only(NotificationCategory) }
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var segment: Segment = .all
    @State private var askOffers = false

    /// Same order as the web: All, Plans, Replies, Trips, Tags, Offers, Account (Requests sits after All on the phone).
    private var segments: [(Segment, String)] {
        [(.all, "All"), (.requests, pending.isEmpty ? "Requests" : "Requests · \(pending.count)"),
         (.only(.plans), "Plans"), (.only(.replies), "Replies"), (.only(.trips), "Trips"), (.only(.tags), "Tags"),
         (.only(.marketing), "Offers"), (.only(.system), "Account")]
    }
    private var shown: [AppNotification] {
        guard case .only(let c) = segment else { return app.activity.items }
        return app.activity.items.filter { $0.category.matches(c) }
    }

    private var organised: [Post] { app.trips.organisedPlans }
    private var pending: [(Post, JoinRequest)] {
        organised.flatMap { p in (app.tribe.requests[p.id] ?? []).filter { $0.state == .requested }.map { (p, $0) } }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Text("Activity").pcFont(.display).foregroundStyle(Pc.ink).padding(.horizontal, 20).padding(.top, 4)
                ChipTabs(items: segments, selection: $segment)
                    .padding(.vertical, 8)
                if askOffers { OffersAskCard { askOffers = false }.padding(.horizontal, 14).padding(.bottom, 12) }
                if segment == .requests { requestsList } else { allList }
            }
        }
        .refreshable { await reload() }
        .pcScreen()
        .pcNavigationBar()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if app.activity.unread > 0 {
                    Button("Mark all read") { app.activity.markRead(nil) }.tint(Pc.ink)
                }
            }
        }
        .task {
            await reload()
            await checkOffersAsk()
            await app.analytics.track("screen.view", screen: "activity")
        }
    }

    /// Asked once per install, only while offers are off (fresh from the server, so a web opt-in counts).
    private func checkOffersAsk() async {
        guard app.session.isSignedIn, !OffersAsk.asked else { return }
        guard let prefs = try? await app.api.preferences(), !OffersAsk.asked else { return }
        app.session.adoptServerPreferences(prefs)
        askOffers = !app.session.preferences.notify.push.marketing
    }

    private func reload() async {
        await app.trips.refresh()
        await app.activity.refresh()
    }

    @ViewBuilder private var allList: some View {
        let list = shown
        if list.isEmpty {
            if segment == .all {
                EmptyState(symbol: "bell", title: "Nothing yet", message: "Join requests, replies, matches and host offers show up here.")
            } else {
                EmptyState(symbol: "bell", title: "Nothing here yet", message: "Pick All to see everything.")
            }
        }
        VStack(spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.element.id) { i, n in
                NotificationRow(notification: n, pendingForPlan: pendingFor(n), onReview: { segment = .requests })
                if i < list.count - 1 { HairlineRule().padding(.leading, 70) }
            }
        }
        .pcCard()
        .padding(.horizontal, 14)
    }

    private func pendingFor(_ n: AppNotification) -> [(Post, JoinRequest)] {
        guard n.isJoinRequest, n.inlineDecision == nil, case .post(let id)? = DeepLink.notificationRoute(n.link) else { return [] }
        return pending.filter { $0.0.id == id }
    }

    @ViewBuilder private var requestsList: some View {
        if pending.isEmpty {
            EmptyState(symbol: "person.badge.clock", title: "No requests waiting", message: "When someone asks to join your plan, you approve them here.")
        }
        ForEach(organised.filter { p in pending.contains { $0.0.id == p.id } }) { plan in
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(plan.displayTitle).pcFont(.title3).foregroundStyle(Pc.ink)
                    Spacer()
                    Text(Fmt.range(plan.startsOn, plan.endsOn)).pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
                }
                HStack(spacing: 12) {
                    SeatRing(seats: RingSeats.plan(plan), size: 56, plan: true, womenOnly: plan.audience == .women, dots: .none, centre: .user(plan.author))
                    SeatCaption(counts: SeatCounts(plan: plan), noun: "spots")
                }
                ForEach(pending.filter { $0.0.id == plan.id }, id: \.1.user.id) { _, r in JoinRequestRow(postId: plan.id, request: r) }
            }
            .padding(16)
            .pcPencilled()
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
    }
}

struct NotificationRow: View {
    let notification: AppNotification
    var pendingForPlan: [(Post, JoinRequest)] = []
    var onReview: () -> Void = {}
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle().fill(notification.isRead ? .clear : Pc.red).frame(width: 8, height: 8).padding(.top, 17)
                .accessibilityHidden(true)
            icon
            VStack(alignment: .leading, spacing: 4) {
                Text(notification.title).font(.system(size: 14, weight: notification.isRead ? .medium : .bold)).foregroundStyle(Pc.ink)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 4) {
                    if let body = notification.body { Text(body).lineLimit(2) }
                    Text("· \(Fmt.relative(notification.createdAt))")
                }
                .pcFont(.small).foregroundStyle(Pc.ink2)
                if let d = notification.inlineDecision {
                    inlineDecision(d)
                } else if !pendingForPlan.isEmpty {
                    HStack(spacing: 8) {
                        Button("Review", action: onReview).buttonStyle(.pc(.outline, fullWidth: true))
                        Button(pendingForPlan.count > 1 ? "Approve all" : "Approve") {
                            for (plan, r) in pendingForPlan { app.tribe.decide(postId: plan.id, userId: r.user.id, approve: true) }
                            app.activity.markRead([notification.id])
                        }
                        .buttonStyle(.pc(.primary, fullWidth: true))
                    }
                    .padding(.top, 4)
                } else if notification.type == "host_offer", case .post(let id)? = DeepLink.notificationRoute(notification.link) {
                    Button("See offer") {
                        app.activity.markRead([notification.id])
                        router.push(.offerReview(postId: id))
                    }
                    .buttonStyle(.pc(.outline, fullWidth: true))
                    .padding(.top, 4)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .onTapGesture { open() }
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Open") { open() }
    }

    /// Approve/Decline straight from the row: POST /posts/{postId}/requests/{actorId} { decision }.
    @ViewBuilder private func inlineDecision(_ d: (postId: String, userId: String)) -> some View {
        if let approved = app.activity.decisions[notification.id] {
            Label(approved ? "Approved" : "Declined", systemImage: approved ? "checkmark" : "xmark")
                .pcFont(.small, weight: .semibold)
                .foregroundStyle(approved ? Pc.ink : Pc.ink2)
                .padding(.top, 4)
        } else {
            HStack(spacing: 8) {
                Button("Decline") { app.activity.decide(notification, approve: false) }.buttonStyle(.pc(.outline, fullWidth: true))
                Button("Approve") { app.activity.decide(notification, approve: true) }.buttonStyle(.pc(.primary, fullWidth: true))
            }
            .padding(.top, 4)
        }
    }

    private func open() {
        app.activity.markRead([notification.id])
        // Only same-site paths are followed; anything else stays on Activity.
        if let route = DeepLink.notificationRoute(notification.link) { router.open(route) }
    }

    private var icon: some View {
        let symbol: String = switch notification.category {
        case .plans: notification.type == "match" ? "person.2" : "person.badge.plus"
        case .replies: "bubble.left"
        case .messages: "envelope"
        case .trips: "ticket"
        case .tags: "tag"
        case .marketing: "sparkles"
        case .system: "info.circle"
        }
        return Image(systemName: symbol).font(.system(size: 14.5, weight: .bold)).foregroundStyle(Pc.ink)
            .frame(width: 36, height: 36)
            .background(Circle().fill(Pc.tonal))
    }
}

/// The one-time "offers" question (key `offersAsked`; set by either answer).
enum OffersAsk {
    static let key = "offersAsked"
    static var asked: Bool { UserDefaults.standard.object(forKey: key) != nil }
    static func answer(_ yes: Bool) { UserDefaults.standard.set(yes ? "yes" : "no", forKey: key) }
}

struct OffersAskCard: View {
    let onDone: () -> Void
    @Environment(AppModel.self) private var app

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "sparkles").font(.system(size: 14.5, weight: .bold)).foregroundStyle(Pc.ink)
                .frame(width: 36, height: 36)
                .background(Circle().fill(Pc.tonal))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text("Want first dibs on deals?").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                Text("Price drops and offers on trips, a couple of times a month at most. Change it any time in Settings.")
                    .pcFont(.small).foregroundStyle(Pc.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    Button("Yes, send me offers") { answer(true) }.buttonStyle(.pc(.primary, fullWidth: true))
                    Button("Not now") { answer(false) }.buttonStyle(.pc(.outline)).fixedSize()
                }
                .padding(.top, 8)
            }
        }
        .padding(16)
        .pcCard()
    }

    private func answer(_ yes: Bool) {
        OffersAsk.answer(yes)
        onDone()
        guard yes else { return }
        // Same preference as the Settings toggle ("Offers and news"), so that stays in sync.
        let session = app.session
        var notify = session.preferences.notify
        notify.push.marketing = true
        session.updatePreferences(PreferencesPatch(notify: notify)) { $0.notify = notify }
        app.showToast("Done. We\u{2019}ll send the good deals only.")
    }
}
