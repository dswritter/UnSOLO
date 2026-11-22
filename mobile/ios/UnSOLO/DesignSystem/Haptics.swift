import UIKit

/// Light haptics on reactions, votes, follow and story reactions (Android's `rememberTick`).
@MainActor
enum Haptics {
    private static let selection = UISelectionFeedbackGenerator()
    private static let impact = UIImpactFeedbackGenerator(style: .light)
    private static let notify = UINotificationFeedbackGenerator()

    static func tick() { selection.selectionChanged() }
    static func tap() { impact.impactOccurred() }
    /// A crisper buzz for story reactions and sent comments.
    static func strong() { rigid.impactOccurred(intensity: 1) }
    private static let rigid = UIImpactFeedbackGenerator(style: .rigid)
    static func success() { notify.notificationOccurred(.success) }
}
