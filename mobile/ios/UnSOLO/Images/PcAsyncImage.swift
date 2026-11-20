import SwiftUI
import UIKit

private struct DataSaverKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// When on, images load the thumbnail only (Settings → Data saver).
    var dataSaver: Bool {
        get { self[DataSaverKey.self] }
        set { self[DataSaverKey.self] = newValue }
    }
}

/// Progressive image: LQIP (or a ruled placeholder) → thumbnail → full image, crossfading between steps.
/// Every step is decoded at the rendered size via ImageIO downsampling.
struct PcAsyncImage: View {
    let url: String?
    var thumbUrl: String?
    var lqip: String?
    var targetSize: CGSize?
    var contentMode: ContentMode = .fill

    @Environment(\.dataSaver) private var dataSaver
    @Environment(\.displayScale) private var displayScale
    @State private var image: UIImage?
    @State private var isFull = false

    init(url: String?, thumbUrl: String? = nil, lqip: String? = nil, targetSize: CGSize? = nil, contentMode: ContentMode = .fill) {
        self.url = url
        self.thumbUrl = thumbUrl ?? Self.derivedThumb(url)
        self.lqip = lqip
        self.targetSize = targetSize
        self.contentMode = contentMode
    }

    /// Supabase public images have a 320 px sibling: `…/storage/v1/object/public/images/…x.webp` → `…x_thumb.webp`.
    /// Used when the API sends no `thumbUrl`, so the thumb paints first and the full image (sized to the layout) follows.
    static func derivedThumb(_ url: String?) -> String? {
        guard let url, url.contains("/storage/v1/object/public/images/"), url.hasSuffix(".webp"), !url.hasSuffix("_thumb.webp") else { return nil }
        return String(url.dropLast(".webp".count)) + "_thumb.webp"
    }

    init(media: Media?, targetSize: CGSize? = nil, contentMode: ContentMode = .fill) {
        self.init(url: media?.url, thumbUrl: media?.thumbUrl, lqip: media?.lqip, targetSize: targetSize, contentMode: contentMode)
    }

    var body: some View {
        GeometryReader { geo in
            let size = targetSize ?? geo.size
            ZStack {
                Rectangle().fill(Pc.rule.opacity(0.6))
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: contentMode)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                        .transition(.opacity)
                        .id(isFull)
                }
            }
            .task(id: TaskKey(url: url, thumb: thumbUrl, saver: dataSaver, w: Int(size.width), h: Int(size.height))) {
                await load(size: size)
            }
        }
        .accessibilityHidden(true)
    }

    private struct TaskKey: Equatable {
        let url: String?, thumb: String?, saver: Bool, w: Int, h: Int
    }

    private func load(size: CGSize) async {
        let maxPixel = max(size.width, size.height, 32) * displayScale
        let pipeline = ImagePipeline.shared
        let fullURL = dataSaver ? (thumbUrl ?? url) : url

        if let fullURL, let hit = pipeline.memoryImage(fullURL, maxPixel: maxPixel) {
            image = hit
            isFull = true
            return
        }
        if image == nil, let lqip, let data = ImagePipeline.decodeDataURI(lqip),
           let tiny = ImagePipeline.downsample(data: data, maxPixel: 64) {
            image = tiny
        }
        if !dataSaver, let thumbUrl, thumbUrl != fullURL, image == nil || !isFull {
            if let thumb = await pipeline.image(thumbUrl, maxPixel: min(maxPixel, 640)) {
                if Task.isCancelled { return }
                withAnimation(.easeOut(duration: PcTokens.motionStandard)) { image = thumb.image }
            }
        }
        guard let fullURL else { return }
        if let full = await pipeline.image(fullURL, maxPixel: maxPixel) {
            if Task.isCancelled { return }
            withAnimation(.easeOut(duration: PcTokens.motionStandard)) {
                image = full.image
                isFull = true
            }
        }
    }
}
