import SwiftUI
import UIKit

extension StoryMath {
    /// Crop shapes for a story photo; 0 = the photo's own shape.
    static let cropAspects: [(key: String, label: String, ratio: CGFloat)] = [
        ("story", "Story", 9.0 / 16.0), ("4:5", "4:5", 4.0 / 5.0), ("1:1", "1:1", 1), ("original", "Original", 0),
    ]

    /// Keeps every frame corner on the photo: clamped in the photo's own (unturned) coordinates.
    static func clampCover(_ o: CGSize, _ s: CGFloat, _ deg: Double, _ f: CGSize, _ img: CGSize) -> CGSize {
        let r = deg * .pi / 180, c = cos(r), sn = sin(r), ac = abs(c), asn = abs(sn)
        let lx = (o.width * c + o.height * sn) / s, ly = (-o.width * sn + o.height * c) / s
        let mx = max(0, img.width / 2 - (f.width * ac + f.height * asn) / (2 * s))
        let my = max(0, img.height / 2 - (f.width * asn + f.height * ac) / (2 * s))
        let qx = min(mx, max(-mx, lx)) * s, qy = min(my, max(-my, ly)) * s
        return CGSize(width: qx * c - qy * sn, height: qx * sn + qy * c)
    }

    /// What's inside the crop frame, at the photo's own resolution (long side ≤ 2160), as a JPEG.
    static func renderCrop(_ image: UIImage, frame f: CGSize, scale s: CGFloat, angle a: Double, offset o: CGSize) -> Data? {
        guard f.width > 0, f.height > 0, s > 0 else { return nil }
        var k = 1 / s
        let long = max(f.width, f.height) * k
        if long > 2160 { k *= 2160 / long }
        let size = CGSize(width: max(1, (f.width * k).rounded()), height: max(1, (f.height * k).rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let img = image.size
        let out = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            UIColor.black.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            let c = ctx.cgContext
            c.translateBy(x: k * (f.width / 2 + o.width), y: k * (f.height / 2 + o.height))
            c.rotate(by: a * .pi / 180)
            c.scaleBy(x: s * k, y: s * k)
            image.draw(in: CGRect(x: -img.width / 2, y: -img.height / 2, width: img.width, height: img.height))
        }
        return out.jpegData(compressionQuality: 0.92)
    }
}

/// Crop a story photo, Instagram style: pick a shape (Story, 4:5, square, original), two fingers zoom and
/// twist it (snaps straight near quarter turns), one finger drags it, double-tap zooms, Rotate turns it a
/// quarter. The photo always covers the frame. Done hands back the cropped JPEG.
struct PhotoCropEditor: View {
    let data: Data
    let onCancel: () -> Void
    let onDone: (Data) -> Void
    @State private var image: UIImage?
    @State private var aspect = "story"
    @State private var scale: CGFloat = 0
    @State private var angle: Double = 0
    @State private var offset: CGSize = .zero
    @State private var touching = false
    @State private var saving = false
    @State private var startSnap: Double?

    var body: some View {
        VStack(spacing: 0) {
            if let image {
                GeometryReader { geo in editor(image, geo.size) }
                controls(image)
            } else {
                ProgressView().tint(.white).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .task {
            let d = data
            image = await Task.detached(priority: .userInitiated) { StoryMath.decode(d, maxEdge: 2400) }.value
            if image == nil { onCancel() }
        }
    }

    private func frame(_ box: CGSize, _ img: CGSize) -> CGSize {
        let ratio = StoryMath.cropAspects.first { $0.key == aspect }?.ratio ?? 0
        let a = ratio > 0 ? ratio : (img.height > 0 ? img.width / img.height : 1)
        let margin: CGFloat = 16
        var w = box.width - margin * 2, h = w / a
        if h > box.height - margin * 2 { h = box.height - margin * 2; w = h * a }
        return CGSize(width: max(0, w), height: max(0, h))
    }

    /// Scale and offset kept so the photo covers the frame, zoom up to 8x.
    private func settled(_ s: CGFloat, _ o: CGSize, _ f: CGSize, _ img: CGSize) -> (CGFloat, CGSize) {
        let a = StoryMath.snap(angle)
        let m = StoryMath.coverScale(f, img, a)
        let ns = min(max(s, m), m * 8)
        return (ns, StoryMath.clampCover(o, ns, a, f, img))
    }

    private func editor(_ image: UIImage, _ box: CGSize) -> some View {
        let img = image.size
        let f = frame(box, img)
        let a = StoryMath.snap(angle)
        let s = max(scale, StoryMath.coverScale(f, img, a))
        return ZStack {
            Image(uiImage: image)
                .resizable()
                .interpolation(.medium)
                .frame(width: img.width * s, height: img.height * s)
                .rotationEffect(.degrees(a))
                .offset(offset)
                .frame(width: box.width, height: box.height)
            // Dim outside the frame, outline, and a thirds grid (stronger while you move it).
            Canvas { ctx, size in
                let r = CGRect(x: (size.width - f.width) / 2, y: (size.height - f.height) / 2, width: f.width, height: f.height)
                var dim = Path(CGRect(origin: .zero, size: size))
                dim.addRect(r)
                ctx.fill(dim, with: .color(.black.opacity(0.62)), style: FillStyle(eoFill: true))
                ctx.stroke(Path(r), with: .color(.white), lineWidth: 1.5)
                var grid = Path()
                for k in 1...2 {
                    let x = r.minX + r.width * CGFloat(k) / 3, y = r.minY + r.height * CGFloat(k) / 3
                    grid.move(to: CGPoint(x: x, y: r.minY)); grid.addLine(to: CGPoint(x: x, y: r.maxY))
                    grid.move(to: CGPoint(x: r.minX, y: y)); grid.addLine(to: CGPoint(x: r.maxX, y: y))
                }
                ctx.stroke(grid, with: .color(.white.opacity(touching ? 0.45 : 0.18)), lineWidth: 1)
            }
            .allowsHitTesting(false)
            StoryGestures(
                zoomed: { true },
                center: CGPoint(x: box.width / 2, y: box.height / 2),
                onChange: { zoom, deg, pan, v in
                    if startSnap == nil { startSnap = StoryMath.snap(angle) }
                    touching = true
                    // Turn and scale about the fingers, then move with them.
                    let cur = max(scale, StoryMath.coverScale(f, img, StoryMath.snap(angle)))
                    let rad = deg * .pi / 180
                    let d = CGSize(width: offset.width - v.width, height: offset.height - v.height)
                    let r = CGSize(width: d.width * cos(rad) - d.height * sin(rad), height: d.width * sin(rad) + d.height * cos(rad))
                    angle += deg
                    let o = CGSize(width: v.width + r.width * zoom + pan.width, height: v.height + r.height * zoom + pan.height)
                    (scale, offset) = settled(cur * zoom, o, f, img)
                },
                onEnd: {
                    touching = false
                    let a = StoryMath.snap(angle)
                    if let start = startSnap, a != start, a.truncatingRemainder(dividingBy: 90) == 0 { Haptics.tick() }
                    startSnap = nil
                    angle = a
                    (scale, offset) = settled(scale, offset, f, img)
                },
                onDoubleTap: { v in
                    let m = StoryMath.coverScale(f, img, StoryMath.snap(angle))
                    let cur = max(scale, m)
                    let target = cur > m * 1.6 ? m : m * 2.5
                    let k = target / cur
                    let o = CGSize(width: v.width + (offset.width - v.width) * k, height: v.height + (offset.height - v.height) * k)
                    withAnimation(.easeOut(duration: 0.2)) { (scale, offset) = settled(target, o, f, img) }
                    Haptics.tick()
                })
        }
        .clipped()
        .onChange(of: box) { _, _ in (scale, offset) = settled(scale, offset, frame(box, img), img) }
        .onChange(of: aspect) { _, _ in scale = 0; offset = .zero }
        .accessibilityElement()
        .accessibilityLabel("Photo to crop")
        .accessibilityHint("Pinch to zoom, twist to rotate, drag to move.")
        .overlay {
            // Done reads the current frame from here.
            Color.clear.preference(key: CropFrameKey.self, value: f)
        }
        .onPreferenceChange(CropFrameKey.self) { cropFrame = $0 }
    }

    @State private var cropFrame: CGSize = .zero

    private func controls(_ image: UIImage) -> some View {
        let shown = StoryMath.snap(angle)
        let deg = Int(((shown.truncatingRemainder(dividingBy: 360) + 540).truncatingRemainder(dividingBy: 360) - 180).rounded())
        let crooked = deg % 90 != 0
        return VStack(spacing: 12) {
            Button {
                angle = (shown / 90).rounded() * 90
                (scale, offset) = settled(scale, offset, cropFrame, image.size)
                Haptics.tick()
            } label: {
                Text(crooked ? "\(deg)° · tap to straighten" : "Pinch to zoom · twist to rotate · drag to move")
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(.white.opacity(0.75))
                    .padding(.horizontal, 10).padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            .disabled(!crooked)
            HStack(spacing: 8) {
                ForEach(StoryMath.cropAspects, id: \.key) { a in
                    let on = a.key == aspect
                    Button { aspect = a.key; Haptics.tick() } label: {
                        Text(a.label).font(.system(size: 12, weight: .bold)).foregroundStyle(on ? .black : .white)
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Capsule().fill(on ? .white : .white.opacity(0.16)))
                    }
                    .buttonStyle(.pcPress)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            HStack {
                pill("Cancel", action: onCancel)
                Spacer()
                pill("Rotate", icon: "rotate.right") {
                    Haptics.tick()
                    angle = (shown / 90).rounded() * 90 + 90
                    scale = 0
                    offset = .zero
                }
                Spacer()
                Button {
                    guard !saving, cropFrame != .zero else { return }
                    saving = true
                    let f = cropFrame, a = shown, o = offset
                    let s = max(scale, StoryMath.coverScale(f, image.size, a))
                    Task {
                        let out = await Task.detached(priority: .userInitiated) { StoryMath.renderCrop(image, frame: f, scale: s, angle: a, offset: o) }.value
                        saving = false
                        if let out { onDone(out) } else { onCancel() }
                    }
                } label: {
                    Group {
                        if saving { ProgressView().tint(.black) } else { Text("Done").font(.system(size: 15, weight: .bold)) }
                    }
                    .frame(minWidth: 44, minHeight: 24)
                }
                .buttonStyle(.pcAccent)
            }
        }
        .padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 12)
    }

    private func pill(_ label: String, icon: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon { Image(systemName: icon).font(.system(size: 15, weight: .semibold)) }
                Text(label).font(.system(size: 15, weight: .bold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 18).frame(minHeight: 44)
            .background(Capsule().fill(.white.opacity(0.16)))
        }
        .buttonStyle(.pcPress)
    }
}

private struct CropFrameKey: PreferenceKey {
    static let defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) { value = nextValue() }
}
