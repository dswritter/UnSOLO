import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import UnSOLO

final class ImageCompressorTests: XCTestCase {
    /// A 4032×3024 noisy photo-like image encoded at max quality with EXIF GPS — well over 2 MB.
    private func makeLargeJPEG(width: Int = 4032, height: Int = 3024, withGPS: Bool = true) throws -> Data {
        let cs = CGColorSpaceCreateDeviceRGB()
        let ctx = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                          space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        let buf = try XCTUnwrap(ctx.data).bindMemory(to: UInt8.self, capacity: width * height * 4)
        var seed: UInt32 = 12345
        for y in 0..<height {
            for x in 0..<width {
                seed = seed &* 1_664_525 &+ 1_013_904_223
                let noise = UInt8(truncatingIfNeeded: seed >> 24)
                let i = (y * width + x) * 4
                buf[i] = UInt8(truncatingIfNeeded: (x * 255 / width)) &+ noise / 2
                buf[i + 1] = UInt8(truncatingIfNeeded: (y * 255 / height)) &+ noise / 3
                buf[i + 2] = noise
                buf[i + 3] = 255
            }
        }
        let image = try XCTUnwrap(ctx.makeImage())
        let out = NSMutableData()
        let dest = try XCTUnwrap(CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil))
        var props: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 1.0]
        if withGPS {
            props[kCGImagePropertyGPSDictionary] = [kCGImagePropertyGPSLatitude: 32.2396, kCGImagePropertyGPSLatitudeRef: "N",
                                                    kCGImagePropertyGPSLongitude: 77.1887, kCGImagePropertyGPSLongitudeRef: "E"] as CFDictionary
        }
        CGImageDestinationAddImage(dest, image, props as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(dest))
        return out as Data
    }

    func testCompressesLargePhotoUnder2MBWithLongEdgeAtMost2048AndNoGPS() throws {
        let input = try makeLargeJPEG()
        XCTAssertGreaterThan(input.count, 2_097_152, "fixture should start above the limit")
        XCTAssertTrue(ImageCompressor.hasGPS(input), "fixture should carry GPS")

        let out = try ImageCompressor.compress(input)
        XCTAssertLessThanOrEqual(out.data.count, 2_097_152)
        XCTAssertLessThanOrEqual(max(out.width, out.height), 2048)
        XCTAssertFalse(ImageCompressor.hasGPS(out.data), "GPS must be stripped")

        let src = try XCTUnwrap(CGImageSourceCreateWithData(out.data as CFData, nil))
        XCTAssertEqual(CGImageSourceGetType(src) as String?, UTType.jpeg.identifier)
    }

    func testQualityLoopStepsDownForTightBudget() throws {
        let input = try makeLargeJPEG(width: 2400, height: 1800, withGPS: false)
        let budget = 300_000
        let out = try ImageCompressor.compress(input, maxBytes: budget)
        XCTAssertLessThanOrEqual(out.data.count, budget)
        XCTAssertLessThan(out.quality, ImageCompressor.qualities[0], "should have stepped quality (or size) down")
    }

    func testSmallImageKeepsSizeAndFirstQuality() throws {
        let input = try makeLargeJPEG(width: 800, height: 600, withGPS: false)
        let out = try ImageCompressor.compress(input)
        XCTAssertEqual(out.width, 800)
        XCTAssertEqual(out.height, 600)
        XCTAssertEqual(out.quality, ImageCompressor.qualities[0])
    }

    func testRejectsGarbage() {
        XCTAssertThrowsError(try ImageCompressor.compress(Data("not an image".utf8)))
    }

    func testDownsampleForDisplay() throws {
        let input = try makeLargeJPEG(width: 3000, height: 2000, withGPS: false)
        let img = try XCTUnwrap(ImagePipeline.downsample(data: input, maxPixel: 300))
        XCTAssertLessThanOrEqual(max(img.size.width * img.scale, img.size.height * img.scale), 300)
    }

    func testDemoRendererProducesImage() throws {
        let data = try XCTUnwrap(DemoImageRenderer.render(url: URL(string: "demo://photo/spiti?seed=2")!, maxPixel: 400))
        XCTAssertNotNil(ImagePipeline.downsample(data: data, maxPixel: 200))
    }

    func testDataURIDecoding() {
        let png1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        let data = ImagePipeline.decodeDataURI(png1x1)
        XCTAssertNotNil(data)
        XCTAssertNotNil(ImagePipeline.downsample(data: data!, maxPixel: 10))
    }
}
