import XCTest
@testable import UnSOLO

final class DeepLinkTests: XCTestCase {
    let id = "5c4aafc4-58d1-5869-a506-6700ff3b7d0e"

    func testUniversalLinks() {
        XCTAssertEqual(DeepLink.parse(URL(string: "https://unsolo.in/tribe/p/\(id)")!), .post(id: id))
        XCTAssertEqual(DeepLink.parse(URL(string: "https://www.unsolo.in/tribe/p/\(id.uppercased())")!), .post(id: id))
        XCTAssertEqual(DeepLink.parse(URL(string: "https://unsolo.in/packages/chalo-himachal")!), .trip(slug: "chalo-himachal"))
        XCTAssertEqual(DeepLink.parse(URL(string: "https://unsolo.in/packages/chalo-himachal?book=1")!), .trip(slug: "chalo-himachal"))
        XCTAssertEqual(DeepLink.parse(URL(string: "https://unsolo.in/profile/ananya.singh_1")!), .profile(username: "ananya.singh_1"))
        XCTAssertEqual(DeepLink.parse(URL(string: "https://unsolo.in/chat/\(id)")!), .chat(roomId: id))
        XCTAssertEqual(DeepLink.parse(URL(string: "https://unsolo.in/bookings")!), .bookings)
        XCTAssertEqual(DeepLink.parse(URL(string: "https://unsolo.in/tribe")!), .tribe)
        XCTAssertEqual(DeepLink.parse(URL(string: "https://unsolo.in/p/\(id)")!), .post(id: id))
    }

    func testCustomScheme() {
        XCTAssertEqual(DeepLink.parse(URL(string: "unsolo://tribe/p/\(id)")!), .post(id: id))
        XCTAssertEqual(DeepLink.parse(URL(string: "unsolo:///packages/rishikesh-weekend")!), .trip(slug: "rishikesh-weekend"))
        XCTAssertEqual(DeepLink.parse(URL(string: "unsolo://bookings")!), .bookings)
    }

    func testRejectsOtherHostsAndSchemes() {
        XCTAssertNil(DeepLink.parse(URL(string: "https://evil.example/tribe/p/\(id)")!))
        XCTAssertNil(DeepLink.parse(URL(string: "https://unsolo.in.evil.example/tribe/p/\(id)")!))
        XCTAssertNil(DeepLink.parse(URL(string: "http://unsolo.in/tribe/p/\(id)")!), "plain http is not a universal link")
        XCTAssertNil(DeepLink.parse(URL(string: "javascript:alert(1)")!))
        XCTAssertNil(DeepLink.parse(URL(string: "file:///etc/passwd")!))
    }

    func testValidatesParameters() {
        XCTAssertNil(DeepLink.parse(URL(string: "https://unsolo.in/tribe/p/not-a-uuid")!))
        XCTAssertNil(DeepLink.parse(URL(string: "https://unsolo.in/packages/..%2F..%2Fadmin")!))
        XCTAssertNil(DeepLink.parse(URL(string: "https://unsolo.in/packages/Chalo_Himachal")!), "slugs are lowercase-hyphen only")
        XCTAssertNil(DeepLink.parse(URL(string: "https://unsolo.in/profile/a")!), "username too short")
        XCTAssertNil(DeepLink.parse(URL(string: "https://unsolo.in/profile/bad%20name")!))
        XCTAssertNil(DeepLink.parse(URL(string: "https://unsolo.in/chat/1234")!))
        XCTAssertNil(DeepLink.parse(URL(string: "https://unsolo.in/admin/reports")!))
        XCTAssertNil(DeepLink.parse(URL(string: "https://unsolo.in/tribe/p/\(id)/extra/segments")!))
    }

    func testNotificationPaths() {
        XCTAssertEqual(DeepLink.parse(path: "/tribe/p/\(id)"), .post(id: id))
        XCTAssertEqual(DeepLink.parse(path: "/tribe/p/\(id)?offer=abc"), .post(id: id))
        XCTAssertEqual(DeepLink.parse(path: "/bookings"), .bookings)
        XCTAssertNil(DeepLink.parse(path: "/somewhere/else"))
    }

    func testWebURLRoundTrip() {
        for link in [DeepLink.post(id: id), .trip(slug: "spiti-winter-circuit"), .profile(username: "riyakapoor"), .chat(roomId: id), .bookings, .tribe] {
            XCTAssertEqual(DeepLink.parse(link.webURL), link)
        }
    }
}
