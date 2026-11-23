import SwiftUI

extension StatusRepo {
    /// Best first: exact username, then username starts with it, then a word of the name starts with it, then the rest.
    static func rank(_ users: [UserLite], _ q: String) -> [UserLite] {
        let t = q.lowercased()
        func tier(_ u: UserLite) -> Int {
            let un = u.username.lowercased()
            if un == t { return 0 }
            if un.hasPrefix(t) { return 1 }
            if u.name.lowercased().split(separator: " ").contains(where: { $0.hasPrefix(t) }) { return 2 }
            return 3
        }
        return users.enumerated().sorted { a, b in
            let ta = tier(a.element), tb = tier(b.element)
            return ta != tb ? ta < tb : a.offset < b.offset
        }.map(\.element)
    }

    /// Ranked matches we already have for `q` (people you follow and earlier answers).
    func ranked(_ q: String) -> [UserLite] { Self.rank(peopleNow(q), q) }
}

extension Mentions {
    /// The text with the @name being typed at the end replaced by `@username `.
    static func accept(_ text: String, _ u: UserLite, limit: Int = 500) -> String {
        guard let tail = tail(text) else { return text }
        return String((String(text[..<tail.start]) + "@\(u.username) ").prefix(limit))
    }

    /// Typing a space right after a partial @name takes the best match.
    static func spaceAccepted(old: String, new: String, best: (String) -> UserLite?) -> String? {
        guard new == old + " ", let tail = tail(old), !tail.query.isEmpty, let u = best(tail.query),
              u.username.lowercased() != tail.query.lowercased() else { return nil }
        return accept(old, u)
    }
}

/// The best match for the @name being typed, shown inside the input as a small "✓ @username" chip. Tap to take it.
struct MentionBestChip: View {
    @Binding var text: String
    var dark = false
    @Environment(AppModel.self) private var app
    @State private var best: UserLite?

    var body: some View {
        let q = Mentions.tail(text)?.query ?? ""
        Group {
            if !q.isEmpty, let best {
                Button { text = Mentions.accept(text, best) } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy))
                        Text("@\(best.username)").font(.system(size: 12, weight: .bold)).lineLimit(1)
                    }
                    .foregroundStyle(dark ? .black : Pc.raised)
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .background(Capsule().fill(dark ? .white : Pc.ink))
                }
                .buttonStyle(.pcPress)
                .accessibilityLabel("Mention @\(best.username)")
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .animation(.easeOut(duration: 0.15), value: best?.id)
        .task(id: q) {
            guard !q.isEmpty else { best = nil; return }
            app.statuses.warmPeople()
            best = app.statuses.ranked(q).first
            try? await Task.sleep(for: .milliseconds(350))
            if Task.isCancelled { return }
            best = StatusRepo.rank(await app.statuses.people(q), q).first
        }
    }
}

/// People matching the @name being typed, in a row above the box (the best one is in the box). Tapping one takes it.
struct MentionSuggestions: View {
    @Binding var caption: String
    var dark = true
    var hint = true
    @Environment(AppModel.self) private var app
    @State private var hits: [UserLite] = []
    @State private var searching = false

    private var fg: Color { dark ? .white : Pc.ink }
    private var fg2: Color { dark ? .white.opacity(0.7) : Pc.ink2 }

    var body: some View {
        let tail = Mentions.tail(caption)
        let others = Array(hits.dropFirst())
        Group {
            if let tail {
                if tail.query.isEmpty {
                    if hint { Text("Type a name or username to mention someone").font(.system(size: 12)).foregroundStyle(fg2) }
                } else if hits.isEmpty {
                    Text(searching ? "Looking for “\(tail.query)”…" : "No one called “\(tail.query)” on UnSOLO").font(.system(size: 12)).foregroundStyle(fg2)
                } else if !others.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(others) { u in
                                Button { caption = Mentions.accept(caption, u) } label: {
                                    HStack(spacing: 8) {
                                        Avatar(user: u, size: 28)
                                        VStack(alignment: .leading, spacing: 0) {
                                            Text(u.name).font(.system(size: 12, weight: .bold)).foregroundStyle(fg).lineLimit(1)
                                            Text("@\(u.username)").font(.system(size: 11)).foregroundStyle(fg2).lineLimit(1)
                                        }
                                    }
                                    .padding(.leading, 4).padding(.trailing, 12).padding(.vertical, 4)
                                    .background(Capsule().fill(dark ? Color(white: 0.07).opacity(0.8) : Pc.tonal))
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
            hits = app.statuses.ranked(q)
            searching = true
            try? await Task.sleep(for: .milliseconds(120))
            if Task.isCancelled { return }
            hits = StatusRepo.rank(await app.statuses.people(q), q)
            searching = false
        }
    }
}

extension View {
    /// A space typed right after a partial @name takes the best match.
    func mentionSpaceAccept(_ text: Binding<String>, app: AppModel) -> some View {
        onChange(of: text.wrappedValue) { old, new in
            if let done = Mentions.spaceAccepted(old: old, new: new, best: { app.statuses.ranked($0).first }) { text.wrappedValue = done }
        }
    }
}
