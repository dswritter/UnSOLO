import SwiftUI

/// Explore's single Tribe bridge: "Plans looking for people". Leads with an invite card to post a plan,
/// followed by open community plans (from the Tribe plan feed and suggestions).
struct PlansLookingRow: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    private var plans: [Post] {
        var seen = Set<String>()
        let fromFeed = app.tribe.items(for: "plan").compactMap { item -> Post? in
            if case .post(let p) = item { return p } else { return nil }
        }
        let fromSuggestions = app.explore.suggestions.compactMap(\.post).map { app.tribe.posts[$0.id] ?? $0 }
        return (fromFeed + fromSuggestions).filter { p in
            p.kind == .plan && !p.isLocal && p.status == .live && p.openSpots > 0 && p.viewer?.isAuthor != true
                && seen.insert(p.id).inserted
        }
    }

    var body: some View {
        let list = plans
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Plans looking for people").padding(.horizontal, 20)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 12) {
                    PlanInviteCard(planning: list.count, faces: Array(list.map(\.author).prefix(3)))
                    ForEach(list) { p in
                        Button { router.push(.post(id: p.id)) } label: { ExplorePlanCard(post: p) }
                            .buttonStyle(.pcPress)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}

/// "Going somewhere? Post a plan." with a looping ring: your gold seat at the top, the other five
/// seats filling in one by one, a pulsing + in the centre. Static under Reduce Motion.
struct PlanInviteCard: View {
    let planning: Int
    let faces: [UserLite]
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Going somewhere? Post a plan.").font(.system(size: 17, weight: .bold, design: .rounded)).foregroundStyle(Pc.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Travellers heading your way ask to join. No booking, no money.")
                        .font(.system(size: 13)).foregroundStyle(Pc.ink2).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                InviteRing()
            }
            HStack(spacing: 10) {
                Button("Start a plan") { app.requireVerified("Sign in to post a plan") { router.openCompose(.plan) } }
                    .buttonStyle(.pc(.primary, compact: true))
                Spacer(minLength: 0)
                Button { router.select(.tribe) } label: {
                    HStack(spacing: 6) {
                        if !faces.isEmpty { FaceStack(users: Array(faces.prefix(2)), size: 20) }
                        Text("\(planning) planning in Tribe →").font(.system(size: 13, weight: .bold)).foregroundStyle(Pc.ink)
                            .lineLimit(1).minimumScaleFactor(0.85)
                    }
                    .frame(minHeight: PcTokens.touch)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.pcPress)
                .accessibilityLabel("\(planning) plans in the Tribe")
            }
        }
        .padding(16)
        .frame(width: 352, alignment: .leading)
        .pcCard()
    }
}

/// 112 pt plan ring: 6 seats, yours (gold, ink edge) at the top; the others fade in as ink arcs over ~4.4 s, then reset.
struct InviteRing: View {
    var size: CGFloat = 112
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    private let n = 6
    private let cycle: Double = 4.4

    var body: some View {
        Group {
            if reduceMotion {
                ring(t: cycle) // static: all seats taken
            } else {
                TimelineView(.animation) { ctx in
                    ring(t: ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: cycle))
                }
            }
        }
        .frame(width: size, height: size)
        .overlay {
            Image(systemName: "plus").font(.system(size: 20, weight: .heavy)).foregroundStyle(Pc.ink)
                .frame(width: 40, height: 40)
                .background(Circle().fill(Pc.tonal))
                .scaleEffect(pulse ? 1.08 : 1)
                .onAppear {
                    guard !reduceMotion else { return }
                    withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { pulse = true }
                }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Your plan: you and five open seats")
    }

    /// Seat i (1…5) fades in from 0.5 s + 0.55 s·(i−1) over 0.35 s.
    private func opacity(_ i: Int, _ t: Double) -> Double {
        let start = 0.5 + Double(i - 1) * 0.55
        return min(1, max(0, (t - start) / 0.35))
    }

    private func ring(t: Double) -> some View {
        Canvas { ctx, sz in
            let c = CGPoint(x: sz.width / 2, y: sz.height / 2)
            let pad = max(14, size * 0.085)
            let r = size / 2 - pad
            let wT = max(4, size * 0.05)
            let seg = 360.0 / Double(n)
            let gap = min(6, seg * 0.24)
            func arc(_ i: Int) -> Path {
                let mid = -90 + Double(i) * seg
                var p = Path()
                p.addArc(center: c, radius: r, startAngle: .degrees(mid - seg / 2 + gap / 2), endAngle: .degrees(mid + seg / 2 - gap / 2), clockwise: false)
                return p
            }
            for i in 1..<n {
                let o = opacity(i, t)
                let mid = (-90 + Double(i) * seg) * .pi / 180
                let pt = CGPoint(x: c.x + r * cos(mid), y: c.y + r * sin(mid))
                let hr: CGFloat = 6
                let hollow = Path(ellipseIn: CGRect(x: pt.x - hr, y: pt.y - hr, width: hr * 2, height: hr * 2))
                if o < 1 {
                    var h = ctx
                    h.opacity = 1 - o
                    h.fill(hollow, with: .color(Pc.raised))
                    h.stroke(hollow, with: .color(Pc.seatOpen), lineWidth: 2.5)
                }
                if o > 0 {
                    var a = ctx
                    a.opacity = o
                    a.stroke(arc(i), with: .color(Pc.taken), style: StrokeStyle(lineWidth: wT, lineCap: .round))
                }
            }
            ctx.stroke(arc(0), with: .color(Pc.stroke), style: StrokeStyle(lineWidth: wT + 3, lineCap: .round))
            ctx.stroke(arc(0), with: .color(Pc.gold), style: StrokeStyle(lineWidth: wT, lineCap: .round))
        }
    }
}

/// Compact open-plan card for the Explore row: plan ring, title, dates, caption.
struct ExplorePlanCard: View {
    let post: Post
    var body: some View {
        let counts = SeatCounts(plan: post)
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                SeatRing(seats: RingSeats.plan(post), size: 72, plan: true, womenOnly: post.audience == .women, dots: .none, centre: .user(post.author))
                VStack(alignment: .leading, spacing: 4) {
                    if post.audience == .women { PcTag(text: "Women only", style: .women) }
                    Text(post.displayTitle).font(.system(size: 15, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(2).multilineTextAlignment(.leading)
                    Text("\(Fmt.range(post.startsOn, post.endsOn)) · \(post.place?.name.components(separatedBy: ",").first ?? "")")
                        .pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 6) {
                Avatar(user: post.author, size: 22)
                Text(post.author.firstName).font(.system(size: 13, weight: .semibold)).foregroundStyle(Pc.ink2).lineLimit(1)
                Spacer(minLength: 4)
                SeatCaption(counts: counts, noun: "spots", font: .system(size: 12.5, weight: .semibold))
            }
        }
        .padding(14)
        .frame(width: 270, alignment: .leading)
        .frame(minHeight: 168, alignment: .top)
        .pcPencilled()
        .accessibilityElement(children: .combine)
    }
}
