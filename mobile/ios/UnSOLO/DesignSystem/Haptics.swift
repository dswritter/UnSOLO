import UIKit

/// Light haptics on reactions, votes, follow and story reactions (Android's `rememberTick`).
@MainActor
enum Haptics {
    private static let selection = UISelectionFeedbackGenerator()
    private static let impact = UIImpactFeedbackGenerator(style: .light)
    private static let notify = UINotificationFeedbackGenerator()

    static func tick() { selection.selectionChanged() }
    static func tap() { impact.impactOccurred() }
    static func success() { notify.notificationOccurred(.success) }
}
