import Foundation
import UIKit
import UserNotifications

/// Push + local notifications.
/// - Permission is asked at a sensible moment (after the first post or join request), never at launch.
/// - The APNs token (hex) is sent to POST /devices (platform "ios"); DELETE /devices on sign-out.
/// - Categories plans / replies / messages / trips; join-request pushes get Approve + Decline actions.
/// - Tapping routes the `link` custom key through DeepLink. On the simulator without an Apple developer ID,
///   registerForRemoteNotifications fails (logged); local notifications and `xcrun simctl push` still work.
@MainActor
final class PushManager: NSObject {
    static let shared = PushManager()

    enum Category: String, CaseIterable {
        case plans, replies, messages, trips
        case joinRequest = "tribe_join_request"
        case legacyJoinRequest = "join_request"
    }
    enum Action: String { case approve = "APPROVE", decline = "DECLINE", reply = "REPLY", open = "OPEN" }

    private(set) var deviceToken: String?
    private var registerHandler: ((String) -> Void)?
    /// Called with the raw `link` (validated by the app) when a notification is tapped.
    var onOpenLink: ((String?, [AnyHashable: Any]) -> Void)?
    var onAction: ((Action, [AnyHashable: Any]) -> Void)?
    private let askedKey = "push.permissionAsked"

    func configure() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let approve = UNNotificationAction(identifier: Action.approve.rawValue, title: "Approve", options: [.authenticationRequired])
        let decline = UNNotificationAction(identifier: Action.decline.rawValue, title: "Decline", options: [.destructive, .authenticationRequired])
        let reply = UNTextInputNotificationAction(identifier: Action.reply.rawValue, title: "Reply", options: [],
                                                  textInputButtonTitle: "Send", textInputPlaceholder: "Message")
        let open = UNNotificationAction(identifier: Action.open.rawValue, title: "Open", options: [.foreground])
        center.setNotificationCategories([
            UNNotificationCategory(identifier: Category.joinRequest.rawValue, actions: [approve, decline], intentIdentifiers: []),
            UNNotificationCategory(identifier: Category.legacyJoinRequest.rawValue, actions: [approve, decline], intentIdentifiers: []),
            UNNotificationCategory(identifier: Category.plans.rawValue, actions: [open], intentIdentifiers: []),
            UNNotificationCategory(identifier: Category.replies.rawValue, actions: [open], intentIdentifiers: []),
            UNNotificationCategory(identifier: Category.messages.rawValue, actions: [reply], intentIdentifiers: []),
            UNNotificationCategory(identifier: Category.trips.rawValue, actions: [open], intentIdentifiers: []),
        ])
    }

    var hasAsked: Bool { UserDefaults.standard.bool(forKey: askedKey) }

    /// Call after a meaningful action (first post, first join request).
    func requestPermissionIfNeeded(onToken: @escaping (String) -> Void) {
        registerHandler = onToken
        let center = UNUserNotificationCenter.current()
        Task {
            let settings = await center.notificationSettings()
            switch settings.authorizationStatus {
            case .notDetermined:
                UserDefaults.standard.set(true, forKey: askedKey)
                let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
                if granted { UIApplication.shared.registerForRemoteNotifications() }
            case .authorized, .provisional, .ephemeral:
                UIApplication.shared.registerForRemoteNotifications()
            default:
                break
            }
        }
    }

    /// Re-register on launch when permission was already granted (tokens can rotate).
    func refreshRegistration(onToken: @escaping (String) -> Void) {
        registerHandler = onToken
        Task {
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func didRegister(token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        deviceToken = hex
        registerHandler?(hex)
    }

    func didFailToRegister(_ error: Error) {
        // Expected on the simulator / without the aps-environment entitlement (no Apple developer ID yet).
        print("[push] registerForRemoteNotifications failed: \(error.localizedDescription)")
    }

    /// Local notification with the same payload shape as APNs (for testing without a developer ID).
    func scheduleLocalTest(title: String, body: String, link: String, category: Category = .plans, extra: [String: String] = [:],
                           after seconds: TimeInterval = 3) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.threadIdentifier = category.rawValue
        content.categoryIdentifier = category.rawValue
        var info: [String: String] = ["link": link, "notificationId": UUID().uuidString.lowercased()]
        info.merge(extra) { $1 }
        content.userInfo = info
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: trigger))
    }

    func setBadge(_ count: Int) {
        UNUserNotificationCenter.current().setBadgeCount(count)
    }
}

extension PushManager: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound, .badge]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let action = response.actionIdentifier
        let payload = PushPayload(userInfo: info)
        await MainActor.run {
            if let a = Action(rawValue: action), a != .open {
                PushManager.shared.onAction?(a, payload.raw)
                return
            }
            PushManager.shared.onOpenLink?(payload.link, payload.raw)
        }
    }
}

/// Sendable copy of the fields we read from a push payload.
struct PushPayload: @unchecked Sendable {
    let raw: [AnyHashable: Any]
    var link: String? { raw["link"] as? String }
    var notificationId: String? { raw["notificationId"] as? String }
    var type: String? { raw["type"] as? String }
    var postId: String? { raw["postId"] as? String }
    /// The requester for join requests (`actorId`; older payloads used `userId`).
    var actorId: String? { (raw["actorId"] as? String) ?? (raw["userId"] as? String) }
    /// Approve/Decline target, only for join-request pushes with valid ids.
    var inlineDecision: (postId: String, userId: String)? {
        guard AppNotification.joinRequestTypes.contains(type ?? "tribe_join_request"),
              let postId, let actorId, DeepLink.isUUID(postId), DeepLink.isUUID(actorId) else { return nil }
        return (postId.lowercased(), actorId.lowercased())
    }
    init(userInfo: [AnyHashable: Any]) { raw = userInfo }
}
