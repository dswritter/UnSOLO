import SwiftUI

@main
struct UnSOLOApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var app = AppModel(inMemory: AppInfo.isRunningTests)
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if AppInfo.isRunningTests {
                    Color.clear
                } else {
                    RootView()
                        .environment(app)
                        .environment(app.router)
                        .environment(app.session)
                        .environment(\.dataSaver, app.session.preferences.dataSaver)
                        .task {
                            BackgroundTasks.app = app
                            PushManager.shared.onOpenLink = { link, payload in
                                app.openNotificationLink(link)
                                Task { await app.analytics.track("push.open", props: ["type": (payload["type"] as? String) ?? "unknown"]) }
                            }
                            PushManager.shared.onAction = { action, payload in app.handlePushAction(action, payload: payload) }
                            await app.launch()
                        }
                        .onOpenURL { url in
                            if let link = DeepLink.parse(url) { app.router.open(link) }
                        }
                        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                            if let url = activity.webpageURL, let link = DeepLink.parse(url) { app.router.open(link) }
                        }
                }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: Task { await app.foregrounded() }
            case .background: Task { await app.backgrounded() }
            default: break
            }
        }
    }
}
