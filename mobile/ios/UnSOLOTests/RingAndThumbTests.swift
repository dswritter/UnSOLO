import XCTest
@testable import UnSOLO

final class RingAndThumbTests: XCTestCase {
    func testDerivedThumbForSupabaseWebp() {
        let full = "https://x.supabase.co/storage/v1/object/public/images/trips/abc.webp"
        XCTAssertEqual(PcAsyncImage.derivedThumb(full), "https://x.supabase.co/storage/v1/object/public/images/trips/abc_thumb.webp")
        XCTAssertNil(PcAsyncImage.derivedThumb("https://x.supabase.co/storage/v1/object/public/images/trips/abc_thumb.webp"))
        XCTAssertNil(PcAsyncImage.derivedThumb("demo://photo/spiti?seed=1"))
        XCTAssertNil(PcAsyncImage.derivedThumb(nil))
    }

    func testSpotCountsUseSeatsTotal() {
        let c = SeatCounts(total: 12, open: 8)
        XCTAssertEqual(c.going, 4)
        XCTAssertEqual(c.accessibilityText(), "8 of 12 spots open")
        XCTAssertEqual(SeatCaption.plain(SeatCounts(total: 12, open: 12)), "12 spots open")
        XCTAssertEqual(c.short, "4 going", "under half booked")
        XCTAssertEqual(SeatCaption.plain(SeatCounts(total: 12, open: 0)), "Full")
    }
}
