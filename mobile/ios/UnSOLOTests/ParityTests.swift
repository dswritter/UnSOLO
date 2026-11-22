import SwiftUI
import XCTest
@testable import UnSOLO

/// Models and helpers added for parity with the Android app.
final class ParityTests: XCTestCase {
    private let user = #"{"id":"u1","username":"asha","name":"Asha Rao","avatarUrl":null,"isPhoneVerified":true,"isIdVerified":false,"isHost":false}"#

    func testProfileWithExtendedFieldsDecodes() throws {
        let json = """
        {"user":{"id":"u1","username":"asha","name":"Asha Rao","avatarUrl":null,"isPhoneVerified":false,"isIdVerified":false,"isHost":false,
          "bio":null,"homeCity":null,"location":null,"statusText":"Still deciding my next trip","instagramUrl":null,"websiteUrl":null,
          "travelStyle":[],"isVerified":false,"joinedAt":"2026-06-16T08:56:56.097603+00:00","tripsCount":1,"followers":0,"following":0},
         "stats":{"trips":1,"states":1,"reviews":0,"listings":0,"points":115,"rank":1,"tier":{"name":"Explorer","next":"Adventurer","pointsToNext":35,"percent":65}},
         "followsYou":false,"isFollowing":false,"phone":null,
         "travel":{"states":["Uttarakhand"],"trips":[{"title":"Valley of Flowers Trek","slug":"valley-of-flowers","date":"2026-07-10"}],"mutualPlaces":[]},
         "badges":{"earned":[],"next":[{"key":"first_trip","name":"First Adventure","description":"Complete your first booking","icon":"✈️"}],"total":8},
         "listings":[],"reviewsWritten":[],"host":null,"connections":null,"posts":[],"openPlan":null}
        """
        let p = try JSON.decoder().decode(ProfileResponse.self, from: Data(json.utf8))
        XCTAssertEqual(p.stats?.tier?.percent, 65)
        XCTAssertEqual(p.travel?.states, ["Uttarakhand"])
        XCTAssertEqual(p.badges?.next?.first?.key, "first_trip")
        XCTAssertEqual(p.user.statusText, "Still deciding my next trip")
    }

    func testListingTripLiteDecodes() throws {
        let json = """
        {"id":"t1","slug":"tent-campsite","title":"Campsite","place":{"name":"Mukteshwar","slug":null,"lat":null,"lng":null},"image":null,
         "priceFromPaise":65000,"durationDays":1,"nextDeparture":null,"seatsLeft":null,"seatsTotal":null,"host":null,"goingFaces":[],
         "kind":"stay","unit":"night","webPath":"/listings/stays/tent-campsite"}
        """
        let t = try JSON.decoder().decode(TripLite.self, from: Data(json.utf8))
        XCTAssertTrue(t.isListing)
        XCTAssertEqual(t.unit, "night")
        XCTAssertEqual(ExploreCategory(kind: t.kind), .stays)
    }

    func testStatusesDecode() throws {
        let json = """
        {"authors":[{"user":\(user),"items":[{"id":"s1","type":"image","media":{"url":"https://x/y.webp"},"caption":"hi @ravi",
          "createdAt":"2026-11-22T08:00:00.000Z","expiresAt":"2026-11-23T08:00:00.000Z","seen":false,"reactions":{"wanderlust":2},"myReaction":null,"commentCount":1}],
          "unseen":true,"latestAt":"2026-11-22T08:00:00.000Z"}]}
        """
        let r = try JSON.decoder().decode(StatusesResponse.self, from: Data(json.utf8))
        XCTAssertEqual(r.authors.first?.items.first?.totalReactions, 2)
        XCTAssertTrue(r.authors.first?.items.first?.isImage ?? false)
    }

    func testLeaderboardDecodes() throws {
        let json = #"{"entries":[{"rank":1,"user":\#(user),"location":null,"points":115,"trips":4,"reviews":0,"states":1,"monthlyTrips":null}],"monthly":[],"me":null}"#
        let r = try JSON.decoder().decode(LeaderboardResponse.self, from: Data(json.utf8))
        XCTAssertEqual(r.entries.first?.points, 115)
    }

    func testPollVoteMovesAndTakesBack() {
        let poll = Poll(options: [PollOption(id: "a", label: "A", votes: 2), PollOption(id: "b", label: "B", votes: 1)], myChoice: nil)
        let voted = poll.moved(to: "a")
        XCTAssertEqual(voted.options.map(\.votes), [3, 1])
        let changed = voted.moved(to: "b")
        XCTAssertEqual(changed.options.map(\.votes), [2, 2])
        XCTAssertEqual(changed.myChoice, "b")
        let back = changed.moved(to: nil)
        XCTAssertEqual(back.options.map(\.votes), [2, 1])
        XCTAssertNil(back.myChoice)
    }

    func testVoteBodySendsNullToTakeBack() throws {
        let data = try JSON.encoder().encode(VoteBody(choice: nil))
        XCTAssertEqual(String(decoding: data, as: UTF8.self), #"{"choice":null}"#)
    }

    func testProfilePatchOmitsUnchangedFields() throws {
        let data = try JSON.encoder().encode(ProfilePatch(bio: "Hi"))
        XCTAssertEqual(String(decoding: data, as: UTF8.self), #"{"bio":"Hi"}"#)
        XCTAssertTrue(ProfilePatch().isEmpty)
    }

    func testMentions() {
        XCTAssertEqual(Mentions.names("Off to Spiti with @ravi_k and @Meera."), ["ravi_k", "meera"])
        XCTAssertTrue(Mentions.names("mail me at a@b.com").isEmpty, "emails are not mentions")
        let tail = Mentions.tail("with @ra")
        XCTAssertEqual(tail?.query, "ra")
        XCTAssertNil(Mentions.tail("with @ravi and more"))
    }

    func testSVGPathParsesRelativeMoves() {
        let path = SVGPath.parse("m 10,10 10,0 0,10 -10,0 z")
        XCTAssertEqual(path.boundingRect, CGRect(x: 10, y: 10, width: 10, height: 10))
    }

    func testIndiaMapNames() {
        XCTAssertEqual(IndiaMapData.mapName("Ladakh"), "Jammu and Kashmir")
        XCTAssertEqual(IndiaMapData.mapName("Andaman & Nicobar"), "Andaman and Nicobar Islands")
    }

    func testNewDeepLinks() {
        XCTAssertEqual(DeepLink.parse(URL(string: "https://unsolo.in/profile/edit")!), .editProfile)
        XCTAssertEqual(DeepLink.parse(URL(string: "https://unsolo.in/listings/stays/tent-campsite")!), .trip(slug: "tent-campsite"))
        XCTAssertNil(DeepLink.parse(URL(string: "https://unsolo.in/listings/boats/x")!))
        XCTAssertEqual(DeepLink.parse(URL(string: "https://unsolo.in/leaderboard")!), .leaderboard)
        XCTAssertEqual(DeepLink.parse(path: "/offers"), .offers)
        XCTAssertEqual(DeepLink.parse(path: "/referrals"), .referrals)
    }

    func testSafetyModelsDecode() throws {
        let sos = #"{"onTrip":true,"trips":[{"bookingId":"b1","title":"Spiti","slug":"spiti","start":"2026-11-20","end":"2026-11-26"}],"emergencyContact":{"name":"Ma","phone":"9876543210"},"supportWhatsapp":"+919999999999"}"#
        let s = try JSON.decoder().decode(SosStatus.self, from: Data(sos.utf8))
        XCTAssertTrue(s.onTrip)
        XCTAssertEqual(s.emergencyContact?.phone, "9876543210")
        let pins = #"{"pins":[{"kind":"stay","id":"x","slug":"tent","title":"Tent","place":"Mukteshwar","lat":29.4,"lng":79.6,"priceFromPaise":65000,"unit":"night","image":null}]}"#
        XCTAssertEqual(try JSON.decoder().decode(MapPinsResponse.self, from: Data(pins.utf8)).pins.first?.unit, "night")
        let buddies = #"{"items":[{"user":\#(user),"score":12,"reasons":["Same departure"],"trip":{"slug":"spiti","title":"Spiti"},"planId":null}]}"#
        XCTAssertEqual(try JSON.decoder().decode(BuddiesResponse.self, from: Data(buddies.utf8)).items.first?.reasons, ["Same departure"])
        let live = #"{"items":[{"user":\#(user),"lat":32.2,"lng":77.1,"accuracy":12,"startedAt":"2026-11-22T08:00:00Z","updatedAt":"2026-11-22T08:05:00Z","expiresAt":"2026-11-22T09:00:00Z","mine":true}]}"#
        XCTAssertEqual(try JSON.decoder().decode(LiveLocationsResponse.self, from: Data(live.utf8)).items.first?.mine, true)
    }

    func testWidgetPicksSoonestUnfinishedTrip() throws {
        func booking(_ id: String, _ date: String, end: String? = nil) throws -> Booking {
            let json = """
            {"id":"\(id)","status":"confirmed","travelDate":"\(date)","guests":1,"totalPaise":100,"paidPaise":100,"balancePaise":0,"confirmationCode":null,
             "trip":{"id":"t\(id)","slug":"trip-\(id)","title":"Trip \(id)","priceFromPaise":100,"durationDays":3},"chatRoomId":null\(end.map { ",\"endDate\":\"\($0)\"" } ?? "")}
            """
            return try JSON.decoder().decode(Booking.self, from: Data(json.utf8))
        }
        let list = [try booking("a", "2026-12-10"), try booking("b", "2026-11-20", end: "2026-11-25"), try booking("c", "2026-11-01", end: "2026-11-03")]
        XCTAssertEqual(WidgetBridge.next(list, today: "2026-11-22")?.id, "b", "a trip under way comes first; finished ones are skipped")
        XCTAssertEqual(WidgetBridge.next(list, today: "2026-11-26")?.id, "a")
    }

    func testReviewDeepLink() {
        let id = "3f2a1c9e-1b2c-4d5e-8f90-123456789abc"
        XCTAssertEqual(DeepLink.parse(path: "/review/\(id)"), .review(bookingId: id))
        XCTAssertNil(DeepLink.parse(path: "/review/not-an-id"))
    }

    func testExpiresInText() {
        let now = Date()
        XCTAssertEqual(StatusTimeText.expiresIn(now.addingTimeInterval(5 * 3600 + 60), now: now), "in 5h")
        XCTAssertEqual(StatusTimeText.expiresIn(now.addingTimeInterval(600), now: now), "in 10m")
        XCTAssertEqual(StatusTimeText.expiresIn(now.addingTimeInterval(10), now: now), "soon")
    }
}
