import XCTest
@testable import UnSOLO

final class LandingSuggestionTests: XCTestCase {
    typealias V = LandingSuggestionLogic.Visit
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func visits(_ tab: LandingTab, _ n: Int, daysAgo: Double = 1) -> [V] {
        (0..<n).map { i in V(tab: tab, at: now.addingTimeInterval(-daysAgo * 86_400 - Double(i) * 60)) }
    }

    func testSuggestsMostOpenedTabWithAtLeastThreeOpens() {
        let v = visits(.tribe, 5) + visits(.explore, 2) + visits(.trips, 1)
        XCTAssertEqual(LandingSuggestionLogic.localSuggestion(visits: v, current: .explore, dismissed: false, now: now), .tribe)
    }

    func testNoSuggestionBelowThreshold() {
        let v = visits(.tribe, 2)
        XCTAssertNil(LandingSuggestionLogic.localSuggestion(visits: v, current: .explore, dismissed: false, now: now))
    }

    func testNoSuggestionWhenAlreadyLanding() {
        let v = visits(.tribe, 9)
        XCTAssertNil(LandingSuggestionLogic.localSuggestion(visits: v, current: .tribe, dismissed: false, now: now))
    }

    func testIgnoresVisitsOlderThan14Days() {
        let v = visits(.trips, 10, daysAgo: 15) + visits(.explore, 1)
        XCTAssertNil(LandingSuggestionLogic.localSuggestion(visits: v, current: .explore, dismissed: false, now: now))
    }

    func testDismissedSuppresses() {
        XCTAssertNil(LandingSuggestionLogic.localSuggestion(visits: visits(.tribe, 9), current: .explore, dismissed: true, now: now))
    }

    func testMostOpenedWinsEvenIfCurrentIsHigh() {
        // Explore is current and most opened → no prompt even though Tribe has 4.
        let v = visits(.explore, 8) + visits(.tribe, 4)
        XCTAssertNil(LandingSuggestionLogic.localSuggestion(visits: v, current: .explore, dismissed: false, now: now))
    }

    func testTieBreaksInTabOrder() {
        let v = visits(.tribe, 4) + visits(.trips, 4)
        XCTAssertEqual(LandingSuggestionLogic.localSuggestion(visits: v, current: .explore, dismissed: false, now: now), .tribe)
    }

    func testServerPromptRules() {
        let s = LandingSuggestion(suggest: .tribe, visits: .init(explore: 2, tribe: 9, trips: 1))
        XCTAssertEqual(LandingSuggestionLogic.shouldPrompt(server: s, current: .explore, dismissedLocally: false, alreadyShownThisLaunch: false), .tribe)
        XCTAssertNil(LandingSuggestionLogic.shouldPrompt(server: s, current: .tribe, dismissedLocally: false, alreadyShownThisLaunch: false))
        XCTAssertNil(LandingSuggestionLogic.shouldPrompt(server: s, current: .explore, dismissedLocally: true, alreadyShownThisLaunch: false))
        XCTAssertNil(LandingSuggestionLogic.shouldPrompt(server: s, current: .explore, dismissedLocally: false, alreadyShownThisLaunch: true))
        XCTAssertNil(LandingSuggestionLogic.shouldPrompt(server: LandingSuggestion(suggest: nil, visits: s.visits), current: .explore,
                                                         dismissedLocally: false, alreadyShownThisLaunch: false))
        XCTAssertNil(LandingSuggestionLogic.shouldPrompt(server: nil, current: .explore, dismissedLocally: false, alreadyShownThisLaunch: false))
    }

    @MainActor
    func testTrackerPersistsOpensAndLandingTab() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "landing-test-\(UUID().uuidString)"))
        let tracker = LandingTracker(defaults: defaults)
        XCTAssertEqual(tracker.landingTab, .explore, "defaults to Explore")
        for _ in 0..<3 { tracker.recordOpen(.trips) }
        XCTAssertEqual(tracker.localSuggestion, .trips)
        tracker.landingTab = .trips
        XCTAssertNil(tracker.localSuggestion)
        XCTAssertEqual(LandingTracker(defaults: defaults).landingTab, .trips, "read back synchronously at launch")
    }
}
