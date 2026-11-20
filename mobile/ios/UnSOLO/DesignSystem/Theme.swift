import SwiftUI
import UIKit

/// Adaptive "Passenger Chart" colours. Each colour resolves to `PcTokens.light` or `PcTokens.dark`
/// following the system appearance, so views never branch on colour scheme themselves.
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

    private static func adaptive(_ light: Color, _ dark: Color) -> Color {
        let l = UIColor(light), d = UIColor(dark)
        return Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? d : l })
    }

    /// Controls and fields (14), cards (16), images (12), sheets (24). Always `.continuous` corners.
    static let radius = PcTokens.radiusButton
    static let cardRadius = PcTokens.radiusCard
    static let imageRadius = PcTokens.radiusImage
    static let seatRadius = PcTokens.radiusS

    /// Soft tonal fills (ink at low opacity) used instead of outlines.
    static let tonal = ink.opacity(0.06)
    static let tonalStrong = ink.opacity(0.09)

    static func shape(_ r: CGFloat = PcTokens.radiusCard) -> RoundedRectangle { RoundedRectangle(cornerRadius: r, style: .continuous) }
}

// MARK: - Type

/// Type roles from design/tokens.json. Sizes scale with Dynamic Type through @ScaledMetric.
enum PcTextStyle {
    case display, title1, title2, title3, body, bodyStrong, small, label, num, numLarge, code

    var size: CGFloat {
        switch self {
        case .display: 32
        case .title1: 24
        case .title2: 20
        case .title3: 17
        case .body, .bodyStrong: 15
        case .small: 13
        case .label: 12
        case .num: 15
        case .numLarge: 28
        case .code: 11
        }
    }
    var weight: Font.Weight {
        switch self {
        case .display, .title1, .title2, .title3, .bodyStrong, .num, .numLarge, .code: .semibold
        case .label: .medium
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
        case .numLarge: .largeTitle
        case .small: .footnote
        case .label, .code: .caption
        }
    }
    var isTitle: Bool { [.display, .title1, .title2, .title3].contains(self) }
    var isMono: Bool { [.num, .numLarge, .code].contains(self) }
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
        if style.isTitle { return .system(size: size, weight: w).width(.condensed) }
        // Numbers (prices, dates, counts) get tabular digits; words stay proportional.
        if style.isMono { return .system(size: size, weight: w).monospacedDigit() }
        return .system(size: size, weight: w)
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
    var color: Color = Pc.rule.opacity(0.8)
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

/// Card surfaces.
/// - printed (hosted trips, stories, general cards): raised surface, soft shadow, hairline for dark mode, 16 pt.
/// - pencilled (community plans): paper with a single 1.5 pt dashed rule2 outline, 16 pt.
struct PcCardModifier: ViewModifier {
    var pencilled: Bool
    var fill: Color?
    var radius: CGFloat = Pc.cardRadius
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let shape = Pc.shape(radius)
        if pencilled {
            content
                .background(fill ?? Pc.paper, in: shape)
                .overlay(shape.strokeBorder(Pc.rule2, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
        } else {
            content
                .background(fill ?? Pc.raised, in: shape)
                .overlay(shape.strokeBorder(Pc.rule.opacity(scheme == .dark ? 1 : 0.55), lineWidth: 0.5))
                .shadow(color: .black.opacity(scheme == .dark ? 0 : 0.06), radius: 12, x: 0, y: 2)
        }
    }
}

/// Filled input field: tonal fill, no hard outline.
struct PcFieldModifier: ViewModifier {
    var focused = false
    func body(content: Content) -> some View {
        content
            .background(focused ? Pc.tonalStrong : Pc.tonal, in: Pc.shape(Pc.radius))
    }
}

extension View {
    /// Legacy name kept for call sites: `dashed` → pencilled card, otherwise printed card.
    /// `color` is ignored (no ink outlines); `fill` overrides the surface.
    func ruledFrame(dashed: Bool = false, color: Color = Pc.rule2, fill: Color = Pc.raised) -> some View {
        modifier(PcCardModifier(pencilled: dashed, fill: dashed ? (fill == Pc.raised ? nil : fill) : fill))
    }

    func pcCard(radius: CGFloat = Pc.cardRadius) -> some View { modifier(PcCardModifier(pencilled: false, fill: nil, radius: radius)) }
    func pcPencilled() -> some View { modifier(PcCardModifier(pencilled: true, fill: nil)) }
    func pcField(focused: Bool = false) -> some View { modifier(PcFieldModifier(focused: focused)) }

    /// Selectable card: printed, with an ink ring when selected (selection also gets a checkmark at call sites).
    func pcSelectable(_ selected: Bool) -> some View {
        pcCard().overlay(Pc.shape().strokeBorder(selected ? Pc.ink : .clear, lineWidth: 1.5))
    }

    /// Screen ground colour. Explicit so dark mode follows the token palette.
    func pcScreen() -> some View {
        background(Pc.paper.ignoresSafeArea())
    }

    /// System sheet with the large token corner radius.
    func pcSheet() -> some View {
        presentationCornerRadius(PcTokens.radiusSheet).presentationBackground(Pc.paper)
    }
}
