import BackgroundTasks
import UIKit

/// BGTaskScheduler: `in.unsolo.app.refresh` (BGAppRefreshTask → /sync + config) and
/// `in.unsolo.app.outbox` (BGProcessingTask → drain pending writes). Identifiers are listed in Info.plist.
enum BackgroundTasks {
    static let refreshId = "in.unsolo.app.refresh"
    static let outboxId = "in.unsolo.app.outbox"

    @MainActor static weak var app: AppModel?

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshId, using: nil) { task in
            nonisolated(unsafe) let task = task
            scheduleRefresh()
            let work = Task { @MainActor in
                await app?.sync()
                await app?.outbox.drain()
                task.setTaskCompleted(success: true)
            }
            task.expirationHandler = { work.cancel() }
        }
        BGTaskScheduler.shared.register(forTaskWithIdentifier: outboxId, using: nil) { task in
            nonisolated(unsafe) let task = task
            let work = Task { @MainActor in
                let report = await app?.outbox.drain()
                task.setTaskCompleted(success: (report?.failed ?? 0) == 0)
            }
            task.expirationHandler = { work.cancel() }
        }
    }

    static func scheduleRefresh() {
        let req = BGAppRefreshTaskRequest(identifier: refreshId)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
        try? BGTaskScheduler.shared.submit(req)
    }

    static func scheduleOutbox() {
        let req = BGProcessingTaskRequest(identifier: outboxId)
        req.requiresNetworkConnectivity = true
        req.requiresExternalPower = false
        try? BGTaskScheduler.shared.submit(req)
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        if !AppInfo.isRunningTests { BackgroundTasks.register() }
        PushManager.shared.configure()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushManager.shared.didRegister(token: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        PushManager.shared.didFailToRegister(error)
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
        // A silent push (content-available) triggers a sync so the next open shows fresh data.
        await BackgroundTasks.app?.sync()
        return .newData
    }

    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        guard identifier == BackgroundUploader.identifier else { return completionHandler() }
        nonisolated(unsafe) let handler = completionHandler
        BackgroundUploader.shared.backgroundCompletionHandler = { handler() }
        BackgroundUploader.shared.setDelegate(BackgroundTasks.app?.uploads ?? UploadCoordinator(uploader: BackgroundUploader.shared))
    }
}
