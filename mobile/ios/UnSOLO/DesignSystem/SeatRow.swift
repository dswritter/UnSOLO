import SwiftUI

/// The signature component: one circle per seat (40 pt on detail screens, 32 pt in feeds).
/// - host: face/logo with a 2 pt gold ring
/// - organiser: face/initials with a 2 pt ink ring (an ORGANISER tag sits by the name elsewhere)
/// - member: face, or initials on a soft tonal fill
/// - you: gold fill with your initials
/// - requested: your initials with a clock badge
/// - held: dashed gold circle, pulsing
/// - open: 1.5 pt dashed circle in rule2
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
            Circle().strokeBorder(Pc.rule2, style: StrokeStyle(lineWidth: 1.5, dash: [3.5, 3]))
        case .held:
            HeldSeat()
        case .you:
            ZStack {
                Circle().fill(Pc.gold)
                initials(color: Pc.onGold)
            }
        case .requested:
            ZStack(alignment: .bottomTrailing) {
                ZStack {
                    Circle().fill(Pc.tonalStrong)
                    initials(color: Pc.ink)
                }
                .overlay(Circle().strokeBorder(Pc.ink2, style: StrokeStyle(lineWidth: 1.5, dash: [3.5, 3])))
                Image(systemName: "clock.fill")
                    .font(.system(size: max(9, size * 0.28), weight: .bold))
                    .foregroundStyle(Pc.ink)
                    .background(Circle().fill(Pc.paper).padding(-2))
                    .offset(x: 2, y: 2)
            }
        case .host:
            face.overlay(Circle().strokeBorder(Pc.gold, lineWidth: 2))
        case .organiser:
            face.overlay(Circle().strokeBorder(Pc.ink, lineWidth: 2))
        case .member:
            face
        }
    }

    private var face: some View {
        ZStack {
            Circle().fill(Pc.ink.opacity(0.07))
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
            .font(.system(size: max(11, size * 0.32), weight: .semibold))
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .blur(radius: blurFaces && seat.state != .you ? 3 : 0)
    }

    private var accessibilityText: String {
        let name = seat.user?.name ?? ""
        switch seat.state {
        case .open: return "Open seat"
        case .held: return "Seat held for you"
        case .you: return "Your seat"
        case .requested: return "Requested, waiting for approval"
        case .host: return "Host \(name)"
        case .organiser: return "Organiser \(name)"
        case .member: return name.isEmpty ? "Taken" : name
        }
    }
}

private struct HeldSeat: View {
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle().fill(Pc.goldBg)
            Circle().strokeBorder(Pc.gold, style: StrokeStyle(lineWidth: 2, dash: [4, 3]))
        }
        .opacity(pulse ? 0.55 : 1)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

/// A wrapping row of seat circles. Above `maxCells` seats it shows the first cells, a "+N" circle and a fill bar.
struct SeatRow: View {
    let seats: [Seat]
    var cellSize: CGFloat = PcTokens.seat
    var spacing: CGFloat = 8
    var maxCells: Int = 16
    var blurFaces = false
    /// Kept for source compatibility; circles always use a fixed size and wrap.
    var columns: Int? = nil

    var body: some View {
        if !seats.isEmpty && seats.allSatisfy({ $0.state == .open }) {
            // Nobody booked yet: one quiet line instead of a row of empty outlines.
            Text("All \(seats.count) seats open · be the first").pcFont(.small).foregroundStyle(Pc.ink2)
        } else {
            filled
        }
    }

    private var filled: some View {
        VStack(alignment: .leading, spacing: 8) {
            FlowLayout(spacing: spacing, lineSpacing: spacing) {
                ForEach(Array(visible.enumerated()), id: \.offset) { _, seat in
                    SeatCell(seat: seat, size: cellSize, blurFaces: blurFaces)
                }
                if overflow > 0 {
                    Text("+\(overflow)")
                        .font(.system(size: cellSize * 0.32, weight: .semibold).monospacedDigit())
                        .foregroundStyle(Pc.ink)
                        .frame(width: cellSize, height: cellSize)
                        .background(Circle().fill(Pc.tonal))
                }
            }
            if overflow > 0 { FillBar(filled: filledCount, total: seats.count) }
        }
        .accessibilityElement(children: .contain)
    }

    private var visible: [Seat] { seats.count > maxCells ? Array(seats.prefix(maxCells - 1)) : seats }
    private var overflow: Int { seats.count > maxCells ? seats.count - (maxCells - 1) : 0 }
    private var filledCount: Int { seats.filter { $0.state != .open && $0.state != .held }.count }
}

struct FillBar: View {
    let filled: Int
    let total: Int
    var width: CGFloat? = nil

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Pc.tonalStrong)
                Capsule().fill(Pc.ink).frame(width: geo.size.width * CGFloat(filled) / CGFloat(max(total, 1)))
            }
        }
        .frame(width: width, height: 5)
        .accessibilityLabel("\(filled) of \(total) seats taken")
    }
}

enum SeatBuilder {
    /// Builds a hosted-trip seat row from TripLite data (host first, faces, then anonymous members, then open).
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
