import SwiftUI

/// Same list as the web (src/lib/indian-states.ts).
let indianStates = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
    "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi",
    "Jammu & Kashmir", "Ladakh", "Puducherry", "Chandigarh", "Andaman & Nicobar", "Lakshadweep",
]

/// State outlines from @svg-maps/india (CC BY 4.0), parsed once from Resources/india_map.json.
struct IndiaMapData: Sendable {
    let width: CGFloat
    let height: CGFloat
    let states: [(name: String, path: Path)]

    private struct Raw: Decodable {
        struct Location: Decodable { var name: String; var path: String }
        var viewBox: String
        var locations: [Location]
    }

    @MainActor static let shared: IndiaMapData? = load()

    static func load(bundle: Bundle = .main) -> IndiaMapData? {
        guard let url = bundle.url(forResource: "india_map", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let raw = try? JSONDecoder().decode(Raw.self, from: data) else { return nil }
        let vb = raw.viewBox.split(separator: " ").compactMap { Double($0) }
        guard vb.count == 4 else { return nil }
        return IndiaMapData(width: vb[2], height: vb[3], states: raw.locations.map { ($0.name, SVGPath.parse($0.path)) })
    }

    /// Our state names → the map's ("Jammu & Kashmir" → "Jammu and Kashmir"; Ladakh is drawn within J&K).
    static func mapName(_ state: String) -> String {
        switch state.trimmingCharacters(in: .whitespaces) {
        case "Jammu & Kashmir", "Ladakh": "Jammu and Kashmir"
        case "Andaman & Nicobar": "Andaman and Nicobar Islands"
        default: state.trimmingCharacters(in: .whitespaces)
        }
    }
}

/// Minimal SVG path parser for the map: M/m, L/l, H/h, V/v, Z/z (the outlines use only m, l, L, z).
enum SVGPath {
    static func parse(_ d: String) -> Path {
        var path = Path()
        var tokens: [String] = []
        var cur = ""
        func flush() { if !cur.isEmpty { tokens.append(cur); cur = "" } }
        var prev: Character = " "
        for ch in d {
            if ch.isLetter && ch != "e" && ch != "E" {
                flush(); tokens.append(String(ch))
            } else if ch == "," || ch == " " || ch == "\n" || ch == "\t" {
                flush()
            } else if ch == "-" && !cur.isEmpty && prev != "e" && prev != "E" {
                flush(); cur.append(ch)
            } else {
                cur.append(ch)
            }
            prev = ch
        }
        flush()

        var cmd: Character = "M"
        var p = CGPoint.zero
        var start = CGPoint.zero
        var i = 0
        func num() -> CGFloat? {
            guard i < tokens.count, let v = Double(tokens[i]) else { return nil }
            i += 1
            return CGFloat(v)
        }
        var firstInSubpath = true
        while i < tokens.count {
            if let c = tokens[i].first, tokens[i].count == 1, c.isLetter {
                cmd = c
                i += 1
                firstInSubpath = cmd == "M" || cmd == "m"
                if cmd == "z" || cmd == "Z" { path.closeSubpath(); p = start; continue }
            }
            switch cmd {
            case "M", "m", "L", "l":
                guard let x = num(), let y = num() else { i += 1; continue }
                let rel = cmd == "m" || cmd == "l"
                let pt = rel ? CGPoint(x: p.x + x, y: p.y + y) : CGPoint(x: x, y: y)
                if (cmd == "M" || cmd == "m") && firstInSubpath {
                    path.move(to: pt); start = pt; firstInSubpath = false
                    // Further pairs after a move are line-tos.
                    cmd = cmd == "m" ? "l" : "L"
                } else {
                    path.addLine(to: pt)
                }
                p = pt
            case "H", "h":
                guard let x = num() else { i += 1; continue }
                p = CGPoint(x: cmd == "h" ? p.x + x : x, y: p.y); path.addLine(to: p)
            case "V", "v":
                guard let y = num() else { i += 1; continue }
                p = CGPoint(x: p.x, y: cmd == "v" ? p.y + y : y); path.addLine(to: p)
            default:
                i += 1
            }
        }
        return path
    }
}

/// India with the states you've been to filled in (same outlines as the web).
struct IndiaMap: View {
    let visited: Set<String>

    var body: some View {
        let on = Set(visited.map(IndiaMapData.mapName))
        VStack(alignment: .leading, spacing: 4) {
            if let m = IndiaMapData.shared {
                Canvas { ctx, size in
                    let s = min(size.width / m.width, size.height / m.height)
                    ctx.translateBy(x: (size.width - m.width * s) / 2, y: (size.height - m.height * s) / 2)
                    ctx.scaleBy(x: s, y: s)
                    for (name, path) in m.states {
                        ctx.fill(path, with: .color(on.contains(name) ? Pc.gold : Pc.tonal))
                        ctx.stroke(path, with: .color(Pc.paper), lineWidth: 0.8 / max(s, 0.3))
                    }
                }
                .aspectRatio(m.width / m.height, contentMode: .fit)
                .accessibilityElement()
                .accessibilityLabel("Map of India: \(on.count) states visited")
            }
            Text("Map outlines: @svg-maps/india (CC BY 4.0)").pcFont(.label).foregroundStyle(Pc.ink3)
        }
    }
}
