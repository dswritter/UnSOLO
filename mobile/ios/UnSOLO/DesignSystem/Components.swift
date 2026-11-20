import SwiftUI

// MARK: - Press

/// Scales to 0.97 while pressed (150 ms). Under Reduce Motion it dims instead.
struct PcPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .opacity(configuration.isPressed && reduceMotion ? 0.7 : 1)
            .animation(.easeOut(duration: PcTokens.motionFast), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PcPressStyle {
    /// Plain button with the 0.97 press scale (cards, rows, icon buttons).
    static var pcPress: PcPressStyle { PcPressStyle() }
}

// MARK: - Buttons

/// primary: pine pill · outline: 1.5 pt pine outline · quiet: tonal pill · link: pine text · danger: red text.
/// Primary actions are 52 pt tall, compact ones 40 pt (hit area stays ≥ 48 pt).
enum PcButtonKind { case primary, outline, quiet, link, danger }

struct PcButtonStyle: ButtonStyle {
    var kind: PcButtonKind = .primary
    var fullWidth = false
    var compact = false
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let plain = kind == .link || kind == .danger
        configuration.label
            .font(.system(size: compact ? 14 : 16, weight: .bold))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, plain ? 4 : (compact ? 18 : 24))
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: plain ? 32 : (compact ? 40 : PcTokens.buttonTall))
            .foregroundStyle(foreground)
            .background {
                switch kind {
                case .primary: Capsule().fill(isEnabled ? Pc.pine : Pc.tonal)
                case .outline: Capsule().strokeBorder(isEnabled ? Pc.pine : Pc.rule, lineWidth: 1.5)
                case .quiet: Capsule().fill(pressed ? Pc.tonalStrong : Pc.tonal)
                case .link, .danger: Color.clear
                }
            }
            .frame(minHeight: PcTokens.touch)
            .contentShape(Capsule())
            .scaleEffect(pressed && !plain && !reduceMotion ? 0.97 : 1)
            .opacity(pressed && (plain || reduceMotion) ? 0.6 : 1)
            .animation(.easeOut(duration: PcTokens.motionFast), value: pressed)
    }

    private var foreground: Color {
        guard isEnabled else { return Pc.ink3 }
        switch kind {
        case .primary: return Pc.onPine
        case .outline, .link: return Pc.pine
        case .quiet: return Pc.ink
        case .danger: return Pc.red
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

/// Round icon button (send, close…). `filled` = pine, otherwise tonal.
struct CircleIconButton: View {
    let systemName: String
    var filled = true
    var size: CGFloat = PcTokens.touch
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: size * 0.4, weight: .bold))
                .foregroundStyle(filled ? Pc.onPine : Pc.ink)
                .frame(width: size, height: size)
                .background(Circle().fill(filled ? Pc.pine : Pc.tonal))
                .frame(minWidth: PcTokens.touch, minHeight: PcTokens.touch)
                .contentShape(Circle())
        }
        .buttonStyle(.pcPress)
        .accessibilityLabel(label)
    }
}

/// 40 pt round button on a blurred glass disc, for use over photos (back, share, save).
struct GlassIconButton: View {
    let systemName: String
    let label: String
    var tint: Color = Pc.ink
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            GlassIcon(systemName: systemName, tint: tint)
        }
        .buttonStyle(.pcPress)
        .accessibilityLabel(label)
    }
}

struct GlassIcon: View {
    let systemName: String
    var tint: Color = Pc.ink
    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(tint)
            .frame(width: 40, height: 40)
            .background(.ultraThinMaterial, in: Circle())
            .background(Pc.raised.opacity(0.55), in: Circle())
            .frame(width: PcTokens.touch, height: PcTokens.touch)
            .contentShape(Circle())
    }
}

// MARK: - Tags

/// host: sun gold with an ink edge, uppercase · organiser: surface with an ink edge · women: rose + icon ·
/// verified: tonal + pine · full: gold-tinted · waitlist/paid/kind/neutral: quiet variants.
enum PcTagStyle { case host, organiser, women, verified, full, held, kind, kindDashed, author, waitlist, paid, neutral }

struct PcTag: View {
    let text: String
    var style: PcTagStyle = .kind
    var icon: String?

    var body: some View {
        HStack(spacing: 4) {
            if let symbol = icon ?? defaultIcon {
                Image(systemName: symbol).font(.system(size: 10.5, weight: .bold))
            }
            Text(style == .host || style == .organiser ? text.uppercased() : text)
                .font(.system(size: style == .host || style == .organiser ? 10.5 : 12, weight: style == .host ? .heavy : .bold))
                .tracking(style == .host || style == .organiser ? 0.5 : 0)
                .lineLimit(1)
        }
        .padding(.horizontal, 9)
        .frame(minHeight: 22)
        .foregroundStyle(foreground)
        .background(Capsule().fill(background))
        .overlay {
            switch style {
            case .host, .organiser, .held: Capsule().strokeBorder(Pc.stroke, lineWidth: 1.5)
            case .full: Capsule().strokeBorder(Pc.full, lineWidth: 1)
            case .kindDashed: Capsule().strokeBorder(Pc.rule2, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            default: EmptyView()
            }
        }
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }

    private var defaultIcon: String? {
        switch style {
        case .women: "figure.stand.dress"
        case .full: "checkmark.circle.fill"
        default: nil
        }
    }

    private var foreground: Color {
        switch style {
        case .host: PcTokens.light.onGold
        case .organiser: Pc.ink
        case .women: Pc.rose
        case .verified, .paid: Pc.pine
        case .full: Pc.full
        case .held: Pc.ink
        case .waitlist: Pc.red
        default: Pc.ink2
        }
    }

    private var background: Color {
        switch style {
        case .host: Pc.gold
        case .organiser: Pc.raised
        case .women: Pc.roseSoft
        case .verified, .paid: Pc.tonal
        case .full: Pc.goldBg
        case .held: Pc.selected
        case .waitlist: Pc.red.opacity(0.12)
        case .kindDashed: .clear
        default: Pc.tonal
        }
    }
}

// MARK: - Wordmark

/// "UN" in gold, "SOLO" in ink, SF Pro Rounded heavy.
struct Wordmark: View {
    var height: CGFloat = 28
    var body: some View {
        (Text("UN").foregroundStyle(Pc.wordmarkGold) + Text("SOLO").foregroundStyle(Pc.ink))
            .font(.system(size: height * 0.8, weight: .heavy, design: .rounded))
            .tracking(-0.4)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("UnSOLO")
    }
}

// MARK: - Avatar

/// Circle with the face, or initials on a tonal fill.
struct Avatar: View {
    let user: UserLite?
    var size: CGFloat = 40
    var ring: Color = .clear
    var blurred = false

    var body: some View {
        ZStack {
            Circle().fill(Pc.tonal)
            if let url = user?.avatarUrl {
                PcAsyncImage(url: url, targetSize: CGSize(width: size, height: size))
                    .clipShape(Circle())
                    .blur(radius: blurred ? 6 : 0)
                    .clipShape(Circle())
            } else {
                Text(user?.initials ?? "?")
                    .font(.system(size: size * 0.36, weight: .bold, design: .rounded))
                    .foregroundStyle(Pc.pine)
            }
        }
        .frame(width: size, height: size)
        .overlay(Circle().strokeBorder(ring, lineWidth: 2))
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
                Avatar(user: u, size: size).background(Circle().fill(Pc.raised).padding(-2))
            }
            if extra > 0 {
                Text("+\(extra)")
                    .font(.system(size: size * 0.4, weight: .bold).monospacedDigit())
                    .foregroundStyle(Pc.ink)
                    .frame(width: size, height: size)
                    .background(Circle().fill(Pc.tonal))
                    .background(Circle().fill(Pc.raised).padding(-2))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(users.count + extra) people")
    }
}

// MARK: - Segmented control and chips

/// Capsule segmented control: tonal track, pine capsule for the selected segment.
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
                        .font(.system(size: 14, weight: selected ? .bold : .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .foregroundStyle(selected ? Pc.onPine : Pc.ink2)
                        .background {
                            if selected { Capsule().fill(Pc.pine).matchedGeometryEffect(id: "seg", in: ns) }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(4)
        .background(Capsule().fill(Pc.tonal))
        .frame(minHeight: PcTokens.touch)
    }
}

/// Category / filter tabs as capsule chips (selected = pine fill), scrolling horizontally.
struct ChipTabs<T: Hashable>: View {
    let items: [(T, String)]
    @Binding var selection: T
    var icons: [T: String] = [:]
    var horizontalPadding: CGFloat = 16

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.0) { item in
                    PcChip(text: item.1, selected: item.0 == selection, icon: icons[item.0], showsCheck: false) {
                        withAnimation(.snappy(duration: PcTokens.motionStandard)) { selection = item.0 }
                    }
                }
            }
            .padding(.horizontal, horizontalPadding)
        }
    }
}

/// 40 pt pill chip. Unselected: surface + 1 pt rule. Selected: pine fill.
struct PcChip: View {
    let text: String
    var selected = false
    var icon: String?
    var dashed = false
    var showsCheck = true
    var tint: Color = Pc.pine
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if selected && showsCheck { Image(systemName: "checkmark").font(.system(size: 12, weight: .heavy)) }
                else if let icon { Image(systemName: icon).font(.system(size: 14, weight: .bold)) }
                Text(text).font(.system(size: 14, weight: selected ? .bold : .semibold)).lineLimit(1)
            }
            .padding(.horizontal, 15)
            .frame(minHeight: 40)
            .foregroundStyle(selected ? Pc.onPine : Pc.ink)
            .background(Capsule().fill(selected ? tint : Pc.raised))
            .overlay {
                if !selected {
                    Capsule().strokeBorder(dashed ? Pc.rule2 : Pc.rule, style: StrokeStyle(lineWidth: 1, dash: dashed ? [4, 3] : []))
                }
            }
            .frame(minHeight: PcTokens.touch)
            .contentShape(Capsule())
        }
        .buttonStyle(.pcPress)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Facts row (calendar · dates, mappin · place, person.2 · seats)

struct Fact: Hashable {
    let symbol: String
    let text: String
    var emphasis = false
}

/// Wrapping icon + text facts (13 pt semibold ink2, ink icons). Digits are tabular.
struct FactsRow: View {
    let facts: [Fact]
    var size: CGFloat = 13
    var body: some View {
        FlowLayout(spacing: 14, lineSpacing: 6) {
            ForEach(facts, id: \.self) { f in
                HStack(spacing: 5) {
                    Image(systemName: f.symbol).font(.system(size: size + 1, weight: .bold)).foregroundStyle(Pc.ink)
                    Text(f.text).font(.system(size: size, weight: f.emphasis ? .bold : .semibold)).monospacedDigit()
                        .foregroundStyle(f.emphasis ? Pc.ink : Pc.ink2)
                        .lineLimit(1)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// Fact as an outlined chip (trip detail facts row).
struct FactChip: View {
    let symbol: String
    let text: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 14, weight: .bold))
            Text(text).font(.system(size: 14, weight: .semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.75)
        }
        .foregroundStyle(Pc.ink)
        .padding(.horizontal, 12)
        .frame(minHeight: 36)
        .background(Capsule().fill(Pc.raised))
        .overlay(Capsule().strokeBorder(Pc.rule, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Section header

struct SectionHeader: View {
    let title: String
    var trailing: String?
    var trailingAction: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).pcFont(.title2, weight: .heavy).foregroundStyle(Pc.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if let trailing {
                if let trailingAction {
                    Button(trailing, action: trailingAction).buttonStyle(.pcLink)
                } else {
                    Text(trailing).pcFont(.small, weight: .semibold).monospacedDigit().foregroundStyle(Pc.ink2)
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
        Text(text.uppercased()).font(.system(size: 11, weight: .heavy)).tracking(0.7).foregroundStyle(color)
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
                .font(.system(size: 19, weight: .bold))
                .foregroundStyle(Pc.ink)
                .frame(width: PcTokens.touch, height: PcTokens.touch)
            if count > 0 {
                Text(count > 99 ? "99+" : "\(count)")
                    .font(.system(size: 11, weight: .heavy).monospacedDigit())
                    .foregroundStyle(Pc.onPine)
                    .padding(.horizontal, 4)
                    .frame(minWidth: 18, minHeight: 18)
                    .background(Capsule().fill(Pc.pine))
                    .offset(x: -2, y: 4)
            } else if dot {
                Circle().fill(Pc.pine).frame(width: 9, height: 9)
                    .background(Circle().fill(Pc.paper).padding(-2))
                    .offset(x: -11, y: 11)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(count > 0 ? "\(label), \(count) unread" : (dot ? "\(label), new" : label))
    }
}

/// Count pill (unread badges in rows).
struct CountPill: View {
    let count: Int
    var body: some View {
        Text("\(count)").font(.system(size: 11, weight: .heavy).monospacedDigit()).foregroundStyle(Pc.onPine)
            .padding(.horizontal, 6).frame(minWidth: 20, minHeight: 20).background(Capsule().fill(Pc.pine))
    }
}

// MARK: - Banners

struct OfflineBanner: View {
    var text = "Offline · showing saved"
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash").font(.system(size: 13, weight: .bold))
            Text(text).pcFont(.label)
            Spacer()
        }
        .padding(.horizontal, 20)
        .frame(minHeight: 32)
        .foregroundStyle(Pc.ink)
        .background(Pc.selected)
        .accessibilityElement(children: .combine)
    }
}

struct CommunityPlanLabel: View {
    var text = "Community plan · not a booking"
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark.shield.fill").font(.system(size: 12, weight: .bold))
            Text(text).pcFont(.label, weight: .semibold)
        }
        .foregroundStyle(Pc.ink2)
    }
}

struct VerifiedBadge: View {
    var body: some View {
        Image(systemName: "checkmark.seal.fill")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(Pc.pine)
            .accessibilityLabel("Verified")
    }
}

// MARK: - Date chip, price

/// 46×50 surface tile with the day number (rounded heavy) and the month.
struct DateChip: View {
    let ymd: String?
    var body: some View {
        VStack(spacing: 0) {
            Text(Fmt.dayNumber(ymd)).font(PcFont.rounded(20)).foregroundStyle(Pc.ink)
            Text(Fmt.monthShort(ymd).uppercased()).font(.system(size: 11, weight: .heavy)).tracking(0.4).foregroundStyle(Pc.ink2)
        }
        .frame(width: 46, height: 50)
        .background(Pc.raised, in: Pc.shape(14))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Fmt.weekdayDayMonth(ymd))
    }
}

/// "₹14,699 /person": rounded heavy price with a small unit.
struct PriceText: View {
    let paise: Int
    var unit: String? = "/person"
    var style: PcTextStyle = .price
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(Fmt.rupees(paise)).pcFont(style).foregroundStyle(Pc.ink).lineLimit(1).fixedSize()
            if let unit { Text(unit).pcFont(.small, weight: .medium).foregroundStyle(Pc.ink2).lineLimit(1).fixedSize() }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Form rows

/// A labelled field: surface, 1 pt rule, 18 pt radius, small bold label above the value.
struct FormRow<Content: View>: View {
    let label: String
    var hint: String?
    var labelColor: Color = Pc.ink2
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(.system(size: 12, weight: .bold)).foregroundStyle(labelColor)
                content
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .pcField()
            if let hint { Text(hint).pcFont(.small).foregroundStyle(Pc.ink2).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 6) }
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
    }
}

/// Grouped settings/compose block: title above a rounded card.
struct CardSection<Content: View>: View {
    var title: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let title { Overline(text: title).padding(.leading, 6) }
            VStack(alignment: .leading, spacing: 14) { content }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .pcCard()
        }
        .padding(.horizontal, 16)
        .padding(.top, 18)
    }
}

/// Sticky bottom bar (use with `.safeAreaInset(edge: .bottom)`): blurred surface, top hairline,
/// summary on the left, one primary button on the right. Rides above the keyboard.
struct BottomActionBar<Leading: View, Trailing: View>: View {
    @ViewBuilder var leading: Leading
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) { leading }
                .frame(maxWidth: .infinity, alignment: .leading)
            trailing
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .pcBarBackground()
    }
}

extension View {
    /// Material bar background with a 1 pt top hairline, extending into the bottom safe area.
    func pcBarBackground() -> some View {
        background {
            Rectangle().fill(.regularMaterial).ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .top) { HairlineRule() }
        }
    }
}

/// Grab handle + title row for custom sheets.
struct SheetHeader: View {
    let title: String
    var subtitle: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).pcFont(.title1).foregroundStyle(Pc.ink).accessibilityAddTraits(.isHeader)
            if let subtitle { Text(subtitle).pcFont(.small).foregroundStyle(Pc.ink2).fixedSize(horizontal: false, vertical: true) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Minus / value / plus with 44 pt round buttons.
struct PcStepper: View {
    @Binding var value: Int
    let range: ClosedRange<Int>
    var label: String

    var body: some View {
        HStack(spacing: 12) {
            step("minus", enabled: value > range.lowerBound) { value -= 1 }
                .accessibilityLabel("Fewer")
            Text("\(value)").font(PcFont.rounded(18, .heavy)).foregroundStyle(Pc.ink).frame(minWidth: 22)
            step("plus", enabled: value < range.upperBound) { value += 1 }
                .accessibilityLabel("More")
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
        .accessibilityValue("\(value)")
        .accessibilityAdjustableAction { dir in
            switch dir {
            case .increment: if value < range.upperBound { value += 1 }
            case .decrement: if value > range.lowerBound { value -= 1 }
            @unknown default: break
            }
        }
    }

    private func step(_ symbol: String, enabled: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 15, weight: .heavy))
                .foregroundStyle(enabled ? Pc.ink : Pc.ink3)
                .frame(width: 40, height: 40)
                .overlay(Circle().strokeBorder(Pc.rule, lineWidth: 1.5))
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.pcPress)
        .disabled(!enabled)
    }
}

struct EmptyState: View {
    let symbol: String
    let title: String
    var message: String?
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: symbol).font(.system(size: 26, weight: .bold)).foregroundStyle(Pc.pine)
                .frame(width: 64, height: 64).background(Circle().fill(Pc.tonal))
            Text(title).pcFont(.title3).foregroundStyle(Pc.ink).multilineTextAlignment(.center)
            if let message { Text(message).pcFont(.small).foregroundStyle(Pc.ink2).multilineTextAlignment(.center) }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Search dock

/// 56 pt pill floating above the tab bar: "Where to? · Any week" plus a filter button.
struct SearchDock: View {
    let title: String
    let subtitle: String
    var activeFilters = 0
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").font(.system(size: 18, weight: .bold)).foregroundStyle(Pc.ink)
                    .padding(.leading, 18)
                (Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(Pc.ink)
                    + Text("  ·  \(subtitle)").font(.system(size: 14, weight: .medium)).foregroundStyle(Pc.ink2))
                    .lineLimit(1)
                Spacer(minLength: 4)
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "slider.horizontal.3").font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Pc.onPine)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Pc.pine))
                    if activeFilters > 0 {
                        Text("\(activeFilters)").font(.system(size: 10, weight: .heavy)).foregroundStyle(PcTokens.light.onGold)
                            .frame(width: 17, height: 17).background(Circle().fill(Pc.gold))
                            .offset(x: 3, y: -3)
                    }
                }
                .padding(.trailing, 6)
            }
            .frame(height: PcTokens.searchDock)
            .background(Capsule().fill(Pc.raised))
            .overlay(Capsule().strokeBorder(Pc.rule, lineWidth: 1))
            .shadow(color: .black.opacity(0.12), radius: 14, y: 6)
            .contentShape(Capsule())
        }
        .buttonStyle(.pcPress)
        .accessibilityLabel("Search trips. \(title), \(subtitle)\(activeFilters > 0 ? ", \(activeFilters) filters on" : "")")
        .accessibilityAddTraits(.isSearchField)
    }
}

// MARK: - Toggle

/// Toggle tinted pine (rose for women-only).
struct PcToggleRow: View {
    let title: String
    var subtitle: String?
    var icon: String?
    var tint: Color = Pc.pine
    var titleColor: Color = Pc.ink
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    if let icon { Image(systemName: icon).font(.system(size: 13, weight: .bold)) }
                    Text(title).font(.system(size: 15, weight: .bold))
                }
                .foregroundStyle(titleColor)
                if let subtitle { Text(subtitle).pcFont(.small).foregroundStyle(Pc.ink2).fixedSize(horizontal: false, vertical: true) }
            }
        }
        .tint(tint)
        .frame(minHeight: PcTokens.touch)
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
            let s = measure(v, maxWidth)
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

    /// Natural size, but never wider than the line (long items truncate instead of overflowing).
    private func measure(_ v: LayoutSubview, _ maxWidth: CGFloat) -> CGSize {
        let s = v.sizeThatFits(.unspecified)
        guard maxWidth.isFinite, s.width > maxWidth else { return s }
        return v.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, lineHeight: CGFloat = 0
        for v in subviews {
            let s = measure(v, bounds.width)
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
