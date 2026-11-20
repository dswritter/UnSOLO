import Foundation
import ImageIO
import UIKit
import CryptoKit
import UniformTypeIdentifiers

/// UIImage wrapper so decoded images can cross actor boundaries.
struct DecodedImage: @unchecked Sendable {
    let image: UIImage
}

/// Thread-safe NSCache wrapper (NSCache is internally synchronised).
final class MemoryImageCache: @unchecked Sendable {
    private let cache = NSCache<NSString, UIImage>()
    init(totalCostLimit: Int) {
        cache.totalCostLimit = totalCostLimit
        cache.countLimit = 400
    }
    func get(_ key: String) -> UIImage? { cache.object(forKey: key as NSString) }
    func set(_ image: UIImage, for key: String) {
        let cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4)
        cache.setObject(image, forKey: key as NSString, cost: cost)
    }
    func removeAll() { cache.removeAllObjects() }
}

/// Loads, caches and downsamples images.
/// - Memory: NSCache of decoded, downsampled bitmaps (keyed by URL + pixel bucket).
/// - Disk: original bytes in Caches/images, LRU by file modification date, capped at ~150 MB.
/// - Sources: https/http, `data:` (LQIP), `file:` (local uploads) and `demo:` (generated placeholders).
actor ImagePipeline {
    static let shared = ImagePipeline()

    nonisolated let memory = MemoryImageCache(totalCostLimit: 60 * 1024 * 1024)
    private let directory: URL
    private let diskLimit: Int
    private var inFlight: [String: Task<Data?, Never>] = [:]
    private var writesSinceTrim = 0
    private let session: URLSession

    init(diskLimit: Int = 150 * 1024 * 1024, directoryName: String = "images") {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        directory = caches.appendingPathComponent(directoryName, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        self.diskLimit = diskLimit
        let config = URLSessionConfiguration.default
        config.urlCache = nil // bytes are cached on disk by this pipeline
        config.httpAdditionalHeaders = ["X-UnSOLO-Client": AppInfo.clientHeader]
        config.waitsForConnectivity = false
        session = URLSession(configuration: config)
    }

    nonisolated static func cacheKey(_ url: String, maxPixel: CGFloat) -> String {
        // Bucket pixel sizes so near-identical layouts share one decoded bitmap.
        let bucket = max(64, Int((maxPixel / 64).rounded(.up)) * 64)
        return "\(url)#\(bucket)"
    }

    nonisolated func memoryImage(_ url: String, maxPixel: CGFloat) -> UIImage? {
        memory.get(Self.cacheKey(url, maxPixel: maxPixel))
    }

    func image(_ url: String, maxPixel: CGFloat) async -> DecodedImage? {
        let key = Self.cacheKey(url, maxPixel: maxPixel)
        if let hit = memory.get(key) { return DecodedImage(image: hit) }
        guard let data = await data(for: url, maxPixel: maxPixel) else { return nil }
        guard let image = Self.downsample(data: data, maxPixel: maxPixel) else { return nil }
        memory.set(image, for: key)
        return DecodedImage(image: image)
    }

    // MARK: Data

    private func data(for urlString: String, maxPixel: CGFloat) async -> Data? {
        if urlString.hasPrefix("data:") { return Self.decodeDataURI(urlString) }
        guard let url = URL(string: urlString) else { return nil }
        switch url.scheme {
        case "demo":
            return DemoImageRenderer.render(url: url, maxPixel: maxPixel)
        case "file":
            return try? Data(contentsOf: url)
        case "https", "http":
            break
        default:
            return nil
        }
        let file = diskURL(for: urlString)
        if let data = try? Data(contentsOf: file) {
            touch(file)
            return data
        }
        if let task = inFlight[urlString] { return await task.value }
        let session = self.session
        let task = Task<Data?, Never> {
            do {
                let (data, response) = try await session.data(from: url)
                guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
                return data
            } catch {
                return nil
            }
        }
        inFlight[urlString] = task
        let data = await task.value
        inFlight[urlString] = nil
        if let data {
            try? data.write(to: file, options: .atomic)
            writesSinceTrim += 1
            if writesSinceTrim >= 20 {
                writesSinceTrim = 0
                trimDisk()
            }
        }
        return data
    }

    private func diskURL(for url: String) -> URL {
        let digest = SHA256.hash(data: Data(url.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(digest)
    }

    private func touch(_ file: URL) {
        try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
    }

    /// LRU trim: delete least-recently used files until the folder is under the limit.
    func trimDisk() {
        let keys: [URLResourceKey] = [.contentModificationDateKey, .totalFileAllocatedSizeKey]
        guard let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: keys) else { return }
        var entries: [(url: URL, date: Date, size: Int)] = files.compactMap { url in
            guard let v = try? url.resourceValues(forKeys: Set(keys)) else { return nil }
            return (url, v.contentModificationDate ?? .distantPast, v.totalFileAllocatedSize ?? 0)
        }
        var total = entries.reduce(0) { $0 + $1.size }
        guard total > diskLimit else { return }
        entries.sort { $0.date < $1.date }
        for e in entries where total > Int(Double(diskLimit) * 0.8) {
            try? FileManager.default.removeItem(at: e.url)
            total -= e.size
        }
    }

    func clearAll() {
        memory.removeAll()
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    // MARK: Decoding

    nonisolated static func decodeDataURI(_ s: String) -> Data? {
        guard let comma = s.firstIndex(of: ",") else { return nil }
        let meta = s[s.startIndex..<comma]
        let payload = String(s[s.index(after: comma)...])
        guard meta.contains(";base64") else { return payload.removingPercentEncoding?.data(using: .utf8) }
        return Data(base64Encoded: payload)
    }

    /// Downsample with ImageIO so only a view-sized bitmap is ever decoded.
    nonisolated static func downsample(data: Data, maxPixel: CGFloat) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max(1, Int(maxPixel)),
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }
}
