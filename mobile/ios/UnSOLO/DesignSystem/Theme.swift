import SwiftUI
import UIKit

/// Adaptive "Full Circle" colours. Each colour resolves to `PcTokens.light` or `PcTokens.dark`
/// following the system appearance, so views never branch on colour scheme themselves.
///
/// Roles (docs/revamp/design-system.md):
/// - `paper` base, `raised` surface, `ink` text, `rule` border (names kept from Passenger Chart).
/// - `pine` is the PRIMARY FILL (UnSOLO yellow) with `onPine` (black) text: primary buttons, selected chips, the + tab.
///   Never use it for text, icons or lines on light surfaces (1.7:1); use `accentInk` (or `ink`) instead.
/// - `taken` (ink) draws taken seats; `accentInk` is the accent text/link colour.
/// - `gold` marks only *you*, the HOST badge and the wordmark.
/// - `rose` always comes with the "Women only" label and an icon.
enum Pc {
    static let paper = adaptive(PcTokens.light.paper, PcTokens.dark.paper)
    static let raised = adaptive(PcTokens.light.raised, PcTokens.dark.raised)
    static let ink = adaptive(PcTokens.light.ink, PcTokens.dark.ink)
    static let ink2 = adaptive(PcTokens.light.ink2, PcTokens.dark.ink2)
    static let ink3 = adaptive(PcTokens.light.ink3, PcTokens.dark.ink3)
    static let rule = adaptive(PcTokens.light.rule, PcTokens.dark.rule)
    static let rule2 = adaptive(PcTokens.light.rule2, PcTokens.dark.rule2)
    static let gold = adaptive(PcTokens.light.gold, PcTokens.dark.gold)
    static let goldInk = adaptive(PcTokens.light.goldInk, PcTokens.dark.goldInk)
    static let goldBg = adaptive(PcTokens.light.goldBg, PcTokens.dark.goldBg)
    static let blue = adaptive(PcTokens.light.blue, PcTokens.dark.blue)
    static let red = adaptive(PcTokens.light.red, PcTokens.dark.red)
    static let green = adaptive(PcTokens.light.green, PcTokens.dark.green)
    static let onInk = adaptive(PcTokens.light.onInk, PcTokens.dark.onInk)
    static let onGold = adaptive(PcTokens.light.onGold, PcTokens.dark.onGold)
    static let pine = adaptive(PcTokens.light.pine, PcTokens.dark.pine)
    static let onPine = adaptive(PcTokens.light.onPine, PcTokens.dark.onPine)
    static let pineSoft = adaptive(PcTokens.light.pineSoft, PcTokens.dark.pineSoft)
    /// Accent text, links, eyebrows, active tab, verified tick, selected text (dark gold on light, yellow on dark).
    static let accentInk = adaptive(PcTokens.light.accentInk, PcTokens.dark.accentInk)
    /// Taken-seat arcs, seat dots and the mini-arc fill (ink). Dot text uses `raised` on top.
    static let taken = adaptive(PcTokens.light.taken, PcTokens.dark.taken)
    /// Soft tonal fill (quiet buttons, selected tab pill, poll rows, inline cards).
    static let tonal = adaptive(PcTokens.light.tonal, PcTokens.dark.tonal)
    /// One step stronger than `tonal` (pressed states, poll result bars). Uses the border colour.
    static let tonalStrong = rule
    static let seatOpen = adaptive(PcTokens.light.seatOpen, PcTokens.dark.seatOpen)
    static let rose = adaptive(PcTokens.light.rose, PcTokens.dark.rose)
    static let roseSoft = adaptive(PcTokens.light.roseSoft, PcTokens.dark.roseSoft)
    static let roseOpen = adaptive(PcTokens.light.roseOpen, PcTokens.dark.roseOpen)
    /// Sold out ("Full circle").
    static let full = adaptive(PcTokens.light.full, PcTokens.dark.full)
    /// Your choice / your selection highlight (sun-tinted).
    static let selected = adaptive(PcTokens.light.selected, PcTokens.dark.selected)
    static let scrim = adaptive(PcTokens.light.scrim, PcTokens.dark.scrim)
    /// Ink edge used under "you" (gold) strokes and the HOST badge: ink in light mode, near-white in dark.
    static let stroke = ink
    /// Wordmark "UN": deep gold on light (contrast), sun gold on dark.
    static let wordmarkGold = adaptive(PcTokens.light.full, PcTokens.dark.gold)

    private static func adaptive(_ light: Color, _ dark: Color) -> Color {
        let l = UIColor(light), d = UIColor(dark)
        return Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? d : l })
    }

    /// Fields and inline note boxes (18). Buttons and chips are capsules; cards 28; images 20; sheets 28.
    static let radius: CGFloat = 18
    static let cardRadius = PcTokens.radiusCard
    static let imageRadius = PcTokens.radiusImage
    static let seatRadius = PcTokens.radiusS

    static func shape(_ r: CGFloat = PcTokens.radiusCard) -> RoundedRectangle { RoundedRectangle(cornerRadius: r, style: .continuous) }
}

// MARK: - Type

/// Type roles. Display, titles and prices use SF Pro Rounded (heavy/bold); body uses SF Pro.
/// Sizes scale with Dynamic Type through @ScaledMetric.
enum PcTextStyle {
    case display, title1, title2, title3, body, bodyStrong, small, label, num, numLarge, price, code

    var size: CGFloat {
        switch self {
        case .display: 32
        case .title1: 26
        case .title2: 21
        case .title3: 17
        case .body, .bodyStrong: 15
        case .small: 13
        case .label: 12
        case .num: 16
        case .numLarge: 28
        case .price: 22
        case .code: 11
        }
    }
    var weight: Font.Weight {
        switch self {
        case .display, .title1, .numLarge, .price: .heavy
        case .title2, .title3, .num: .bold
        case .bodyStrong, .code: .semibold
        case .label: .semibold
        case .body, .small: .regular
        }
    }
    var relative: Font.TextStyle {
        switch self {
        case .display: .largeTitle
        case .title1: .title
        case .title2: .title2
        case .title3: .headline
        case .body, .bodyStrong, .num: .body
        case .numLarge, .price: .title2
        case .small: .footnote
        case .label, .code: .caption
        }
    }
    var isRounded: Bool { [.display, .title1, .title2, .title3, .num, .numLarge, .price].contains(self) }
    var isMono: Bool { [.num, .numLarge, .price, .code].contains(self) }
}

struct PcFontModifier: ViewModifier {
    let style: PcTextStyle
    var weight: Font.Weight?
    @ScaledMetric private var size: CGFloat

    init(style: PcTextStyle, weight: Font.Weight? = nil) {
        self.style = style
        self.weight = weight
        _size = ScaledMetric(wrappedValue: style.size, relativeTo: style.relative)
    }

    func body(content: Content) -> some View {
        content.font(PcFont.make(style, size: size, weight: weight))
    }
}

enum PcFont {
    static func make(_ style: PcTextStyle, size: CGFloat, weight: Font.Weight? = nil) -> Font {
        let w = weight ?? style.weight
        var f: Font = .system(size: size, weight: w, design: style.isRounded ? .rounded : .default)
        // Numbers (prices, dates, counts) get tabular digits; words stay proportional.
        if style.isMono { f = f.monospacedDigit() }
        return f
    }

    /// Rounded display font at an explicit size (ring centre numbers, date chips).
    static func rounded(_ size: CGFloat, _ weight: Font.Weight = .heavy) -> Font {
        .system(size: size, weight: weight, design: .rounded).monospacedDigit()
    }
}

extension View {
    func pcFont(_ style: PcTextStyle, weight: Font.Weight? = nil) -> some View {
        modifier(PcFontModifier(style: style, weight: weight))
    }
}

// MARK: - Rules

struct HairlineRule: View {
    var dashed = false
    var color: Color = Pc.rule
    var vertical = false

    var body: some View {
        if dashed {
            DashedLine(vertical: vertical)
                .stroke(color, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                .frame(width: vertical ? 1 : nil, height: vertical ? nil : 1)
        } else {
            Rectangle().fill(color)
                .frame(width: vertical ? 1 : nil, height: vertical ? nil : 1)
        }
    }
}

struct DashedLine: Shape {
    var vertical = false
    func path(in rect: CGRect) -> Path {
        var p = Path()
        if vertical {
            p.move(to: CGPoint(x: rect.midX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        } else {
            p.move(to: CGPoint(x: rect.minX, y: rect.midY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        }
        return p
    }
}

/// Card surfaces: surface fill, 28 pt radius, 1 pt `rule` border, no shadow.
/// - printed (hosted trips, stories, questions, general cards): solid border.
/// - pencilled (community plans): dashed `rule2` border. Plans are pencilled in.
struct PcCardModifier: ViewModifier {
    var pencilled: Bool
    var fill: Color?
    var radius: CGFloat = Pc.cardRadius

    func body(content: Content) -> some View {
        let shape = Pc.shape(radius)
        if pencilled {
            content
                .background(fill ?? Pc.raised, in: shape)
                .overlay(shape.strokeBorder(Pc.rule2, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
        } else {
            content
                .background(fill ?? Pc.raised, in: shape)
                .overlay(shape.strokeBorder(Pc.rule, lineWidth: 1))
        }
    }
}

/// Input field: surface fill with a 1 pt rule border (2 pt pine when focused), 18 pt radius.
struct PcFieldModifier: ViewModifier {
    var focused = false
    func body(content: Content) -> some View {
        content
            .background(Pc.raised, in: Pc.shape(Pc.radius))
            .overlay(Pc.shape(Pc.radius).strokeBorder(focused ? Pc.ink : Pc.rule, lineWidth: focused ? 1.5 : 1))
    }
}

extension View {
    /// Legacy name kept for call sites: `dashed` → pencilled card, otherwise printed card.
    /// `color` is ignored; `fill` overrides the surface.
    func ruledFrame(dashed: Bool = false, color: Color = Pc.rule2, fill: Color = Pc.raised) -> some View {
        modifier(PcCardModifier(pencilled: dashed, fill: fill))
    }

    func pcCard(radius: CGFloat = Pc.cardRadius) -> some View { modifier(PcCardModifier(pencilled: false, fill: nil, radius: radius)) }
    func pcPencilled(radius: CGFloat = Pc.cardRadius) -> some View { modifier(PcCardModifier(pencilled: true, fill: nil, radius: radius)) }
    func pcField(focused: Bool = false) -> some View { modifier(PcFieldModifier(focused: focused)) }

    /// Selectable card: a 2 pt ink border when selected (selection also gets a check at call sites).
    func pcSelectable(_ selected: Bool, radius: CGFloat = Pc.cardRadius) -> some View {
        pcCard(radius: radius).overlay(Pc.shape(radius).strokeBorder(selected ? Pc.ink : .clear, lineWidth: 2))
    }

    /// Screen ground colour. Explicit so dark mode follows the token palette.
    func pcScreen() -> some View {
        background(Pc.paper.ignoresSafeArea())
    }

    /// System sheet: 28 pt top radius on the surface colour.
    func pcSheet() -> some View {
        presentationCornerRadius(PcTokens.radiusSheet).presentationBackground(Pc.raised)
    }
}
