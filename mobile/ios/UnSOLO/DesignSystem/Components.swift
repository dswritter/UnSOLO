import SwiftUI

// MARK: - Buttons

/// primary: filled ink capsule · outline/quiet: tonal (ink ~6 %) capsule · link: plain text · danger: plain red text.
enum PcButtonKind { case primary, outline, quiet, link, danger }

struct PcButtonStyle: ButtonStyle {
    var kind: PcButtonKind = .primary
    var fullWidth = false
    var compact = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let plain = kind == .link || kind == .danger
        configuration.label
            .pcFont(.bodyStrong)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, plain ? 4 : (compact ? 16 : 22))
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: plain ? PcTokens.touch : (compact ? 40 : PcTokens.buttonTall))
            .foregroundStyle(foreground)
            .background {
                switch kind {
                case .primary: Capsule().fill(Pc.ink.opacity(pressed ? 0.8 : 1))
                case .outline, .quiet: Capsule().fill(pressed ? Pc.tonalStrong : Pc.tonal)
                case .link, .danger: Color.clear
                }
            }
            .frame(minHeight: PcTokens.touch)
            .contentShape(Capsule())
            .scaleEffect(pressed && !plain ? 0.98 : 1)
            .opacity(isEnabled ? (pressed && plain ? 0.6 : 1) : 0.35)
            .animation(.easeOut(duration: PcTokens.motionFast), value: pressed)
    }

    private var foreground: Color {
        switch kind {
        case .primary: Pc.onInk
        case .outline, .quiet: Pc.ink
        case .link: Pc.blue
        case .danger: Pc.red
        }
    }
}

extension ButtonStyle where Self == PcButtonStyle {
    static var pcPrimary: PcButtonStyle { PcButtonStyle(kind: .primary) }
    static var pcOutline: PcButtonStyle { PcButtonStyle(kind: .outline) }
    static var pcQuiet: PcButtonStyle { PcButtonStyle(kind: .quiet) }
    static var pcLink: PcButtonStyle { PcButtonStyle(kind: .link) }
    static func pc(_ kind: PcButtonKind, fullWidth: Bool = false, compact: Bool = false) -> PcButtonStyle {
        PcButtonStyle(kind: kind, fullWidth: fullWidth, compact: compact)
    }
}

/// Round icon button (send, close…).
struct CircleIconButton: View {
    let systemName: String
    var filled = true
    var size: CGFloat = PcTokens.touch
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: size * 0.38, weight: .semibold))
                .foregroundStyle(filled ? Pc.onInk : Pc.ink)
                .frame(width: size, height: size)
                .background(Circle().fill(filled ? Pc.ink : Pc.tonal))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Tags (soft tinted capsules)

enum PcTagStyle { case host, organiser, kind, kindDashed, author, waitlist, paid, neutral }

struct PcTag: View {
    let text: String
    var style: PcTagStyle = .kind

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .tracking(0.5)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(foreground)
            .background(Capsule().fill(background))
            .accessibilityLabel(text)
    }

    private var foreground: Color {
        switch style {
        case .host: Pc.goldInk
        case .waitlist: Pc.red
        case .paid: Pc.green
        default: Pc.ink
        }
    }

    private var background: Color {
        switch style {
        case .host: Pc.goldBg
        case .waitlist: Pc.red.opacity(0.12)
        case .paid: Pc.green.opacity(0.12)
        default: Pc.ink.opacity(0.08)
        }
    }
}

// MARK: - Wordmark

struct Wordmark: View {
    var height: CGFloat = 28
    var body: some View {
        HStack(spacing: 3) {
            Text("UN")
                .font(.system(size: height * 0.68, weight: .bold).width(.condensed))
                .foregroundStyle(PcTokens.light.gold)
                .padding(.horizontal, 5)
                .frame(height: height)
                .background(PcTokens.light.ink, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            Text("SOLO")
                .font(.system(size: height * 0.68, weight: .bold).width(.condensed))
                .foregroundStyle(Pc.ink)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("UnSOLO")
    }
}

// MARK: - Avatar

/// Circle with the face, or initials on a soft tonal fill. No heavy ring.
struct Avatar: View {
    let user: UserLite?
    var size: CGFloat = 40
    var ring: Color = .clear
    var blurred = false

    var body: some View {
        ZStack {
            Circle().fill(Pc.ink.opacity(0.07))
            if let url = user?.avatarUrl {
                PcAsyncImage(url: url, targetSize: CGSize(width: size, height: size))
                    .clipShape(Circle())
                    .blur(radius: blurred ? 6 : 0)
                    .clipShape(Circle())
            } else {
                Text(user?.initials ?? "?")
                    .font(.system(size: size * 0.36, weight: .semibold))
                    .foregroundStyle(Pc.ink)
            }
        }
        .frame(width: size, height: size)
        .overlay(Circle().strokeBorder(ring, lineWidth: 1.5))
        .accessibilityLabel(user?.name ?? "Unknown")
    }
}

struct FaceStack: View {
    let users: [UserLite]
    var size: CGFloat = 24
    var extra: Int = 0

    var body: some View {
        HStack(spacing: -size * 0.3) {
            ForEach(users.prefix(4)) { u in
                Avatar(user: u, size: size).background(Circle().fill(Pc.paper).padding(-2))
            }
            if extra > 0 {
                Text("+\(extra)")
                    .font(.system(size: size * 0.4, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Pc.ink)
                    .frame(width: size, height: size)
                    .background(Circle().fill(Pc.raised))
                    .background(Circle().fill(Pc.paper).padding(-2))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(users.count + extra) people")
    }
}

// MARK: - Segmented control and chip tabs

/// Capsule segmented control: tonal track, ink capsule for the selected segment.
struct PcSegmented<T: Hashable>: View {
    let items: [(T, String)]
    @Binding var selection: T
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.0) { item in
                let selected = item.0 == selection
                Button {
                    withAnimation(.snappy(duration: PcTokens.motionStandard)) { selection = item.0 }
                } label: {
                    Text(item.1)
                        .pcFont(.bodyStrong, weight: selected ? .semibold : .medium)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .foregroundStyle(selected ? Pc.onInk : Pc.ink2)
                        .background {
                            if selected { Capsule().fill(Pc.ink).matchedGeometryEffect(id: "seg", in: ns) }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Capsule().fill(Pc.tonal))
    }
}

/// Category / filter tabs as capsule chips (selected = ink fill), scrolling horizontally.
struct ChipTabs<T: Hashable>: View {
    let items: [(T, String)]
    @Binding var selection: T
    var horizontalPadding: CGFloat = 20

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.0) { item in
                    PcChip(text: item.1, selected: item.0 == selection, showsCheck: false) {
                        withAnimation(.snappy(duration: PcTokens.motionStandard)) { selection = item.0 }
                    }
                }
            }
            .padding(.horizontal, horizontalPadding)
        }
    }
}

struct PcChip: View {
    let text: String
    var selected = false
    var icon: String?
    var dashed = false
    var showsCheck = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if selected && showsCheck { Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)) }
                else if let icon { Image(systemName: icon).font(.system(size: 13, weight: .medium)) }
                Text(text).pcFont(.bodyStrong, weight: selected ? .semibold : .medium)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 38)
            .foregroundStyle(selected ? Pc.onInk : Pc.ink)
            .background(Capsule().fill(selected ? Pc.ink : Pc.tonal))
            .overlay { if dashed && !selected { Capsule().strokeBorder(Pc.rule2, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])) } }
            .frame(minHeight: PcTokens.touch)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Facts row (calendar · dates, mappin · place, person.2 · seats)

struct Fact: Hashable {
    let symbol: String
    let text: String
    var emphasis = false
}

/// One line of icon + text facts, replacing the bordered 3-cell grid. Digits are tabular, words proportional.
struct FactsRow: View {
    let facts: [Fact]
    var body: some View {
        FlowLayout(spacing: 14, lineSpacing: 6) {
            ForEach(facts, id: \.self) { f in
                HStack(spacing: 6) {
                    Image(systemName: f.symbol).font(.system(size: 14, weight: .medium)).foregroundStyle(Pc.ink2)
                    Text(f.text).pcFont(.body, weight: f.emphasis ? .semibold : .medium).monospacedDigit()
                        .foregroundStyle(f.emphasis ? Pc.red : Pc.ink)
                        .lineLimit(1)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

// MARK: - Section header

struct SectionHeader: View {
    let title: String
    var trailing: String?
    var trailingAction: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).pcFont(.title2).foregroundStyle(Pc.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if let trailing {
                if let trailingAction {
                    Button(trailing, action: trailingAction).buttonStyle(.pcLink)
                } else {
                    Text(trailing).pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
                }
            }
        }
    }
}

/// Small overline label ("IN THE TRIBE", "NEXT DEPARTURES").
struct Overline: View {
    let text: String
    var color: Color = Pc.ink2
    var body: some View {
        Text(text.uppercased()).font(.system(size: 11, weight: .semibold)).tracking(0.8).foregroundStyle(color)
    }
}

// MARK: - Toolbar icon with badge

struct BadgeIcon: View {
    let systemName: String
    var count: Int = 0
    var dot = false
    var label: String

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Image(systemName: systemName)
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(Pc.ink)
                .frame(width: PcTokens.touch, height: PcTokens.touch)
            if count > 0 {
                Text(count > 99 ? "99+" : "\(count)")
                    .font(.system(size: 11, weight: .bold).monospacedDigit())
                    .foregroundStyle(Pc.onInk)
                    .padding(.horizontal, 4)
                    .frame(minWidth: 18, minHeight: 18)
                    .background(Capsule().fill(Pc.ink))
                    .offset(x: -2, y: 4)
            } else if dot {
                Circle().fill(Pc.red).frame(width: 8, height: 8).offset(x: -10, y: 10)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(count > 0 ? "\(label), \(count) unread" : label)
    }
}

/// Count pill (unread badges in rows).
struct CountPill: View {
    let count: Int
    var body: some View {
        Text("\(count)").font(.system(size: 12, weight: .bold).monospacedDigit()).foregroundStyle(Pc.onInk)
            .padding(.horizontal, 7).frame(minWidth: 22, minHeight: 22).background(Capsule().fill(Pc.ink))
    }
}

// MARK: - Banners

struct OfflineBanner: View {
    var text = "Offline · showing saved"
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash").font(.system(size: 13, weight: .semibold))
            Text(text).pcFont(.label)
            Spacer()
        }
        .padding(.horizontal, 20)
        .frame(minHeight: 32)
        .foregroundStyle(Pc.ink)
        .background(Pc.goldBg)
        .accessibilityElement(children: .combine)
    }
}

struct CommunityPlanLabel: View {
    var text = "Community plan · not a booking"
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark.shield").font(.system(size: 12, weight: .semibold))
            Text(text).pcFont(.label, weight: .semibold)
        }
        .foregroundStyle(Pc.ink2)
    }
}

struct VerifiedBadge: View {
    var body: some View {
        Image(systemName: "checkmark.seal.fill")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Pc.blue)
            .accessibilityLabel("Verified")
    }
}

// MARK: - Form rows

/// A labelled field on its own rounded card, with 20 pt gutters and 12 pt gaps (no full-width rules).
struct FormRow<Content: View>: View {
    let label: String
    var hint: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).pcFont(.small, weight: .medium).foregroundStyle(Pc.ink2)
            content
            if let hint { Text(hint).pcFont(.small).foregroundStyle(Pc.ink2).fixedSize(horizontal: false, vertical: true) }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .pcCard()
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }
}

/// Grouped settings/compose block: title above a rounded card.
struct CardSection<Content: View>: View {
    var title: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title { Overline(text: title).padding(.leading, 4) }
            VStack(alignment: .leading, spacing: 14) { content }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .pcCard()
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
    }
}

/// Sticky bottom bar used by detail screens and composers: summary on the left, one primary button.
struct BottomActionBar<Leading: View, Trailing: View>: View {
    @ViewBuilder var leading: Leading
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) { leading }
                .frame(maxWidth: .infinity, alignment: .leading)
            trailing
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(.bar)
        .overlay(alignment: .top) { HairlineRule(color: Pc.rule.opacity(0.6)) }
    }
}

struct EmptyState: View {
    let symbol: String
    let title: String
    var message: String?
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: symbol).font(.system(size: 28)).foregroundStyle(Pc.ink2)
                .frame(width: 64, height: 64).background(Circle().fill(Pc.tonal))
            Text(title).pcFont(.title3).foregroundStyle(Pc.ink)
            if let message { Text(message).pcFont(.small).foregroundStyle(Pc.ink2).multilineTextAlignment(.center) }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Flow layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0, x + s.width > maxWidth {
                y += lineHeight + lineSpacing
                x = 0
                lineHeight = 0
            }
            x += s.width + spacing
            widest = max(widest, x - spacing)
            lineHeight = max(lineHeight, s.height)
        }
        return CGSize(width: proposal.width ?? widest, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, lineHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX, x + s.width > bounds.maxX {
                y += lineHeight + lineSpacing
                x = bounds.minX
                lineHeight = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            lineHeight = max(lineHeight, s.height)
        }
    }
}
