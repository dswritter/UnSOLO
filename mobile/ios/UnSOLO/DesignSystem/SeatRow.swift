import SwiftUI

// MARK: - Seat counts

/// Seat counting, same rule as web: `seatsTotal` is traveller capacity (`max_group_size`), bookings never
/// include the host, so n = seatsTotal, open = seatsLeft, going = n − open. The host is only the badge.
struct SeatCounts: Hashable {
    let total: Int
    let open: Int
    var going: Int { max(0, total - open) }
    var isFull: Bool { total > 0 && open == 0 }

    init(total: Int, open: Int) {
        self.total = max(total, open)
        self.open = max(0, open)
    }

    init(trip: TripLite) {
        self.init(total: trip.seatsTotal ?? 0, open: trip.seatsLeft ?? 0)
    }

    init(departure: Departure, hasHost: Bool) {
        self.init(total: departure.seatsTotal, open: departure.seatsLeft)
    }

    /// Plans: the organiser is a member, so every member counts as going.
    init(plan: Post) {
        let total = plan.spotsTotal ?? max(plan.memberCount, 1)
        self.init(total: total, open: max(0, total - plan.memberCount))
    }

    /// "8 of 12 spots open" / "Full, 12 of 12 spots taken".
    func accessibilityText(noun: String = "spots") -> String {
        isFull ? "Full, \(total) of \(total) \(noun) taken" : "\(open) of \(total) \(noun) open"
    }
}

/// The text line every ring is paired with:
/// "Be first in the circle · 12 spots open" / "8 of 12 open · 4 going" / "Full · 12/12".
struct SeatCaption: View {
    let counts: SeatCounts
    var noun = "spots"
    var font: Font = .system(size: 12, weight: .semibold)

    var body: some View {
        text.font(font).monospacedDigit().lineLimit(1).minimumScaleFactor(0.85)
            .accessibilityLabel(Self.plain(counts, noun: noun))
    }

    private var text: Text {
        let p = Self.parts(counts, noun: noun)
        if let rest = p.rest {
            return Text(p.strong).foregroundStyle(Pc.ink).fontWeight(.bold) + Text(" · \(rest)").foregroundStyle(Pc.ink2)
        }
        return Text(p.strong).foregroundStyle(counts.isFull ? Pc.full : Pc.ink).fontWeight(.bold)
    }

    static func parts(_ c: SeatCounts, noun: String = "spots") -> (strong: String, rest: String?) {
        if c.isFull { return ("Full · \(c.total)/\(c.total)", nil) }
        if c.going == 0 { return ("Be first in the circle", "\(c.open) \(c.open == 1 ? String(noun.dropLast()) : noun) open") }
        return ("\(c.open) of \(c.total) open", "\(c.going) going")
    }

    static func plain(_ c: SeatCounts, noun: String = "spots") -> String {
        let p = parts(c, noun: noun)
        return p.rest.map { "\(p.strong) · \($0)" } ?? p.strong
    }
}

// MARK: - Seat ring model

/// One seat around the ring, in drawing order (taken first, then you, then open).
enum RingSeat: Hashable {
    case taken(UserLite?)
    case you(UserLite?)
    case held
    case open

    var isOpen: Bool { if case .open = self { return true } else { return false } }
    var isYou: Bool {
        switch self {
        case .you, .held: return true
        default: return false
        }
    }
}

enum RingDots: Hashable {
    /// Signed-out viewers: arcs only.
    case none
    /// Signed-in viewers: initials.
    case initials
    /// Co-travellers: faces (falls back to initials).
    case faces
}

enum RingBadgeKind: Hashable { case host, organiser }

struct RingBadge: Hashable {
    var user: UserLite?
    var kind: RingBadgeKind
}

enum RingCentre: Hashable {
    case tonal
    case photo(Media?)
    case user(UserLite?)
}

enum RingSeats {
    /// Hosted trip: n = seatsTotal, going = seatsTotal − seatsLeft (see `SeatCounts`). Seat-level data
    /// (`detailSeats` or `goingFaces`) only supplies who sits in the taken seats; a `host` entry there is ignored.
    /// `you` marks the viewer's seat when they have booked this trip.
    static func trip(_ trip: TripLite, detailSeats: [Seat] = [], you: UserLite? = nil) -> [RingSeat] {
        let c = SeatCounts(trip: trip)
        var people: [RingSeat]
        if !detailSeats.isEmpty {
            people = detailSeats.compactMap { s in
                switch s.state {
                case .member, .organiser: .taken(s.user)
                case .you: .you(s.user)
                case .held: .held
                case .host, .requested, .open: nil
                }
            }
        } else {
            people = trip.goingFaces.filter { $0.id != trip.host?.id }.map { .taken($0) }
        }
        people = ordered(people)
        if people.count > c.going { people = Array(people.prefix(c.going)) }
        while people.count < c.going { people.insert(.taken(nil), at: people.firstIndex(where: \.isYou) ?? people.count) }
        var seats = people + Array(repeating: RingSeat.open, count: c.open)
        if let you, !seats.contains(where: \.isYou) {
            if let i = seats.lastIndex(where: { if case .taken = $0 { return true } else { return false } }) {
                seats[i] = .you(you)
            } else if let i = seats.firstIndex(where: \.isOpen) {
                seats[i] = .you(you)
            }
        }
        return ordered(seats)
    }

    /// Plan: organiser and members are taken; the organiser counts as going.
    static func plan(_ post: Post) -> [RingSeat] {
        from(SeatBuilder.planSeats(post))
    }

    /// Maps API seats. `requested` seats stay open on the ring (the requester waits outside it).
    static func from(_ seats: [Seat]) -> [RingSeat] {
        ordered(seats.map { s in
            switch s.state {
            case .host, .organiser, .member: .taken(s.user)
            case .you: .you(s.user)
            case .held: .held
            case .requested, .open: .open
            }
        })
    }

    static func requested(_ seats: [Seat]) -> UserLite? {
        seats.first { $0.state == .requested }?.user
    }

    private static func ordered(_ seats: [RingSeat]) -> [RingSeat] {
        let taken = seats.filter { if case .taken = $0 { return true } else { return false } }
        let you = seats.filter(\.isYou)
        let open = seats.filter(\.isOpen)
        return taken + you + open
    }
}

/// Geometry from design-system.md ("The seat ring"). Angles in degrees, 0 at 3 o'clock, clockwise.
struct RingGeometry {
    let size: CGFloat
    let n: Int
    let pad: CGFloat
    let radius: CGFloat
    let takenWidth: CGFloat
    let openWidth: CGFloat
    let hostGap: Double
    let span: Double
    let seg: Double
    let gap: Double
    let start: Double
    let dot: CGFloat
    let centreRadius: CGFloat

    init(size S: CGFloat, n count: Int, badge: Bool) {
        size = S
        n = max(count, 1)
        pad = S < 90 ? max(3, S * 0.06) : max(14, S * 0.085)
        radius = S / 2 - pad
        takenWidth = max(4, S * 0.05)
        openWidth = max(2, S * 0.016)
        let segLen0 = 2 * .pi * radius / CGFloat(n)
        let d0 = max(12, min(S * 0.14, segLen0 * 0.6))
        hostGap = badge ? min(150, 2 * asin(min(1, Double((36 + d0 / 2 + 4) / radius))) * 180 / .pi) : 0
        span = 360 - hostGap
        seg = span / Double(n)
        gap = min(6, seg * 0.24)
        start = -90 + hostGap / 2
        let segLen = 2 * .pi * radius * CGFloat(seg) / 360
        dot = max(12, min(S * 0.12, segLen * 0.5))
        centreRadius = max(2, radius - takenWidth / 2 - (S < 90 ? max(2, S * 0.05) : max(6, S * 0.045)))
    }

    var centre: CGPoint { CGPoint(x: size / 2, y: size / 2) }
    var showsDots: Bool { dot >= 14 }

    func segment(_ i: Int) -> (a0: Double, a1: Double, mid: Double) {
        let a0 = start + Double(i) * seg + gap / 2
        let a1 = a0 + seg - gap
        return (a0, a1, (a0 + a1) / 2)
    }

    func point(_ angle: Double, _ r: CGFloat? = nil) -> CGPoint {
        let rr = r ?? radius
        return CGPoint(x: centre.x + rr * CGFloat(cos(angle * .pi / 180)), y: centre.y + rr * CGFloat(sin(angle * .pi / 180)))
    }

    func arc(_ a0: Double, _ a1: Double) -> Path {
        var p = Path()
        p.addArc(center: centre, radius: radius, startAngle: .degrees(a0), endAngle: .degrees(a1), clockwise: false)
        return p
    }
}

private struct ArcShape: Shape {
    let geometry: RingGeometry
    let a0: Double
    let a1: Double
    func path(in rect: CGRect) -> Path { geometry.arc(a0, a1) }
}

// MARK: - Seat ring

/// The signature component: N arc segments around a circular centre (trip photo, organiser face or tinted disc).
/// Always pair it with `SeatCaption`. See docs/revamp/design-system.md for the geometry.
struct SeatRing: View {
    let seats: [RingSeat]
    var size: CGFloat = PcTokens.ringCard
    /// Plans: hollow circles for open seats, no continuous track.
    var plan = false
    var womenOnly = false
    var past = false
    var dots: RingDots = .initials
    var badge: RingBadge?
    var centre: RingCentre = .tonal
    /// Big number + small word in the centre ("8" / "open").
    var centreLabel: (big: String, small: String)?
    /// Your face waiting outside the ring (join requested).
    var waiting: UserLite?
    /// Spin once on appear when full (sold-out screens). The ring always spins when it becomes full.
    var spinOnAppear = false
    /// Draw your arc in on appear.
    var drawYouOnAppear = false
    var accessibilityText: String?
    /// Shared trip centre label: big open count, tiny "/N", and "spots left" (or full: N, "/N", "full").
    var centreSpots: SeatCounts?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var youProgress: CGFloat = 1
    @State private var rotation: Double = 0
    @State private var fade: Double = 1
    @State private var waitingIn = true

    private var geo: RingGeometry { RingGeometry(size: size, n: seats.count, badge: badge != nil) }
    private var isFull: Bool { !seats.isEmpty && !seats.contains(where: \.isOpen) }
    private var takenColor: Color { isFull ? Pc.full : (womenOnly ? Pc.rose : Pc.taken) }
    private var openColor: Color { womenOnly ? Pc.roseOpen : Pc.seatOpen }
    private var youIndex: Int? { seats.firstIndex(where: \.isYou) }
    private func isTaken(_ s: RingSeat) -> Bool { if case .taken = s { return true } else { return false } }

    var body: some View {
        ZStack {
            ring
                .rotationEffect(.degrees(rotation))
                .opacity(fade)
            if let centreSpots { spotsLabel(centreSpots) } else if let centreLabel { label(centreLabel) }
            if let badge { badgeView(badge) }
            if let waiting { waitingFace(waiting) }
        }
        .frame(width: size, height: size)
        .grayscale(past ? 0.85 : 0)
        .opacity(past ? 0.75 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText ?? defaultAccessibility)
        .onAppear {
            if spinOnAppear && isFull { spin() }
            if drawYouOnAppear && youIndex != nil { drawYou() }
        }
        .onChange(of: isFull) { was, now in if !was && now { spin() } }
        .onChange(of: youIndex) { was, now in if was == nil && now != nil { drawYou() } }
        .onChange(of: waiting) { was, now in
            if was == nil && now != nil { slideInWaiting() }
        }
    }

    private var defaultAccessibility: String {
        let open = seats.filter(\.isOpen).count
        var s = isFull ? "Full, \(seats.count) of \(seats.count) spots taken" : "\(open) of \(seats.count) spots open"
        if youIndex != nil { s += ", including your spot" }
        if womenOnly { s += ", women only" }
        if waiting != nil { s += ", your request is waiting" }
        return s
    }

    // MARK: Drawing

    private var ring: some View {
        let g = geo
        return ZStack {
            centreDisc(g)
            Canvas { ctx, _ in
                if !plan {
                    let track = g.arc(g.start + g.gap / 2, g.start + g.span - g.gap / 2)
                    ctx.stroke(track, with: .color(openColor), style: StrokeStyle(lineWidth: g.openWidth, lineCap: .round))
                }
                for (i, seat) in seats.enumerated() {
                    let s = g.segment(i)
                    switch seat {
                    case .taken:
                        // Trips: a run of consecutive taken spots is ONE continuous arc. Plans keep one arc per spot.
                        if plan {
                            ctx.stroke(g.arc(s.a0, s.a1), with: .color(takenColor), style: StrokeStyle(lineWidth: g.takenWidth, lineCap: .round))
                        } else if i == 0 || !isTaken(seats[i - 1]) {
                            var j = i
                            while j + 1 < seats.count, isTaken(seats[j + 1]) { j += 1 }
                            ctx.stroke(g.arc(s.a0, g.segment(j).a1), with: .color(takenColor), style: StrokeStyle(lineWidth: g.takenWidth, lineCap: .round))
                        }
                    case .open:
                        if plan {
                            let r = size < 90 ? max(3, size * 0.07) : max(6, g.dot * 0.34)
                            let c = g.point(s.mid)
                            let circle = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
                            ctx.fill(circle, with: .color(Pc.raised))
                            ctx.stroke(circle, with: .color(openColor), lineWidth: size < 90 ? 1.5 : 2.5)
                        }
                    case .you, .held:
                        break // drawn as animatable shapes below
                    }
                }
            }
            if let i = youIndex {
                let s = g.segment(i)
                let held = seats[i] == .held
                ArcShape(geometry: g, a0: s.a0, a1: s.a1)
                    .trim(from: 0, to: youProgress)
                    .stroke(Pc.stroke, style: StrokeStyle(lineWidth: g.takenWidth + 3, lineCap: .round))
                ArcShape(geometry: g, a0: s.a0, a1: s.a1)
                    .trim(from: 0, to: youProgress)
                    .stroke(Pc.gold, style: StrokeStyle(lineWidth: g.takenWidth, lineCap: .round, dash: held ? [g.takenWidth * 1.2, g.takenWidth] : []))
            }
            if dots != .none && g.showsDots {
                ForEach(Array(seats.enumerated()), id: \.offset) { i, seat in
                    seatDot(seat, at: g.point(g.segment(i).mid), d: g.dot)
                }
            }
        }
        .frame(width: size, height: size)
    }

    @ViewBuilder private func centreDisc(_ g: RingGeometry) -> some View {
        let d = g.centreRadius * 2
        Group {
            switch centre {
            case .tonal:
                Circle().fill(isFull ? Pc.goldBg : Pc.tonal)
            case .photo(let media):
                ZStack {
                    Circle().fill(Pc.tonal)
                    if media != nil {
                        PcAsyncImage(media: media, targetSize: CGSize(width: d, height: d)).clipShape(Circle())
                    }
                }
            case .user(let user):
                Avatar(user: user, size: d)
            }
        }
        .frame(width: d, height: d)
    }

    @ViewBuilder private func seatDot(_ seat: RingSeat, at p: CGPoint, d: CGFloat) -> some View {
        switch seat {
        case .open:
            EmptyView()
        case .taken(let user):
            dotView(user: user, fill: takenColor, text: isFull ? PcTokens.light.ink : (womenOnly ? .white : Pc.raised), halo: Pc.raised, d: d, label: nil)
                .position(p)
        case .you(let user):
            dotView(user: dots == .faces ? user : nil, fill: Pc.gold, text: PcTokens.light.onGold, halo: Pc.stroke, d: d, label: "You")
                .position(p)
                .opacity(Double(youProgress))
        case .held:
            dotView(user: nil, fill: Pc.gold, text: PcTokens.light.onGold, halo: Pc.stroke, d: d, label: "You")
                .position(p)
        }
    }

    private func dotView(user: UserLite?, fill: Color, text: Color, halo: Color, d: CGFloat, label: String?) -> some View {
        ZStack {
            Circle().fill(halo).frame(width: d + 4, height: d + 4)
            if dots == .faces, let user, user.avatarUrl != nil {
                Avatar(user: user, size: d)
            } else {
                Circle().fill(fill).frame(width: d, height: d)
                if let label {
                    Text(label).font(.system(size: max(8, d * 0.3), weight: .heavy)).foregroundStyle(text)
                } else if let user {
                    Text(user.initials).font(.system(size: max(8, d * 0.36), weight: .bold)).foregroundStyle(text)
                        .lineLimit(1).minimumScaleFactor(0.5)
                } else {
                    Image(systemName: "person.fill").font(.system(size: max(7, d * 0.4), weight: .bold)).foregroundStyle(text.opacity(0.85))
                }
            }
        }
    }

    private func label(_ l: (big: String, small: String)) -> some View {
        let onPhoto: Bool = { if case .photo = centre { return true } else { return false } }()
        let big = max(14, size * 0.2)
        return VStack(spacing: 0) {
            Text(l.big).font(PcFont.rounded(big, .heavy)).tracking(-0.5).lineLimit(1).minimumScaleFactor(0.5)
                .foregroundStyle(onPhoto ? Color.white : Pc.ink)
            if !l.small.isEmpty {
                Text(l.small).font(.system(size: max(10, min(13, size * 0.07)), weight: .bold)).lineLimit(1)
                    .foregroundStyle(onPhoto ? Color.white.opacity(0.9) : Pc.ink2)
            }
        }
        .padding(.horizontal, onPhoto ? 14 : 0)
        .padding(.vertical, onPhoto ? 6 : 0)
        .background { if onPhoto { Capsule().fill(Pc.scrim) } }
        .frame(maxWidth: geo.centreRadius * 1.8)
    }

    /// "8 /12" over "spots left"; full: "12 /12" over "full". Sized to fit inside the centre disc.
    private func spotsLabel(_ c: SeatCounts) -> some View {
        let onPhoto: Bool = { if case .photo = centre { return true } else { return false } }()
        let big = max(14, size * 0.2)
        let fg: Color = onPhoto ? .white : Pc.ink
        let word = c.isFull ? "full" : (c.open == 1 ? "spot left" : "spots left")
        return VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text(c.isFull ? "\(c.total)" : "\(c.open)").font(PcFont.rounded(big, .heavy)).tracking(-0.5)
                Text("/\(c.total)").font(PcFont.rounded(big * 0.36, .bold)).opacity(0.6)
            }
            .foregroundStyle(fg)
            .lineLimit(1)
            Text(word).font(.system(size: max(9, min(13, size * 0.065)), weight: .bold)).lineLimit(1)
                .foregroundStyle(onPhoto ? Color.white.opacity(0.9) : Pc.ink2)
        }
        .minimumScaleFactor(0.6)
        .padding(.horizontal, onPhoto ? 12 : 0)
        .padding(.vertical, onPhoto ? 5 : 0)
        .background { if onPhoto { Capsule().fill(Pc.scrim) } }
        .frame(maxWidth: geo.centreRadius * 1.9)
        .accessibilityHidden(true)
    }

    private func badgeView(_ b: RingBadge) -> some View {
        HStack(spacing: 5) {
            Avatar(user: b.user, size: 18)
            Text(b.kind == .host ? "HOST" : "ORGANISER").font(.system(size: 10.5, weight: .heavy)).tracking(0.4)
        }
        .padding(.leading, 3)
        .padding(.trailing, 9)
        .frame(height: 23)
        .foregroundStyle(b.kind == .host ? PcTokens.light.onGold : Pc.ink)
        .background(Capsule().fill(b.kind == .host ? Pc.gold : Pc.raised))
        .overlay(Capsule().strokeBorder(Pc.stroke, lineWidth: 1.5))
        .fixedSize()
        .position(x: size / 2, y: geo.pad)
    }

    private func waitingFace(_ user: UserLite) -> some View {
        let p = geo.point(-28, geo.radius + 30 + (geo.showsDots ? 8 : 0))
        return ZStack(alignment: .bottomTrailing) {
            Avatar(user: user, size: 34)
                .overlay(Circle().strokeBorder(Pc.paper, lineWidth: 2.5).padding(-2.5))
                .overlay(Circle().strokeBorder(Pc.stroke, lineWidth: 1.5).padding(-4))
            Image(systemName: "clock.fill").font(.system(size: 10.5, weight: .heavy))
                .foregroundStyle(PcTokens.light.onGold)
                .frame(width: 20, height: 20)
                .background(Circle().fill(Pc.gold))
                .background(Circle().fill(Pc.paper).padding(-2))
                .offset(x: 6, y: 6)
        }
        .position(p)
        .offset(x: waitingIn ? 0 : 24, y: waitingIn ? 0 : -14)
        .opacity(waitingIn ? 1 : 0)
    }

    // MARK: Motion

    private func spin() {
        if reduceMotion {
            fade = 0.3
            withAnimation(.easeOut(duration: 0.4)) { fade = 1 }
        } else {
            rotation = -360
            withAnimation(.timingCurve(0.4, 0, 0.2, 1, duration: 0.7)) { rotation = 0 }
        }
    }

    private func drawYou() {
        youProgress = reduceMotion ? 1 : 0
        if reduceMotion {
            fade = 0.4
            withAnimation(.easeOut(duration: 0.3)) { fade = 1 }
        } else {
            withAnimation(.easeOut(duration: 0.42)) { youProgress = 1 }
        }
    }

    private func slideInWaiting() {
        waitingIn = false
        withAnimation(reduceMotion ? .easeOut(duration: 0.2) : .spring(duration: 0.34, bounce: 0.3)) { waitingIn = true }
    }
}

// MARK: - Mini arc (lists)

/// 44 pt list ring: a thin open circle with a 5 pt progress arc from 12 o'clock and "k/n" in the centre.
struct MiniArc: View {
    let counts: SeatCounts
    var size: CGFloat = PcTokens.ringMini
    var womenOnly = false

    var body: some View {
        let lw: CGFloat = size < 40 ? 4 : 5
        let f = counts.total > 0 ? CGFloat(counts.going) / CGFloat(counts.total) : 0
        ZStack {
            Circle().inset(by: 4).stroke(womenOnly ? Pc.roseOpen : Pc.seatOpen, lineWidth: 2)
            if counts.going > 0 {
                Circle().inset(by: 4)
                    .trim(from: 0, to: f)
                    .stroke(counts.isFull ? Pc.full : (womenOnly ? Pc.rose : Pc.taken), style: StrokeStyle(lineWidth: lw, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            Text("\(counts.going)/\(counts.total)")
                .font(.system(size: size < 40 ? 9.5 : 11, weight: .heavy).monospacedDigit())
                .tracking(-0.3)
                .foregroundStyle(Pc.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 6)
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(counts.accessibilityText())
    }
}

// MARK: - Story ring

/// One arc per story: ink for unseen, `rule` for seen. Your own ring is a quiet rule ring with the yellow + badge.
struct StoryRing: View {
    let user: UserLite?
    var segments: Int = 1
    var seen: Int = 0
    var size: CGFloat = 56
    var isMine = false
    /// A story going up: the ring fills with how much has been sent (0…1).
    var progress: Double? = nil
    /// The last story failed to go up: a red ring (tap to retry).
    var failed = false

    var body: some View {
        ZStack {
            if failed {
                Circle().strokeBorder(Pc.red, lineWidth: 3)
            } else if let progress {
                Circle().strokeBorder(Pc.rule, lineWidth: 3)
                Circle().inset(by: 1.5).trim(from: 0, to: max(0.02, min(1, progress)))
                    .stroke(Pc.gold, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeOut(duration: 0.25), value: progress)
            } else {
            Canvas { ctx, sz in
                let c = CGPoint(x: sz.width / 2, y: sz.height / 2)
                let r = sz.width / 2 - 2.5
                let n = max(segments, 1)
                let gapDeg: Double = n > 1 ? 9 : 0
                let span = 360.0 / Double(n)
                for i in 0..<n {
                    let isSeen = !isMine && i < seen
                    let color: Color = isMine ? Pc.rule : (isSeen ? Pc.rule : Pc.ink)
                    var p = Path()
                    if n == 1 {
                        p.addEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
                    } else {
                        let a0 = -90 + Double(i) * span + gapDeg / 2
                        p.addArc(center: c, radius: r, startAngle: .degrees(a0), endAngle: .degrees(a0 + span - gapDeg), clockwise: false)
                    }
                    ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: isSeen || isMine ? 2 : 3, lineCap: .round))
                }
            }
            }
            Avatar(user: user, size: size - 12)
            if failed {
                Image(systemName: "arrow.clockwise").font(.system(size: 11, weight: .heavy)).foregroundStyle(.white)
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Pc.red))
                    .background(Circle().fill(Pc.paper).padding(-2.5))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            } else if isMine && progress == nil {
                Image(systemName: "plus").font(.system(size: 11, weight: .heavy)).foregroundStyle(Pc.onPine)
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Pc.pine))
                    .background(Circle().fill(Pc.paper).padding(-2.5))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            }
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Legacy seat circles (kept for API compatibility; screens use SeatRing / MiniArc)

/// One circle per seat. Still used for single-person markers (host avatar in offers, tagging people in stories).
struct SeatCell: View {
    let seat: Seat
    var size: CGFloat = PcTokens.seat
    var blurFaces = false

    var body: some View {
        content
            .frame(width: size, height: size)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityText)
    }

    @ViewBuilder private var content: some View {
        switch seat.state {
        case .open:
            Circle().strokeBorder(Pc.seatOpen, lineWidth: 2)
        case .held:
            Circle().strokeBorder(Pc.gold, style: StrokeStyle(lineWidth: 2.5, dash: [4, 3]))
        case .you:
            ZStack {
                Circle().fill(Pc.gold)
                initials(color: PcTokens.light.onGold)
            }
            .overlay(Circle().strokeBorder(Pc.stroke, lineWidth: 1.5))
        case .requested:
            ZStack(alignment: .bottomTrailing) {
                face
                Image(systemName: "clock.fill")
                    .font(.system(size: max(9, size * 0.28), weight: .bold))
                    .foregroundStyle(PcTokens.light.onGold)
                    .padding(2)
                    .background(Circle().fill(Pc.gold))
                    .offset(x: 3, y: 3)
            }
        case .host:
            face.overlay(Circle().strokeBorder(Pc.gold, lineWidth: 2.5))
        case .organiser:
            face.overlay(Circle().strokeBorder(Pc.stroke, lineWidth: 2))
        case .member:
            face.overlay(Circle().strokeBorder(Pc.taken, lineWidth: 2))
        }
    }

    private var face: some View {
        ZStack {
            Circle().fill(Pc.tonal)
            if let url = seat.user?.avatarUrl {
                PcAsyncImage(url: url, targetSize: CGSize(width: size, height: size))
                    .clipShape(Circle())
                    .blur(radius: blurFaces ? 8 : 0)
                    .clipShape(Circle())
            } else {
                initials(color: Pc.ink)
            }
        }
    }

    private func initials(color: Color) -> some View {
        Text(seat.user?.initials ?? "")
            .font(.system(size: max(11, size * 0.32), weight: .bold, design: .rounded))
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .blur(radius: blurFaces && seat.state != .you ? 3 : 0)
    }

    private var accessibilityText: String {
        let name = seat.user?.name ?? ""
        switch seat.state {
        case .open: return "Open spot"
        case .held: return "Spot held for you"
        case .you: return "Your spot"
        case .requested: return "Requested, waiting for approval"
        case .host: return "Host \(name)"
        case .organiser: return "Organiser \(name)"
        case .member: return name.isEmpty ? "Taken" : name
        }
    }
}

/// Legacy API: now renders a ring plus its caption instead of a row of circles.
struct SeatRow: View {
    let seats: [Seat]
    var cellSize: CGFloat = PcTokens.seat
    var spacing: CGFloat = 8
    var maxCells: Int = 16
    var blurFaces = false
    var columns: Int? = nil

    var body: some View {
        let ring = RingSeats.from(seats)
        HStack(spacing: 12) {
            SeatRing(seats: ring, size: max(cellSize * 2, PcTokens.ringMini), plan: seats.contains { $0.state == .organiser },
                     dots: blurFaces ? .none : .initials)
            SeatCaption(counts: SeatCounts(total: ring.count, open: ring.filter(\.isOpen).count))
        }
    }
}

struct FillBar: View {
    let filled: Int
    let total: Int
    var width: CGFloat? = nil

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Pc.tonalStrong)
                Capsule().fill(Pc.taken).frame(width: geo.size.width * CGFloat(filled) / CGFloat(max(total, 1)))
            }
        }
        .frame(width: width, height: 5)
        .accessibilityLabel("\(filled) of \(total)")
    }
}

enum SeatBuilder {
    /// Builds a hosted-trip seat list from TripLite data (host first, faces, then anonymous members, then open).
    static func tripSeats(_ trip: TripLite, includeYou: Bool = false) -> [Seat] {
        let total = trip.seatsTotal ?? 0
        let left = trip.seatsLeft ?? 0
        let taken = max(0, total - left)
        var seats: [Seat] = []
        if let host = trip.host { seats.append(Seat(state: .host, user: host)) }
        for face in trip.goingFaces.prefix(max(0, taken - (seats.isEmpty ? 0 : 1))) {
            seats.append(Seat(state: .member, user: face))
        }
        while seats.count < taken { seats.append(Seat(state: .member, user: nil)) }
        if includeYou, seats.count < total { seats.append(Seat(state: .you, user: nil)) }
        while seats.count < total { seats.append(Seat(state: .open, user: nil)) }
        return seats
    }

    /// Plan seats: organiser first, members, then open seats up to spotsTotal.
    static func planSeats(_ post: Post) -> [Seat] {
        if !post.seats.isEmpty { return post.seats }
        var seats = [Seat(state: .organiser, user: post.author)]
        let total = post.spotsTotal ?? max(post.memberCount, 1)
        while seats.count < post.memberCount { seats.append(Seat(state: .member, user: nil)) }
        while seats.count < total { seats.append(Seat(state: .open, user: nil)) }
        return seats
    }
}
