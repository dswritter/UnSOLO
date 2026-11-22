import CoreLocation
import Foundation

/// Precise location for SOS and live sharing in trip groups (the suggestions service stays coarse and rounded).
/// When-In-Use only: live sharing runs while UnSOLO is open, and the share expires on the server by itself.
@MainActor
final class PreciseLocation: NSObject, CLLocationManagerDelegate {
    static let shared = PreciseLocation()

    struct Fix: Sendable, Equatable { var lat: Double; var lng: Double; var accuracy: Double }

    private let manager = CLLocationManager()
    private var waiters: [CheckedContinuation<Fix?, Never>] = []
    private(set) var last: Fix?
    /// Called on each new fix while `startUpdates` is on.
    var onUpdate: ((Fix) -> Void)?
    private var streaming = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 25
    }

    var isDenied: Bool { [.denied, .restricted].contains(manager.authorizationStatus) }

    private func authorize() async -> Bool {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
            for _ in 0..<60 where manager.authorizationStatus == .notDetermined { try? await Task.sleep(for: .milliseconds(250)) }
        }
        let ok = manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways
        if ok, manager.accuracyAuthorization == .reducedAccuracy {
            try? await manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "TripSafety")
        }
        return ok
    }

    /// One fix (or the last one if it's fresh). nil when location is off or it takes longer than `timeout`.
    func current(timeout: Duration = .seconds(10)) async -> Fix? {
        guard await authorize() else { return nil }
        if let l = manager.location, l.timestamp.timeIntervalSinceNow > -30 { return fix(l) }
        let timer = Task { [weak self] in
            try? await Task.sleep(for: timeout)
            self?.resumeAll(nil)
        }
        defer { timer.cancel() }
        return await withCheckedContinuation { cont in
            waiters.append(cont)
            manager.requestLocation()
        }
    }

    func startUpdates() async -> Bool {
        guard await authorize() else { return false }
        streaming = true
        manager.startUpdatingLocation()
        return true
    }

    func stopUpdates() {
        streaming = false
        manager.stopUpdatingLocation()
    }

    private func fix(_ l: CLLocation) -> Fix { Fix(lat: l.coordinate.latitude, lng: l.coordinate.longitude, accuracy: max(0, l.horizontalAccuracy)) }

    private func resumeAll(_ f: Fix?) {
        let w = waiters
        waiters = []
        for c in w { c.resume(returning: f) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let l = locations.last else { return }
        Task { @MainActor in
            let f = self.fix(l)
            self.last = f
            self.resumeAll(f)
            if self.streaming { self.onUpdate?(f) }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.resumeAll(nil) }
    }
}
