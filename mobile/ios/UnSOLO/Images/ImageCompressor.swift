import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Upload pipeline step 1: downsample (long edge ≤ 2048), re-encode to JPEG and loop quality/size
/// until the file is ≤ 2 MB. The output is written from a fresh CGImage with no source metadata,
/// so EXIF GPS (and every other EXIF/TIFF tag) is stripped.
enum ImageCompressor {
    struct Output: Sendable {
        let data: Data
        let width: Int
        let height: Int
        let quality: Double
    }

    enum Failure: Error { case unreadable, cannotEncode, tooLarge }

    static let defaultMaxBytes = PcTokens.imageMaxBytes // 2_097_152
    static let defaultMaxEdge = 2048
    static let qualities: [Double] = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]

    static func compress(_ input: Data, maxBytes: Int = defaultMaxBytes, maxEdge: Int = defaultMaxEdge) throws -> Output {
        guard let source = CGImageSourceCreateWithData(input as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else {
            throw Failure.unreadable
        }
        var edge = maxEdge
        while edge >= 320 {
            guard let image = downsample(source, maxEdge: edge) else { throw Failure.unreadable }
            for q in qualities {
                guard let data = encodeJPEG(image, quality: q) else { throw Failure.cannotEncode }
                if data.count <= maxBytes {
                    return Output(data: data, width: image.width, height: image.height, quality: q)
                }
            }
            edge = Int(Double(edge) * 0.8)
        }
        throw Failure.tooLarge
    }

    static func downsample(_ source: CGImageSource, maxEdge: Int) -> CGImage? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true, // bake EXIF orientation into pixels
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxEdge,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }

    static func encodeJPEG(_ image: CGImage, quality: Double) -> Data? {
        let out = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        // Only the quality is set: no EXIF, TIFF or GPS dictionaries are copied from the source.
        let props: [CFString: Any] = [
            kCGImageDestinationLossyCompressionQuality: quality,
            kCGImagePropertyOrientation: 1,
        ]
        CGImageDestinationAddImage(dest, image, props as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return out as Data
    }

    static func hasGPS(_ data: Data) -> Bool {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] else { return false }
        return props[kCGImagePropertyGPSDictionary] != nil
    }
}
