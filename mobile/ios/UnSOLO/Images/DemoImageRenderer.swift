import UIKit

/// Generates placeholder "photos" for demo mode so no images are downloaded.
/// URLs look like `demo://photo/spiti?seed=2`, `demo://avatar/rohan`, `demo://logo/tentit`.
enum DemoImageRenderer {
    struct Theme {
        let sky: [UIColor]
        let layers: [UIColor]
        let accent: UIColor
        let symbol: String?
        let feature: Feature
    }
    enum Feature { case none, river, flowers, gliders, snow, temple, fire, bed, bike }

    static func render(url: URL, maxPixel: CGFloat) -> Data? {
        let kind = url.host ?? "photo"
        let name = url.pathComponents.dropFirst().first ?? "spiti"
        let seed = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "seed" })?.value.flatMap(Int.init) ?? 1
        let edge = min(max(maxPixel, 64), 900)
        switch kind {
        case "avatar": return avatar(name: name, edge: min(edge, 240))
        case "logo": return logo(edge: min(edge, 240))
        default: return photo(theme: theme(name), seed: seed &+ name.hashValueStable, edge: edge)
        }
    }

    static func theme(_ name: String) -> Theme {
        func c(_ hex: UInt32) -> UIColor {
            UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                    blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        }
        switch name {
        case "spiti": return Theme(sky: [c(0x2F6FB5), c(0xA9CBEA)], layers: [c(0xC9A27A), c(0xA07650), c(0x6E4E35)], accent: c(0xF2EEE6), symbol: nil, feature: .snow)
        case "himachal", "paragliding", "bir": return Theme(sky: [c(0x3C7CC4), c(0xBFD9EF)], layers: [c(0x6F8FA6), c(0x47705A), c(0x2E5140)], accent: c(0xE3462F), symbol: nil, feature: .gliders)
        case "kheerganga", "kasol", "parvati": return Theme(sky: [c(0x8FA9B8), c(0xD9E2E3)], layers: [c(0x5D7F6C), c(0x37604A), c(0x1F3E2E)], accent: c(0xEDEBE3), symbol: nil, feature: .river)
        case "valley", "flowers": return Theme(sky: [c(0x5C94C9), c(0xCFE3F2)], layers: [c(0x8FA8B5), c(0x5E8F4E), c(0x3F7034)], accent: c(0xE77FB0), symbol: nil, feature: .flowers)
        case "rishikesh", "ganga": return Theme(sky: [c(0xE9A07A), c(0xF6D6B8)], layers: [c(0xA88A8F), c(0x6F6A73), c(0x3E5C64)], accent: c(0x4FA3A5), symbol: nil, feature: .river)
        case "tungnath", "kedar": return Theme(sky: [c(0x6E8FB8), c(0xDCE6F1)], layers: [c(0xE8EDF2), c(0xB9C5CF), c(0x6A7A86)], accent: c(0x8C4A2F), symbol: nil, feature: .temple)
        case "bhutan", "dzong": return Theme(sky: [c(0x9BB7CF), c(0xE8E2D6)], layers: [c(0x7C8D6A), c(0x55694A), c(0x34452F)], accent: c(0xB5562F), symbol: nil, feature: .temple)
        case "rupin", "alpine": return Theme(sky: [c(0x4E86C2), c(0xC9DEEF)], layers: [c(0xDDE6EE), c(0x8FA394), c(0x4B6B4F)], accent: c(0xF5F2EA), symbol: nil, feature: .snow)
        case "delhi", "lodhi", "sunrise": return Theme(sky: [c(0xF0A15A), c(0xF8DDB0)], layers: [c(0xB98868), c(0x7B6A4F), c(0x3E5A3A)], accent: c(0xFFE3A3), symbol: nil, feature: .none)
        case "camp", "bonfire": return Theme(sky: [c(0x1D2540), c(0x4B4E7A)], layers: [c(0x3D4466), c(0x2A2F48), c(0x15192B)], accent: c(0xF7A23B), symbol: nil, feature: .fire)
        case "stay", "hostel": return Theme(sky: [c(0xC98B5E), c(0xEFD2B0)], layers: [c(0xA4744F), c(0x7A5238), c(0x4E3424)], accent: c(0xF4E6CF), symbol: "bed.double.fill", feature: .bed)
        case "rental", "bike": return Theme(sky: [c(0x7FA3C2), c(0xD7E3EC)], layers: [c(0x8A8F96), c(0x5E646C), c(0x3A3F46)], accent: c(0x1C1E22), symbol: "motorcycle", feature: .bike)
        default: return Theme(sky: [c(0x4C7FB8), c(0xD3E2EF)], layers: [c(0x9AA7A0), c(0x627A68), c(0x37503F)], accent: c(0xF2EEE6), symbol: nil, feature: .none)
        }
    }

    private static func photo(theme: Theme, seed: Int, edge: CGFloat) -> Data? {
        let size = CGSize(width: edge, height: (edge * 0.72).rounded())
        var rng = SeededRandom(seed: UInt64(truncatingIfNeeded: seed))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let image = renderer.image { ctx in
            let cg = ctx.cgContext
            let colors = theme.sky.map(\.cgColor) as CFArray
            if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
                cg.drawLinearGradient(g, start: .zero, end: CGPoint(x: 0, y: size.height * 0.7), options: [.drawsAfterEndLocation])
            }
            // Sun / moon
            let sunX = size.width * rng.next(0.15, 0.85), sunY = size.height * rng.next(0.12, 0.3)
            cg.setFillColor(UIColor.white.withAlphaComponent(0.35).cgColor)
            cg.fillEllipse(in: CGRect(x: sunX, y: sunY, width: size.width * 0.09, height: size.width * 0.09))
            // Mountain layers, back to front
            for (i, color) in theme.layers.enumerated() {
                let base = size.height * (0.42 + CGFloat(i) * 0.14)
                let amp = size.height * (0.26 - CGFloat(i) * 0.06)
                let path = UIBezierPath()
                path.move(to: CGPoint(x: 0, y: size.height))
                var x: CGFloat = 0
                path.addLine(to: CGPoint(x: 0, y: base - amp * rng.next(0.2, 0.8)))
                while x < size.width {
                    x += size.width * rng.next(0.08, 0.2)
                    let peak = base - amp * rng.next(0.1, 1.0)
                    path.addLine(to: CGPoint(x: min(x, size.width), y: peak))
                }
                path.addLine(to: CGPoint(x: size.width, y: size.height))
                path.close()
                color.setFill()
                path.fill()
                if i == 0 && theme.feature == .snow {
                    UIColor.white.withAlphaComponent(0.55).setStroke()
                    path.lineWidth = max(2, size.width * 0.006)
                    path.stroke()
                }
            }
            switch theme.feature {
            case .river:
                let river = UIBezierPath()
                river.move(to: CGPoint(x: size.width * 0.35, y: size.height))
                river.addCurve(to: CGPoint(x: size.width * 0.55, y: size.height * 0.68),
                               controlPoint1: CGPoint(x: size.width * 0.6, y: size.height * 0.9),
                               controlPoint2: CGPoint(x: size.width * 0.3, y: size.height * 0.75))
                river.addLine(to: CGPoint(x: size.width * 0.6, y: size.height * 0.68))
                river.addCurve(to: CGPoint(x: size.width * 0.75, y: size.height),
                               controlPoint1: CGPoint(x: size.width * 0.45, y: size.height * 0.78),
                               controlPoint2: CGPoint(x: size.width * 0.8, y: size.height * 0.88))
                river.close()
                theme.accent.withAlphaComponent(0.85).setFill()
                river.fill()
            case .flowers:
                for _ in 0..<140 {
                    let p = CGPoint(x: size.width * rng.next(0, 1), y: size.height * rng.next(0.72, 1))
                    let r = size.width * rng.next(0.004, 0.011)
                    (rng.next(0, 1) > 0.5 ? theme.accent : UIColor(red: 0.98, green: 0.84, blue: 0.3, alpha: 1)).setFill()
                    UIBezierPath(ovalIn: CGRect(x: p.x, y: p.y, width: r * 2, height: r * 2)).fill()
                }
            case .gliders:
                let palette: [UIColor] = [theme.accent, UIColor(red: 0.95, green: 0.72, blue: 0.15, alpha: 1), UIColor(red: 0.86, green: 0.25, blue: 0.45, alpha: 1)]
                for i in 0..<5 {
                    let w = size.width * rng.next(0.06, 0.14)
                    let rect = CGRect(x: size.width * rng.next(0.05, 0.85), y: size.height * rng.next(0.08, 0.45), width: w, height: w * 0.42)
                    let canopy = UIBezierPath(arcCenter: CGPoint(x: rect.midX, y: rect.maxY), radius: w / 2, startAngle: .pi, endAngle: 0, clockwise: true)
                    canopy.addLine(to: CGPoint(x: rect.maxX - w * 0.12, y: rect.maxY))
                    canopy.addArc(withCenter: CGPoint(x: rect.midX, y: rect.maxY), radius: w / 2 - w * 0.12, startAngle: 0, endAngle: .pi, clockwise: false)
                    canopy.close()
                    palette[i % palette.count].setFill()
                    canopy.fill()
                }
            case .temple:
                let w = size.width * 0.16, h = size.height * 0.2
                let x = size.width * rng.next(0.3, 0.6), y = size.height * 0.62
                theme.accent.setFill()
                UIBezierPath(rect: CGRect(x: x, y: y, width: w, height: h)).fill()
                let roof = UIBezierPath()
                roof.move(to: CGPoint(x: x - w * 0.15, y: y))
                roof.addLine(to: CGPoint(x: x + w / 2, y: y - h * 0.8))
                roof.addLine(to: CGPoint(x: x + w * 1.15, y: y))
                roof.close()
                UIColor(white: 0.25, alpha: 1).setFill()
                roof.fill()
            case .fire:
                theme.accent.setFill()
                UIBezierPath(ovalIn: CGRect(x: size.width * 0.45, y: size.height * 0.78, width: size.width * 0.1, height: size.height * 0.12)).fill()
            case .none, .snow, .bed, .bike:
                break
            }
            if let symbol = theme.symbol,
               let img = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: size.height * 0.28, weight: .regular)) {
                let tinted = img.withTintColor(theme.accent, renderingMode: .alwaysOriginal)
                let r = CGRect(x: (size.width - tinted.size.width) / 2, y: size.height * 0.5 - tinted.size.height / 2,
                               width: tinted.size.width, height: tinted.size.height)
                tinted.draw(in: r)
            }
        }
        return image.jpegData(compressionQuality: 0.82)
    }

    private static func avatar(name: String, edge: CGFloat) -> Data? {
        var rng = SeededRandom(seed: UInt64(truncatingIfNeeded: name.hashValueStable))
        let size = CGSize(width: edge, height: edge)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let hue = rng.next(0, 1)
        let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            let bg = UIColor(hue: hue, saturation: 0.35, brightness: 0.78, alpha: 1)
            let bg2 = UIColor(hue: hue, saturation: 0.45, brightness: 0.55, alpha: 1)
            if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [bg.cgColor, bg2.cgColor] as CFArray, locations: [0, 1]) {
                ctx.cgContext.drawLinearGradient(g, start: .zero, end: CGPoint(x: edge, y: edge), options: [])
            }
            // head and shoulders silhouette
            let skin = UIColor(hue: 0.07, saturation: 0.42, brightness: rng.next(0.55, 0.85), alpha: 1)
            skin.setFill()
            UIBezierPath(ovalIn: CGRect(x: edge * 0.33, y: edge * 0.2, width: edge * 0.34, height: edge * 0.38)).fill()
            UIColor(hue: rng.next(0, 1), saturation: 0.5, brightness: 0.4, alpha: 1).setFill()
            UIBezierPath(ovalIn: CGRect(x: edge * 0.14, y: edge * 0.64, width: edge * 0.72, height: edge * 0.6)).fill()
            UIColor(white: 0.12, alpha: 1).setFill()
            UIBezierPath(ovalIn: CGRect(x: edge * 0.32, y: edge * 0.15, width: edge * 0.36, height: edge * 0.18)).fill()
        }
        return image.jpegData(compressionQuality: 0.85)
    }

    private static func logo(edge: CGFloat) -> Data? {
        let size = CGSize(width: edge, height: edge)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            UIColor(red: 0.984, green: 0.976, blue: 0.953, alpha: 1).setFill()
            UIBezierPath(rect: CGRect(origin: .zero, size: size)).fill()
            let tent = UIBezierPath()
            tent.move(to: CGPoint(x: edge * 0.5, y: edge * 0.16))
            tent.addLine(to: CGPoint(x: edge * 0.86, y: edge * 0.74))
            tent.addLine(to: CGPoint(x: edge * 0.14, y: edge * 0.74))
            tent.close()
            UIColor(red: 0.086, green: 0.094, blue: 0.11, alpha: 1).setFill()
            tent.fill()
            let inner = UIBezierPath()
            inner.move(to: CGPoint(x: edge * 0.5, y: edge * 0.32))
            inner.addLine(to: CGPoint(x: edge * 0.72, y: edge * 0.7))
            inner.addLine(to: CGPoint(x: edge * 0.28, y: edge * 0.7))
            inner.close()
            UIColor(red: 0.988, green: 0.729, blue: 0.071, alpha: 1).setFill()
            inner.fill()
        }
        return image.jpegData(compressionQuality: 0.9)
    }
}

/// Small deterministic RNG so demo images are stable between launches.
struct SeededRandom {
    private var state: UInt64
    init(seed: UInt64) { state = seed &* 6364136223846793005 &+ 1442695040888963407 }
    mutating func nextUInt() -> UInt64 {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return state >> 33
    }
    mutating func next(_ lo: CGFloat, _ hi: CGFloat) -> CGFloat {
        lo + (hi - lo) * CGFloat(nextUInt() % 10_000) / 10_000
    }
}

extension String {
    /// FNV-1a; `hashValue` is randomised per launch, this is not.
    var hashValueStable: Int {
        var h: UInt64 = 0xcbf29ce484222325
        for b in utf8 { h = (h ^ UInt64(b)) &* 0x100000001b3 }
        return Int(truncatingIfNeeded: h & 0x7FFF_FFFF)
    }
}
