import SwiftUI

/// A place field with suggestions from `GET /places`: popular places show on focus, matches narrow as you
/// type, and a tap fills it with the place's slug and coordinates (`picked`). Editing the text clears `picked`.
struct PlaceField: View {
    let placeholder: String
    @Binding var text: String
    @Binding var picked: Place?
    var style: PcTextStyle = .bodyStrong
    @Environment(AppModel.self) private var app
    @FocusState private var focused: Bool
    @State private var hits: [PlaceHit] = []
    @State private var popular: [PlaceHit] = []

    /// Place to send: the picked suggestion, or the typed name.
    static func place(text: String, picked: Place?) -> Place? {
        let t = text.trimmingCharacters(in: .whitespaces)
        if let picked, picked.name == t { return picked }
        return t.isEmpty ? nil : Place(name: t, slug: nil, lat: nil, lng: nil)
    }

    private var show: Bool {
        focused && picked == nil && !hits.isEmpty && !(hits.count == 1 && hits[0].name.caseInsensitiveCompare(text.trimmingCharacters(in: .whitespaces)) == .orderedSame)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "mappin").font(.system(size: 13, weight: .bold)).foregroundStyle(Pc.ink2)
                TextField(placeholder, text: $text)
                    .pcFont(style)
                    .foregroundStyle(Pc.ink)
                    .focused($focused)
                    .submitLabel(.done)
                    .onChange(of: text) { _, v in
                        if v.count > 80 { text = String(v.prefix(80)) }
                        if let p = picked, p.name != v { picked = nil }
                    }
            }
            if show {
                VStack(alignment: .leading, spacing: 0) {
                    if text.trimmingCharacters(in: .whitespaces).isEmpty {
                        Text("Popular").font(.system(size: 11, weight: .bold)).foregroundStyle(Pc.ink3).padding(.horizontal, 14).padding(.top, 6)
                    }
                    ForEach(hits) { h in
                        Button {
                            text = h.name
                            picked = h.place
                            focused = false
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "mappin").font(.system(size: 13)).foregroundStyle(Pc.ink2)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(h.name).pcFont(.bodyStrong).foregroundStyle(Pc.ink).lineLimit(1)
                                    if let d = h.detail { Text(d).pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1) }
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 14)
                            .frame(minHeight: 46)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Use \(h.name)")
                    }
                }
                .padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 16).fill(Pc.raised))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Pc.rule, lineWidth: 1))
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.easeOut(duration: 0.15), value: show)
        .task(id: focused ? text : nil) {
            guard focused, picked == nil else { return }
            await search(text)
        }
    }

    /// Filters what we already have at once, then asks the server after a short pause.
    private func search(_ v: String) async {
        let q = v.trimmingCharacters(in: .whitespaces)
        var pool: [PlaceHit] = []
        for h in popular + hits where !pool.contains(where: { $0.name.lowercased() == h.name.lowercased() }) { pool.append(h) }
        hits = q.isEmpty ? Array(popular.prefix(6))
            : Array(pool.filter { $0.name.localizedCaseInsensitiveContains(q) }
                .sorted { ($0.name.lowercased().hasPrefix(q.lowercased()) ? 0 : 1) < ($1.name.lowercased().hasPrefix(q.lowercased()) ? 0 : 1) }
                .prefix(6))
        if q.isEmpty { if !popular.isEmpty { return } } else { try? await Task.sleep(for: .milliseconds(220)) }
        if Task.isCancelled { return }
        guard let r = try? await app.api.places(q) else { return }
        if q.isEmpty { popular = r.items }
        if text.trimmingCharacters(in: .whitespaces) == q, picked == nil { hits = Array(r.items.prefix(6)) }
    }
}
