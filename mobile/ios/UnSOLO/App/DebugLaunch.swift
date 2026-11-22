#if DEBUG
import Foundation

/// DEBUG-only launch arguments used for screenshots and manual QA, e.g.
///   xcrun simctl launch booted in.unsolo.app -startScreen planDetailJoined
/// Arguments: -startScreen <name>, -resetState YES, -demoSignedIn YES|NO, -landingPrompt YES|NO, -demoMode NO.
/// Screens: explore, search, tripDetail, tripStories, tribe, tribeStories, postSheet, planComposer, storyComposer, askComposer,
///          planDetail, planDetailJoined, storyDetail, askDetail, activity, messages, chat, trips, you, profile,
///          settings, host, offerForm, offer, welcome, phoneVerify, landingPrompt, publishPlan, publishHeld,
///          exploreSearch, explorePlans, whosGoing, tripFull, tribePlans, tribePolls, pollComposer, storyViewer
enum DebugLaunch {
    static var startScreen: String? { UserDefaults.standard.string(forKey: "startScreen") }

    struct IDs: Decodable {
        var posts: [String: String]
        var rooms: [String: String]
        var users: [String: String]?
        var me: String
    }

    static var ids: IDs? {
        try? JSONDecoder().decode(IDs.self, from: DemoBackend.fixture("ids"))
    }

    @MainActor
    static func prepare(_ app: AppModel) async {
        let defaults = UserDefaults.standard
        if defaults.bool(forKey: "resetState") {
            app.store.wipeAll()
            for key in ["landing.visits", "landing.tab", "landing.promptDismissed", "welcome.seen", "push.permissionAsked", "blockedUsers"] {
                defaults.removeObject(forKey: key)
            }
            await app.auth.signOut()
            app.marks.reset()
        }
        let wantsSignedIn = defaults.object(forKey: "demoSignedIn").map { _ in defaults.bool(forKey: "demoSignedIn") } ?? (startScreen != nil && startScreen != "welcome")
        if app.isDemo, wantsSignedIn, await !app.auth.isSignedIn {
            await app.auth.adopt(SupabaseSession(accessToken: "demo-access-debug", refreshToken: "demo-refresh-debug", expiresIn: 3600, expiresAt: nil, tokenType: "bearer"))
            defaults.set(true, forKey: "welcome.seen")
        }
        if startScreen != nil, defaults.object(forKey: "pushPrompt") == nil {
            defaults.set(true, forKey: "push.permissionAsked") // keep the system prompt out of screenshots
        }
        if startScreen != nil, startScreen != "landingPrompt", defaults.object(forKey: "landingPrompt") == nil {
            app.landing.dismissed = true // keep screenshots free of the prompt
        }
    }

    /// Runs after launch() finished its first refresh.
    @MainActor
    static func navigate(_ app: AppModel) async {
        guard let screen = startScreen, let ids else { return }
        let r = app.router
        let spiti = ids.posts["spiti"] ?? ""
        switch screen {
        case "explore": r.tab = .explore
        case "search", "exploreSearch", "explorePlans": r.tab = .explore
        case "whosGoing":
            r.tab = .explore
            await app.explore.refreshDetail("chalo-himachal")
            r.push(.trip(slug: "chalo-himachal"))
        case "tripFull":
            r.tab = .explore
            await app.explore.refreshDetail("bhutan-thunder-dragon")
            r.push(.trip(slug: "bhutan-thunder-dragon"))
        case "tribePlans", "tribePolls": r.tab = .tribe
        case "pollComposer": r.tab = .tribe; r.composer = .poll
        case "storyViewer":
            r.tab = .tribe
            await app.tribe.refreshFeed(key: "all")
            let authors = StoryRail.entries(app, excluding: app.session.user?.id).map(\.author.id)
            if !authors.isEmpty { r.storyViewer = StoryViewerItem(authorIds: authors, start: 0) }
        case "tripDetail", "tripStories":
            r.tab = .explore
            await app.explore.refreshDetail("chalo-himachal")
            r.push(.trip(slug: "chalo-himachal"))
        case "tribe": r.tab = .tribe
        case "tribeStories": r.tab = .tribe
        case "postSheet": r.tab = .tribe; r.showPostSheet = true
        case "planComposer": r.tab = .tribe; r.composer = .plan
        case "storyComposer": r.tab = .trips; r.composerTripSlug = "rishikesh-weekend"; r.composer = .story
        case "askComposer": r.tab = .tribe; r.composer = .ask
        case "planDetail":
            r.tab = .tribe
            await app.tribe.refreshPost(spiti)
            r.push(.post(id: spiti))
        case "planDetailJoined":
            r.tab = .tribe
            await app.tribe.refreshPost(spiti)
            if app.tribe.post(spiti)?.viewer?.membership != .requested {
                app.tribe.join(spiti, intro: "Hi Ananya! I've done Spiti in summer, happy with homestays and long bus rides.")
            }
            r.push(.post(id: spiti))
        case "storyDetail":
            r.tab = .tribe
            let id = ids.posts["volvo"] ?? ""
            await app.tribe.refreshPost(id)
            r.push(.post(id: id))
        case "askDetail":
            r.tab = .tribe
            let id = ids.posts["stay"] ?? ""
            await app.tribe.refreshPost(id)
            r.push(.post(id: id))
        case "activity":
            r.tab = .tribe
            await app.trips.refresh()
            r.push(.activity)
        case "messages": r.tab = .tribe; r.push(.messages)
        case "chat":
            r.tab = .trips
            if let room = ids.rooms["Chalo Himachal"] { r.push(.chat(roomId: room, title: "Chalo Himachal")) }
        case "trips": r.tab = .trips
        case "you": r.tab = .you
        case "profile": r.tab = .tribe; r.push(.profile(username: "ananyasingh"))
        case "settings": r.tab = .you; r.push(.settings)
        case "host": r.tab = .you; r.push(.hostHub)
        case "offerForm": r.tab = .you; r.push(.offerForm(postId: spiti))
        case "offer":
            r.tab = .trips
            let tosh = ids.posts["tosh"] ?? ""
            await app.tribe.refreshPost(tosh)
            r.push(.offerReview(postId: tosh))
        case "publishPlan", "publishHeld":
            // Exercises the optimistic publish path: local "sending" post → photo compress + upload → outbox → server copy.
            r.tab = .tribe
            let photo = DemoImageRenderer.render(url: URL(string: "demo://photo/kasol?seed=7")!, maxPixel: 3000) ?? Data()
            let held = screen == "publishHeld"
            app.tribe.publish(ComposeDraft(kind: .plan, title: held ? "Kasol weekend, ₹3,500/person" : "Chopta sunrise trek, 2 nights",
                                           body: held ? "Pay advance on UPI to book your spot. Call 98765 43210." : "Tempo traveller from Delhi on Friday night, Tungnath on Saturday, back Sunday. Looking for 3 easy-going people.",
                                           place: Place(name: held ? "Kasol, Parvati Valley" : "Chopta, Uttarakhand", slug: nil, lat: nil, lng: nil),
                                           startsOn: "2026-12-11", endsOn: "2026-12-13", spotsTotal: 4, audience: .verified,
                                           estCostText: "Est. ₹6,000 each", photos: [photo]))
        case "statusViewer":
            r.tab = .tribe
            await app.statuses.refresh()
            if let a = app.statuses.rail.first(where: { $0.user.id != app.session.user?.id }) { r.statusViewer = StatusViewerItem(authorId: a.user.id) }
        case "statusComposer": r.tab = .tribe; r.storyComposer = StoryComposeItem()
        case "leaderboard": r.tab = .you; r.push(.leaderboard)
        case "editProfile": r.tab = .you; r.push(.editProfile)
        case "referrals": r.tab = .you; r.push(.referrals)
        case "offers": r.tab = .you; r.push(.offers)
        case "exploreAll": r.tab = .explore; r.push(.exploreAll(category: "stays"))
        case "profileTravel": r.tab = .tribe; r.push(.profile(username: "ananyasingh"))
        case "welcome": r.authSheet = true
        case "phoneVerify": r.phoneSheet = true
        case "landingPrompt": r.landingPrompt = .tribe
        default: break
        }
    }
}
#endif
