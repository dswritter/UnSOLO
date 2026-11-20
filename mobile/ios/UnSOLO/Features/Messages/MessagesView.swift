import SwiftUI

/// Messages: Circles (trip and plan groups, with a mini seat ring as the avatar) · Direct · Requests.
struct MessagesView: View {
    enum Segment: Hashable { case circles, direct, requests }
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var segment: Segment = .circles

    private var circles: [ChatSummary] { app.chat.chats.filter { !$0.isRequest && $0.type != "direct" } }
    private var direct: [ChatSummary] { app.chat.chats.filter { !$0.isRequest && $0.type == "direct" } }
    private var requests: [ChatSummary] { app.chat.chats.filter(\.isRequest) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Text("Messages").pcFont(.display).foregroundStyle(Pc.ink).padding(.horizontal, 20).padding(.top, 4)
                    .accessibilityAddTraits(.isHeader)
                ChipTabs(items: [(.circles, "Circles · \(circles.count)"), (.direct, "Direct · \(direct.count)"),
                                 (.requests, requests.isEmpty ? "Requests" : "Requests · \(requests.count)")],
                         selection: $segment)
                    .padding(.vertical, 8)
                let list = segment == .circles ? circles : segment == .direct ? direct : requests
                if list.isEmpty {
                    EmptyState(symbol: "bubble.left.and.bubble.right", title: segment == .requests ? "No requests" : "No chats yet",
                               message: segment == .circles ? "Trip and plan circles open when you book or get approved." : nil)
                }
                VStack(spacing: 0) {
                    ForEach(list) { c in
                        Button { router.push(.chat(roomId: c.id, title: c.name)) } label: { ChatRow(chat: c) }
                            .buttonStyle(.pcPress)
                    }
                }
                .padding(.horizontal, 20)
                if segment == .requests {
                    Text("Requests come from people you don't follow. They won't know you've read them until you reply. You can also report or block.")
                        .pcFont(.small).foregroundStyle(Pc.ink2).padding(20)
                }
            }
        }
        .refreshable { await app.chat.refreshChats() }
        .pcScreen()
        .pcNavigationBar()
        .task {
            await app.chat.refreshChats()
            await app.trips.refresh()
            await app.analytics.track("screen.view", screen: "inbox")
        }
    }
}

/// What a group chat belongs to: a booked trip or a plan you're in.
struct ChatCircle {
    var trip: TripLite?
    var plan: Post?
    var travelDate: String?
    var past = false

    @MainActor
    static func resolve(_ chat: ChatSummary, app: AppModel) -> ChatCircle? {
        let my = app.trips.myTrips
        if chat.type == "trip" {
            if let b = my.upcoming.first(where: { $0.chatRoomId == chat.id }) { return ChatCircle(trip: b.trip, travelDate: b.travelDate) }
            if let b = my.past.first(where: { $0.chatRoomId == chat.id }) { return ChatCircle(trip: b.trip, travelDate: b.travelDate, past: true) }
            if let t = app.explore.lists.values.flatMap({ $0 }).first(where: { $0.title == chat.name }) { return ChatCircle(trip: t) }
        } else if chat.type != "direct" {
            if let p = (my.plans + my.requested).first(where: { chat.name.hasPrefix($0.displayTitle) }) {
                return ChatCircle(plan: app.tribe.posts[p.id] ?? p, past: p.status == .past)
            }
        }
        return nil
    }

    var subtitle: String? {
        if let trip {
            if past { return "Went · \(Fmt.dayMonth(travelDate ?? trip.nextDeparture))" }
            if let d = Fmt.daysUntil(travelDate ?? trip.nextDeparture), d >= 0 { return "Trip circle · \(d == 0 ? "today" : "in \(d) day\(d == 1 ? "" : "s")")" }
            return "Trip circle"
        }
        if let plan { return "Plan circle\(plan.audience == .women ? " · women only" : "")" }
        return nil
    }
}

/// Mini ring avatar for group chats.
struct CircleAvatar: View {
    let chat: ChatSummary
    let circle: ChatCircle?
    var size: CGFloat = 48
    @Environment(SessionStore.self) private var session

    var body: some View {
        if let trip = circle?.trip {
            SeatRing(seats: RingSeats.trip(trip, you: session.user), size: size, past: circle?.past ?? false, dots: .none,
                     centre: .photo(chat.image ?? trip.image), accessibilityText: "\(chat.name) circle")
        } else if let plan = circle?.plan {
            SeatRing(seats: RingSeats.plan(plan), size: size, plan: true, womenOnly: plan.audience == .women, past: circle?.past ?? false,
                     dots: .none, centre: .photo(chat.image), accessibilityText: "\(chat.name) circle")
        } else {
            PcAsyncImage(media: chat.image, targetSize: CGSize(width: size, height: size))
                .frame(width: size, height: size).clipShape(Circle())
                .overlay(Circle().strokeBorder(Pc.seatOpen, lineWidth: 2).padding(-3))
                .frame(width: size, height: size)
        }
    }
}

struct ChatRow: View {
    let chat: ChatSummary
    @Environment(AppModel.self) private var app

    var body: some View {
        let circle = ChatCircle.resolve(chat, app: app)
        HStack(spacing: 12) {
            Group {
                if chat.type == "direct" {
                    Avatar(user: UserLite(id: chat.id, username: chat.name, name: chat.name, avatarUrl: chat.image?.url, isPhoneVerified: false, isIdVerified: false, isHost: false), size: 48)
                } else {
                    CircleAvatar(chat: chat, circle: circle)
                }
            }
            .frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(chat.name).font(.system(size: 15, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(1)
                    Spacer(minLength: 6)
                    if let at = chat.lastMessage?.at { Text(Fmt.relative(at)).font(.system(size: 12, weight: .semibold)).monospacedDigit().foregroundStyle(Pc.ink3) }
                }
                HStack {
                    if let m = chat.lastMessage {
                        Text((m.authorName.map { "\($0): " } ?? "") + m.body)
                            .font(.system(size: 13.5, weight: chat.unread > 0 ? .semibold : .regular))
                            .foregroundStyle(chat.unread > 0 ? Pc.ink : Pc.ink2).lineLimit(1)
                    }
                    Spacer(minLength: 6)
                    if chat.unread > 0 { CountPill(count: chat.unread) }
                }
                if let sub = circle?.subtitle {
                    Text(sub).font(.system(size: 12, weight: .semibold)).foregroundStyle(Pc.ink3).lineLimit(1)
                }
            }
        }
        .padding(.vertical, 11)
        .frame(minHeight: 72)
        .overlay(alignment: .bottom) { HairlineRule().padding(.leading, 64) }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(chat.name). \(chat.lastMessage?.body ?? ""). \(chat.unread > 0 ? "\(chat.unread) unread" : "")")
    }
}

/// Chat room: ring + name in the header for circles, the host's latest note on top, bubbles, composer at the bottom.
struct ChatRoomView: View {
    let roomId: String
    var title: String?
    @Environment(AppModel.self) private var app
    @Environment(SessionStore.self) private var session
    @State private var draft = ""
    @FocusState private var focused: Bool

    private var lines: [ChatLine] { app.chat.lines[roomId] ?? [] }
    private var chat: ChatSummary? { app.chat.chats.first { $0.id == roomId } }
    private var hostNote: ChatMessage? {
        guard chat?.type != "direct" else { return nil }
        return lines.map(\.message).last { $0.author.isHost && $0.author.id != session.user?.id && $0.type != "system" }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 6) {
                    if let note = hostNote { hostNoteCard(note).padding(.bottom, 6) }
                    ForEach(Array(lines.enumerated()), id: \.element.id) { i, line in
                        let prev = i > 0 ? lines[i - 1].message : nil
                        MessageBubble(line: line, isMine: line.message.author.id == session.user?.id,
                                      showsName: prev?.author.id != line.message.author.id || prev?.type == "system",
                                      isGroup: chat?.type != "direct",
                                      onRetry: { app.chat.retry(line, roomId: roomId) })
                            .id(line.id)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: lines.count) { _, _ in
                if let last = lines.last { withAnimation(.easeOut(duration: PcTokens.motionFast)) { proxy.scrollTo(last.id, anchor: .bottom) } }
            }
            .onAppear { if let last = lines.last { proxy.scrollTo(last.id, anchor: .bottom) } }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        .pcScreen()
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Pc.paper, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar { ToolbarItem(placement: .principal) { header } }
        .task { if app.trips.myTrips.upcoming.isEmpty { await app.trips.refresh() } }
        .onAppear { app.chat.open(roomId) }
        .onDisappear { app.chat.close() }
    }

    @ViewBuilder private var header: some View {
        let name = title ?? chat?.name ?? "Chat"
        if let chat, chat.type != "direct" {
            let circle = ChatCircle.resolve(chat, app: app)
            HStack(spacing: 10) {
                CircleAvatar(chat: chat, circle: circle, size: 36)
                VStack(alignment: .leading, spacing: 0) {
                    Text(name).font(.system(size: 15, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(1)
                    if let trip = circle?.trip {
                        let c = SeatCounts(trip: trip)
                        Text("\(c.going) of \(c.total) · \(circle?.past == true ? "went" : "leaving") \(Fmt.weekdayDayMonth(circle?.travelDate ?? trip.nextDeparture))")
                            .font(.system(size: 12, weight: .semibold)).foregroundStyle(Pc.ink3).lineLimit(1)
                    } else if let sub = circle?.subtitle {
                        Text(sub).font(.system(size: 12, weight: .semibold)).foregroundStyle(Pc.ink3).lineLimit(1)
                    }
                }
            }
            .accessibilityElement(children: .combine)
        } else {
            Text(name).font(.system(size: 16, weight: .bold)).foregroundStyle(Pc.ink)
        }
    }

    private func hostNoteCard(_ m: ChatMessage) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "megaphone.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.ink).padding(.top, 2)
            VStack(alignment: .leading, spacing: 2) {
                Text("Latest from \(m.author.name) (host)").font(.system(size: 13, weight: .bold)).foregroundStyle(Pc.ink)
                Text(m.body).font(.system(size: 13.5)).foregroundStyle(Pc.ink).lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Pc.tonal, in: Pc.shape(18))
        .overlay(Pc.shape(18).strokeBorder(Pc.rule, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    private var composer: some View {
        let empty = draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return HStack(spacing: 8) {
            TextField(chat?.type == "direct" ? "Message" : "Message the circle", text: $draft, axis: .vertical)
                .font(.system(size: 15))
                .lineLimit(1...5)
                .focused($focused)
                .padding(.horizontal, 16)
                .padding(.vertical, 11)
                .frame(minHeight: 44)
                .background(Capsule().fill(Pc.raised))
                .overlay(Capsule().strokeBorder(focused ? Pc.ink : Pc.rule, lineWidth: focused ? 1.5 : 1))
            Button {
                app.chat.send(roomId, body: draft)
                draft = ""
            } label: {
                Image(systemName: "paperplane.fill").font(.system(size: 17, weight: .bold)).foregroundStyle(empty ? Pc.ink3 : Pc.raised)
                    .frame(width: 44, height: 44).background(Circle().fill(empty ? Pc.tonal : Pc.ink))
                    .frame(width: PcTokens.touch, height: PcTokens.touch)
                    .contentShape(Circle())
            }
            .buttonStyle(.pcPress)
            .disabled(empty)
            .accessibilityLabel("Send message")
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .pcBarBackground()
    }
}

struct MessageBubble: View {
    let line: ChatLine
    let isMine: Bool
    var showsName = true
    var isGroup = true
    var onRetry: () -> Void

    var body: some View {
        let m = line.message
        if m.type == "system" {
            Text(m.body).font(.system(size: 12, weight: .bold)).foregroundStyle(Pc.ink3).multilineTextAlignment(.center)
                .frame(maxWidth: .infinity).padding(.vertical, 8)
        } else {
            VStack(alignment: .leading, spacing: 3) {
                if !isMine && isGroup && showsName {
                    HStack(spacing: 6) {
                        Text(m.author.isHost ? m.author.name : m.author.firstName).font(.system(size: 12, weight: .bold)).foregroundStyle(Pc.ink2)
                        if m.author.isHost { PcTag(text: "Host", style: .host) }
                    }
                    .padding(.leading, 40)
                    .padding(.top, 6)
                }
                HStack(alignment: .bottom, spacing: 8) {
                    if isMine {
                        Spacer(minLength: 56)
                    } else if showsName || !isGroup {
                        Avatar(user: m.author, size: 30)
                    } else {
                        Color.clear.frame(width: 30, height: 1)
                    }
                    VStack(alignment: isMine ? .trailing : .leading, spacing: 3) {
                        Text(m.body).font(.system(size: 15)).foregroundStyle(isMine ? Pc.raised : Pc.ink).fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 6) {
                            switch line.state {
                            case "sending": Image(systemName: "clock").font(.system(size: 10, weight: .bold))
                            case "failed":
                                Button("Not sent · Retry", action: onRetry).buttonStyle(.plain).font(.system(size: 12, weight: .bold)).foregroundStyle(Pc.red)
                            default: Text(Fmt.time(m.createdAt)).font(.system(size: 11, weight: .semibold).monospacedDigit())
                            }
                        }
                        .foregroundStyle(isMine ? Pc.raised.opacity(0.75) : Pc.ink3)
                    }
                    .padding(.horizontal, 13)
                    .padding(.vertical, 9)
                    .background(isMine ? Pc.ink : Pc.raised, in: bubble)
                    .overlay { if !isMine { bubble.strokeBorder(Pc.rule, lineWidth: 1) } }
                    .opacity(line.state == "sending" ? 0.75 : 1)
                    if !isMine { Spacer(minLength: 40) }
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private var bubble: UnevenRoundedRectangle {
        UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: isMine ? 20 : 6, bottomTrailingRadius: isMine ? 6 : 20, topTrailingRadius: 20, style: .continuous)
    }
}
