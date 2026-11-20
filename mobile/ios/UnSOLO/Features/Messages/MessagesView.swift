import SwiftUI

struct MessagesView: View {
    enum Segment: Hashable { case chats, requests }
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var segment: Segment = .chats

    private var chats: [ChatSummary] { app.chat.chats.filter { !$0.isRequest } }
    private var requests: [ChatSummary] { app.chat.chats.filter(\.isRequest) }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Text("Messages").pcFont(.display).foregroundStyle(Pc.ink).padding(.horizontal, 20).padding(.top, 4)
                PcSegmented(items: [(.chats, "Chats"), (.requests, requests.isEmpty ? "Requests" : "Requests · \(requests.count)")], selection: $segment)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 14)
                let list = segment == .chats ? chats : requests
                if list.isEmpty {
                    EmptyState(symbol: "envelope", title: segment == .chats ? "No chats yet" : "No requests",
                               message: segment == .chats ? "Trip and plan group chats open when you book or get approved." : nil)
                }
                ForEach(list) { c in
                    Button { router.push(.chat(roomId: c.id, title: c.name)) } label: { ChatRow(chat: c) }
                        .buttonStyle(.plain)
                    HairlineRule().padding(.leading, 80)
                }
                if segment == .requests || !requests.isEmpty && segment == .chats {
                    Text("Requests come from people you don't follow. They won't know you've read them until you reply. You can also report or block.")
                        .pcFont(.small).foregroundStyle(Pc.ink2).padding(16)
                }
            }
        }
        .refreshable { await app.chat.refreshChats() }
        .pcScreen()
        .pcNavigationBar()
        .task {
            await app.chat.refreshChats()
            await app.analytics.track("screen.view", screen: "inbox")
        }
    }
}

struct ChatRow: View {
    let chat: ChatSummary
    var body: some View {
        HStack(spacing: 12) {
            Group {
                if chat.type == "direct" {
                    Avatar(user: UserLite(id: chat.id, username: chat.name, name: chat.name, avatarUrl: chat.image?.url, isPhoneVerified: false, isIdVerified: false, isHost: false), size: 48)
                } else {
                    PcAsyncImage(media: chat.image, targetSize: CGSize(width: 48, height: 48))
                        .frame(width: 48, height: 48).clipShape(Circle())
                }
            }
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(chat.name).pcFont(.bodyStrong).foregroundStyle(Pc.ink).lineLimit(1)
                    if chat.type == "trip" { PcTag(text: "Trip", style: .kind) }
                    if chat.type == "general" { PcTag(text: "Plan", style: .kindDashed) }
                }
                if let m = chat.lastMessage {
                    (Text(m.authorName == "You" ? "You: " : "").pcFontText(.small).foregroundStyle(Pc.ink) + Text(m.body).pcFontText(.small).foregroundStyle(Pc.ink2))
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 6) {
                if let at = chat.lastMessage?.at { Text(Fmt.relative(at)).pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2) }
                if chat.unread > 0 { CountPill(count: chat.unread) }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .frame(minHeight: 72)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(chat.name). \(chat.lastMessage?.body ?? ""). \(chat.unread > 0 ? "\(chat.unread) unread" : "")")
    }
}

struct ChatRoomView: View {
    let roomId: String
    var title: String?
    @Environment(AppModel.self) private var app
    @Environment(SessionStore.self) private var session
    @State private var draft = ""
    @FocusState private var focused: Bool

    private var lines: [ChatLine] { app.chat.lines[roomId] ?? [] }
    private var chat: ChatSummary? { app.chat.chats.first { $0.id == roomId } }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(lines) { line in
                        MessageBubble(line: line, isMine: line.message.author.id == session.user?.id, onRetry: { app.chat.retry(line, roomId: roomId) })
                            .id(line.id)
                    }
                }
                .padding(.horizontal, 12)
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
        .pcNavigationBar(title ?? chat?.name ?? "Chat")
        .onAppear { app.chat.open(roomId) }
        .onDisappear { app.chat.close() }
    }

    private var composer: some View {
        HStack(spacing: 8) {
            TextField(chat?.type == "direct" ? "Message" : "Message the group", text: $draft, axis: .vertical)
                .pcFont(.body)
                .lineLimit(1...5)
                .focused($focused)
                .padding(.horizontal, 16)
                .padding(.vertical, 11)
                .background(Capsule().fill(Pc.tonal))
            Button {
                app.chat.send(roomId, body: draft)
                draft = ""
            } label: {
                Image(systemName: "arrow.up").font(.system(size: 17, weight: .bold)).foregroundStyle(Pc.onInk)
                    .frame(width: PcTokens.touch, height: PcTokens.touch).background(Pc.ink, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel("Send message")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
        .overlay(alignment: .top) { HairlineRule(color: Pc.rule.opacity(0.5)) }
    }
}

struct MessageBubble: View {
    let line: ChatLine
    let isMine: Bool
    var onRetry: () -> Void

    var body: some View {
        let m = line.message
        if m.type == "system" {
            Text(m.body).pcFont(.small).foregroundStyle(Pc.ink2).frame(maxWidth: .infinity).padding(.vertical, 4)
        } else {
            HStack(alignment: .bottom, spacing: 8) {
                if isMine { Spacer(minLength: 48) } else { Avatar(user: m.author, size: 30) }
                VStack(alignment: .leading, spacing: 4) {
                    if !isMine {
                        HStack(spacing: 6) {
                            Text(m.author.isHost ? m.author.name : m.author.firstName).pcFont(.label, weight: .semibold).foregroundStyle(Pc.ink2)
                            if m.author.isHost { PcTag(text: "Host", style: .host) }
                        }
                    }
                    Text(m.body).pcFont(.body).foregroundStyle(isMine ? Pc.onInk : Pc.ink).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 6) {
                        Spacer(minLength: 0)
                        switch line.state {
                        case "sending": Image(systemName: "clock").font(.system(size: 10))
                        case "failed":
                            Button("Not sent · Retry", action: onRetry).buttonStyle(.plain).pcFont(.label, weight: .semibold).foregroundStyle(Pc.red)
                        default: Text(Fmt.time(m.createdAt)).font(.system(size: 11, weight: .medium).monospacedDigit())
                        }
                    }
                    .foregroundStyle(isMine ? Pc.onInk.opacity(0.7) : Pc.ink2)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(isMine ? Pc.ink : Pc.raised, in: Pc.shape(20))
                .shadow(color: .black.opacity(isMine ? 0 : 0.04), radius: 6, y: 1)
                .opacity(line.state == "sending" ? 0.75 : 1)
                if !isMine { Spacer(minLength: 48) }
            }
            .accessibilityElement(children: .combine)
        }
    }
}
