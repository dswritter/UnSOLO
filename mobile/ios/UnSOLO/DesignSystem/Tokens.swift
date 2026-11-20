// Generated from design/tokens.json by scripts/gen-design-tokens.mjs. Do not edit.
import SwiftUI

struct PcPalette {
    let paper: Color
    let raised: Color
    let ink: Color
    let ink2: Color
    let ink3: Color
    let rule: Color
    let rule2: Color
    let gold: Color
    let goldInk: Color
    let goldBg: Color
    let blue: Color
    let red: Color
    let green: Color
    let onInk: Color
    let onGold: Color
}

enum PcTokens {
    static let light = PcPalette(
        paper: Color(red: 0.957, green: 0.941, blue: 0.902, opacity: 1.00),
        raised: Color(red: 0.984, green: 0.976, blue: 0.953, opacity: 1.00),
        ink: Color(red: 0.086, green: 0.094, blue: 0.110, opacity: 1.00),
        ink2: Color(red: 0.373, green: 0.357, blue: 0.325, opacity: 1.00),
        ink3: Color(red: 0.549, green: 0.529, blue: 0.486, opacity: 1.00),
        rule: Color(red: 0.847, green: 0.820, blue: 0.757, opacity: 1.00),
        rule2: Color(red: 0.725, green: 0.690, blue: 0.608, opacity: 1.00),
        gold: Color(red: 0.988, green: 0.729, blue: 0.071, opacity: 1.00),
        goldInk: Color(red: 0.478, green: 0.345, blue: 0.000, opacity: 1.00),
        goldBg: Color(red: 0.988, green: 0.729, blue: 0.071, opacity: 0.18),
        blue: Color(red: 0.118, green: 0.310, blue: 0.627, opacity: 1.00),
        red: Color(red: 0.722, green: 0.196, blue: 0.110, opacity: 1.00),
        green: Color(red: 0.122, green: 0.431, blue: 0.275, opacity: 1.00),
        onInk: Color(red: 0.957, green: 0.941, blue: 0.902, opacity: 1.00),
        onGold: Color(red: 0.086, green: 0.094, blue: 0.110, opacity: 1.00)
    )
    static let dark = PcPalette(
        paper: Color(red: 0.078, green: 0.086, blue: 0.102, opacity: 1.00),
        raised: Color(red: 0.110, green: 0.122, blue: 0.141, opacity: 1.00),
        ink: Color(red: 0.945, green: 0.925, blue: 0.878, opacity: 1.00),
        ink2: Color(red: 0.682, green: 0.659, blue: 0.600, opacity: 1.00),
        ink3: Color(red: 0.494, green: 0.475, blue: 0.431, opacity: 1.00),
        rule: Color(red: 0.180, green: 0.196, blue: 0.227, opacity: 1.00),
        rule2: Color(red: 0.278, green: 0.298, blue: 0.337, opacity: 1.00),
        gold: Color(red: 0.988, green: 0.729, blue: 0.071, opacity: 1.00),
        goldInk: Color(red: 0.988, green: 0.729, blue: 0.071, opacity: 1.00),
        goldBg: Color(red: 0.988, green: 0.729, blue: 0.071, opacity: 0.16),
        blue: Color(red: 0.498, green: 0.651, blue: 0.910, opacity: 1.00),
        red: Color(red: 0.941, green: 0.478, blue: 0.384, opacity: 1.00),
        green: Color(red: 0.420, green: 0.780, blue: 0.604, opacity: 1.00),
        onInk: Color(red: 0.078, green: 0.086, blue: 0.102, opacity: 1.00),
        onGold: Color(red: 0.086, green: 0.094, blue: 0.110, opacity: 1.00)
    )
    static let spaceXs: CGFloat = 4
    static let spaceS: CGFloat = 8
    static let spaceM: CGFloat = 12
    static let spaceL: CGFloat = 16
    static let spaceXl: CGFloat = 24
    static let spaceXxl: CGFloat = 32
    static let radiusS: CGFloat = 4
    static let radiusM: CGFloat = 6
    static let radiusImage: CGFloat = 12
    static let radiusButton: CGFloat = 14
    static let radiusCard: CGFloat = 16
    static let radiusSheet: CGFloat = 24
    static let radiusPill: CGFloat = 999
    static let touch: CGFloat = 44
    static let seat: CGFloat = 40
    static let seatSmall: CGFloat = 32
    static let seatTable: CGFloat = 16
    static let hairline: CGFloat = 1
    static let tabBar: CGFloat = 64
    static let topBar: CGFloat = 56
    static let buttonTall: CGFloat = 52
    static let motionFast: Double = 0.15
    static let motionStandard: Double = 0.22
    static let motionStamp: Double = 0.34
    static let imageMaxBytes = 2_097_152
}
