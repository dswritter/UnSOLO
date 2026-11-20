import Foundation

/// Build-time configuration read from Info.plist (populated from Config/*.xcconfig).
enum AppInfo {
    static var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0" }
    static var build: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0" }

    /// `X-UnSOLO-Client: ios/1.0.0 (1)`
    static var clientHeader: String { "ios/\(version) (\(build))" }

    static var apiBaseURL: URL {
        let raw = Bundle.main.object(forInfoDictionaryKey: "UNSOLO_API_BASE_URL") as? String ?? ""
        if let override = UserDefaults.standard.string(forKey: "apiBaseURL"), let url = URL(string: override), isAllowedBase(url) {
            return url
        }
        return URL(string: raw).flatMap { isAllowedBase($0) ? $0 : nil } ?? URL(string: "https://unsolo.in/api/v1")!
    }

    static var webBaseURL: URL {
        let raw = Bundle.main.object(forInfoDictionaryKey: "UNSOLO_WEB_BASE_URL") as? String ?? ""
        return URL(string: raw) ?? URL(string: "https://unsolo.in")!
    }

    static var supabaseFallbackURL: String { Bundle.main.object(forInfoDictionaryKey: "UNSOLO_SUPABASE_URL") as? String ?? "" }
    static var supabaseFallbackKey: String { Bundle.main.object(forInfoDictionaryKey: "UNSOLO_SUPABASE_ANON_KEY") as? String ?? "" }

    /// Demo mode: on by default in Debug (DEMO_MODE compilation condition), off in Release.
    /// Debug builds can flip it with the launch argument `-demoMode NO`.
    static var demoModeRequested: Bool {
        #if DEMO_MODE
        if UserDefaults.standard.object(forKey: "demoMode") != nil { return UserDefaults.standard.bool(forKey: "demoMode") }
        return true
        #else
        return false
        #endif
    }

    /// Only https, or http to localhost (ATS allows nothing else).
    static func isAllowedBase(_ url: URL) -> Bool {
        if url.scheme == "https" { return true }
        return url.scheme == "http" && url.host == "localhost"
    }

    static var isRunningTests: Bool { NSClassFromString("XCTestCase") != nil }
}
