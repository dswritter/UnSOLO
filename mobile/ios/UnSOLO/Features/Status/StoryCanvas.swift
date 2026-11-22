import ImageIO
import SwiftUI
import UIKit

/// How a photo sits in the 9:16 story. `scale` 0 = not touched yet (shown whole).
/// `scale` is frame points per image pixel, `angle` in degrees, `offset` from the frame's centre in points.
struct StoryFit: Equatable {
    var scale: CGFloat = 0
    var angle: Double = 0
    var offset: CGSize = .zero
    var frame: CGSize = .zero
    var touched: Bool { scale > 0 }
}

/// The geometry behind the in-place story editor (same rules as Android's StoryCanvas).
enum StoryMath {
    static let maxZoom: CGFloat = 8

    /// Straight within 3° of a quarter turn.
    static func snap(_ a: Double) -> Double {
        let q = (a / 90).rounded() * 90
        return abs(a - q) < 3 ? q : a
    }

    /// The turned photo's bounding box.
    static func bbox(_ img: CGSize, _ deg: Double) -> CGSize {
        let r = deg * .pi / 180, c = abs(cos(r)), s = abs(sin(r))
        return CGSize(width: img.width * c + img.height * s, height: img.width * s + img.height * c)
    }

    /// The whole (turned) photo fits inside the frame.
    static func fitScale(_ f: CGSize, _ img: CGSize, _ deg: Double) -> CGFloat {
        let b = bbox(img, deg)
        guard b.width > 0, b.height > 0 else { return 1 }
        return min(f.width / b.width, f.height / b.height)
    }

    /// The smallest scale at which the turned photo covers the whole frame.
    static func coverScale(_ f: CGSize, _ img: CGSize, _ deg: Double) -> CGFloat {
        guard img.width > 0, img.height > 0 else { return 1 }
        let r = deg * .pi / 180, c = abs(cos(r)), s = abs(sin(r))
        return max((f.width * c + f.height * s) / img.width, (f.width * s + f.height * c) / img.height)
    }

    /// Bigger than the frame on an axis: no gap on that axis. Smaller: it stays inside the frame.
    static func clamp(_ o: CGSize, _ s: CGFloat, _ f: CGSize, _ img: CGSize, _ deg: Double) -> CGSize {
        let b = bbox(img, deg)
        let mx = abs(b.width * s - f.width) / 2, my = abs(b.height * s - f.height) / 2
        return CGSize(width: min(mx, max(-mx, o.width)), height: min(my, max(-my, o.height)))
    }

    /// The biggest 9:16 frame that fits.
    static func frame(in box: CGSize) -> CGSize {
        guard box.width > 0, box.height > 0 else { return .zero }
        var w = box.width, h = w * 16 / 9
        if h > box.height { h = box.height; w = h * 9 / 16 }
        return CGSize(width: w, height: h)
    }

    /// Double-tap: fill the frame, or back to whole if it's already zoomed in, keeping the tapped point still.
    static func toggled(_ fit: StoryFit, img: CGSize, at v: CGSize) -> StoryFit {
        let a = snap(fit.angle)
        let whole = fitScale(fit.frame, img, a)
        let current = fit.touched ? max(fit.scale, whole) : whole
        let target = current > whole * 1.05 ? whole : coverScale(fit.frame, img, a)
        let k = target / current
        var out = fit
        out.scale = target
        out.offset = clamp(CGSize(width: v.width + (fit.offset.width - v.width) * k, height: v.height + (fit.offset.height - v.height) * k),
                           target, fit.frame, img, a)
        return out
    }

    /// Zoom by `zoom` and turn by `degrees` about `pivot` (from the frame's centre), then move by `pan`.
    static func moved(_ fit: StoryFit, img: CGSize, zoom: CGFloat, degrees: Double, pan: CGSize, pivot v: CGSize) -> StoryFit {
        let start = fit.touched ? fit.scale : fitScale(fit.frame, img, snap(fit.angle))
        let rad = degrees * .pi / 180
        let d = CGSize(width: fit.offset.width - v.width, height: fit.offset.height - v.height)
        let r = CGSize(width: d.width * cos(rad) - d.height * sin(rad), height: d.width * sin(rad) + d.height * cos(rad))
        let angle = fit.angle + degrees, a = snap(angle)
        let s = min(max(start * zoom, fitScale(fit.frame, img, a)), coverScale(fit.frame, img, a) * maxZoom)
        var out = fit
        out.scale = s
        out.angle = angle
        out.offset = clamp(CGSize(width: v.width + r.width * zoom + pan.width, height: v.height + r.height * zoom + pan.height), s, fit.frame, img, a)
        return out
    }

    /// What you see in the frame as a 9:16 JPEG (black where the photo doesn't reach), long side ≤ 2160.
    static func render(_ image: UIImage, fit: StoryFit) -> Data? {
        let f = fit.frame, img = image.size
        guard f.width > 0, f.height > 0, img.width > 0 else { return nil }
        let a = snap(fit.angle)
        let s = max(fit.scale, fitScale(f, img, a))
        // About one output pixel per photo pixel, within 1280…2160 tall.
        let outH = min(2160, max(1280, (f.height / s).rounded()))
        let k = outH / f.height
        let size = CGSize(width: (f.width * k).rounded(), height: outH)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let out = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            UIColor.black.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            let c = ctx.cgContext
            c.translateBy(x: size.width / 2 + fit.offset.width * k, y: size.height / 2 + fit.offset.height * k)
            c.rotate(by: a * .pi / 180)
            c.scaleBy(x: s * k, y: s * k)
            image.draw(in: CGRect(x: -img.width / 2, y: -img.height / 2, width: img.width, height: img.height))
        }
        return out.jpegData(compressionQuality: 0.9)
    }

    /// Upright, long side ≤ `maxEdge` pixels, at scale 1 (so a point is a pixel).
    static func decode(_ data: Data, maxEdge: Int = 2160) -> UIImage? {
        guard let src = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let opts: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
                                     kCGImageSourceThumbnailMaxPixelSize: maxEdge, kCGImageSourceShouldCacheImmediately: true]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { return nil }
        return UIImage(cgImage: cg, scale: 1, orientation: .up)
    }
}

/// The story preview you edit in place, Instagram style: two fingers zoom and twist the photo (it snaps
/// straight near quarter turns), one finger drags it once it's zoomed in, double-tap fills or shows it whole.
/// One-finger swipes on a photo shown whole are left to the pager.
struct StoryCanvas: View {
    let image: UIImage
    @Binding var fit: StoryFit
    var onMove: () -> Void = {}
    @State private var touching = false

    var body: some View {
        GeometryReader { geo in
            let f = StoryMath.frame(in: geo.size)
            let img = image.size
            let a = StoryMath.snap(fit.angle)
            let s = fit.touched ? max(fit.scale, StoryMath.fitScale(f, img, a)) : StoryMath.fitScale(f, img, a)
            ZStack {
                Image(uiImage: image)
                    .resizable()
                    .interpolation(.medium)
                    .frame(width: img.width * s, height: img.height * s)
                    .rotationEffect(.degrees(a))
                    .offset(fit.offset)
                    .frame(width: geo.size.width, height: geo.size.height)
                if touching { guide(f).frame(width: f.width, height: f.height).allowsHitTesting(false) }
                StoryGestures(
                    zoomed: { s > StoryMath.fitScale(f, img, StoryMath.snap(fit.angle)) * 1.02 },
                    center: CGPoint(x: geo.size.width / 2, y: geo.size.height / 2),
                    onChange: { zoom, deg, pan, pivot in
                        var cur = fit
                        cur.frame = f
                        let before = StoryMath.snap(cur.angle)
                        let next = StoryMath.moved(cur, img: img, zoom: zoom, degrees: deg, pan: pan, pivot: pivot)
                        let after = StoryMath.snap(next.angle)
                        if after != before, after.truncatingRemainder(dividingBy: 90) == 0 { Haptics.tick() }
                        fit = next
                        touching = true
                        onMove()
                    },
                    onEnd: {
                        touching = false
                        guard fit.touched else { return }
                        let a = StoryMath.snap(fit.angle)
                        var done = fit
                        done.angle = a
                        done.scale = max(fit.scale, StoryMath.fitScale(f, img, a))
                        done.offset = StoryMath.clamp(fit.offset, done.scale, f, img, a)
                        fit = done
                    },
                    onDoubleTap: { v in
                        var cur = fit
                        cur.frame = f
                        withAnimation(.easeOut(duration: 0.2)) { fit = StoryMath.toggled(cur, img: img, at: v) }
                        Haptics.tick()
                        onMove()
                    })
            }
            .onAppear { if fit.frame != f { fit.frame = f } }
            .onChange(of: geo.size) { _, _ in fit.frame = StoryMath.frame(in: geo.size) }
        }
        .accessibilityElement()
        .accessibilityLabel("Story photo")
        .accessibilityHint("Pinch, twist or drag to fit it. Double-tap to fill the story or show it whole.")
        .accessibilityAction(named: "Fill the story or show it whole") {
            if fit.frame != .zero { fit = StoryMath.toggled(fit, img: image.size, at: .zero); onMove() }
        }
    }

    /// The story's edges and a thirds grid while you move it.
    private func guide(_ f: CGSize) -> some View {
        Canvas { ctx, size in
            ctx.stroke(Path(CGRect(origin: .zero, size: size)), with: .color(.white.opacity(0.7)), lineWidth: 1)
            for k in 1...2 {
                var p = Path()
                p.move(to: CGPoint(x: size.width * CGFloat(k) / 3, y: 0)); p.addLine(to: CGPoint(x: size.width * CGFloat(k) / 3, y: size.height))
                p.move(to: CGPoint(x: 0, y: size.height * CGFloat(k) / 3)); p.addLine(to: CGPoint(x: size.width, y: size.height * CGFloat(k) / 3))
                ctx.stroke(p, with: .color(.white.opacity(0.35)), lineWidth: 1)
            }
        }
    }
}

/// UIKit recognisers, since SwiftUI's own gestures don't give the fingers' centre or a two-finger pan.
/// Pinch carries zoom and the two-finger move, rotation the twist; the one-finger pan only starts when zoomed in,
/// so otherwise the pager gets the swipe. While any of them runs, the enclosing scroll view stops paging.
private struct StoryGestures: UIViewRepresentable {
    let zoomed: () -> Bool
    let center: CGPoint
    let onChange: (CGFloat, Double, CGSize, CGSize) -> Void
    let onEnd: () -> Void
    let onDoubleTap: (CGSize) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        v.backgroundColor = .clear
        let c = context.coordinator
        let pinch = UIPinchGestureRecognizer(target: c, action: #selector(Coordinator.pinched(_:)))
        let rotate = UIRotationGestureRecognizer(target: c, action: #selector(Coordinator.rotated(_:)))
        let pan = UIPanGestureRecognizer(target: c, action: #selector(Coordinator.panned(_:)))
        pan.maximumNumberOfTouches = 1
        let tap = UITapGestureRecognizer(target: c, action: #selector(Coordinator.tapped(_:)))
        tap.numberOfTapsRequired = 2
        for g in [pinch, rotate, pan, tap] as [UIGestureRecognizer] { g.delegate = c; v.addGestureRecognizer(g) }
        c.pinch = pinch
        c.pan = pan
        return v
    }

    func updateUIView(_ uiView: UIView, context: Context) { context.coordinator.parent = self }

    @MainActor
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var parent: StoryGestures?
        weak var pinch: UIPinchGestureRecognizer?
        weak var pan: UIPanGestureRecognizer?
        private var lastCentroid: CGPoint?
        private var lastTouches = 0
        private var active = 0
        private weak var scroll: UIScrollView?
        private var scrollWas = true

        private func pivot(_ p: CGPoint) -> CGSize {
            let c = parent?.center ?? .zero
            return CGSize(width: p.x - c.x, height: p.y - c.y)
        }

        private func track(_ g: UIGestureRecognizer) {
            switch g.state {
            case .began:
                active += 1
                if active == 1, let sv = enclosingScroll(g.view) {
                    scroll = sv; scrollWas = sv.isScrollEnabled; sv.isScrollEnabled = false
                }
            case .ended, .cancelled, .failed:
                active = max(0, active - 1)
                if active == 0 {
                    scroll?.isScrollEnabled = scrollWas
                    scroll = nil
                    lastCentroid = nil
                    parent?.onEnd()
                }
            default: break
            }
        }

        private func enclosingScroll(_ v: UIView?) -> UIScrollView? {
            var cur = v?.superview
            while let c = cur { if let s = c as? UIScrollView { return s }; cur = c.superview }
            return nil
        }

        @objc func pinched(_ g: UIPinchGestureRecognizer) {
            track(g)
            guard g.state == .changed || g.state == .began, let view = g.view else { return }
            let c = g.location(in: view)
            var pan = CGSize.zero
            if let last = lastCentroid, g.numberOfTouches == lastTouches { pan = CGSize(width: c.x - last.x, height: c.y - last.y) }
            lastCentroid = c
            lastTouches = g.numberOfTouches
            parent?.onChange(g.scale, 0, pan, pivot(c))
            g.scale = 1
        }

        @objc func rotated(_ g: UIRotationGestureRecognizer) {
            track(g)
            guard g.state == .changed || g.state == .began, let view = g.view else { return }
            parent?.onChange(1, Double(g.rotation) * 180 / .pi, .zero, pivot(g.location(in: view)))
            g.rotation = 0
        }

        @objc func panned(_ g: UIPanGestureRecognizer) {
            track(g)
            guard g.state == .changed, let view = g.view else { return }
            if let p = pinch, p.state == .began || p.state == .changed { g.setTranslation(.zero, in: view); return }
            let t = g.translation(in: view)
            parent?.onChange(1, 0, CGSize(width: t.x, height: t.y), pivot(g.location(in: view)))
            g.setTranslation(.zero, in: view)
        }

        @objc func tapped(_ g: UITapGestureRecognizer) {
            guard let view = g.view else { return }
            parent?.onDoubleTap(pivot(g.location(in: view)))
        }

        func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
            if g === pan { return parent?.zoomed() ?? false }
            return true
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            other.view === g.view
        }
    }
}
