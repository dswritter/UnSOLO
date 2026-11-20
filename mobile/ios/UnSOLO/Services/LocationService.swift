import CoreLocation
import Foundation

/// When-In-Use, reduced accuracy, asked only when the user turns on "near me" suggestions.
/// Coordinates are rounded to 2 decimals (~1 km) before they leave the device.
@MainActor
final class LocationService: NSObject, CLLocationManagerDelegate {
    static let shared = LocationService()

    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocationCoordinate2D?, Never>?
    private(set) var lastRounded: (lat: Double, lng: Double)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyReduced
    }

    nonisolated static func round2(_ v: Double) -> Double { (v * 100).rounded() / 100 }

    var isAuthorized: Bool {
        let s = manager.authorizationStatus
        return s == .authorizedWhenInUse || s == .authorizedAlways
    }

    /// Requests permission (if needed) and one coarse fix. Returns nil if denied or unavailable.
    func currentRounded() async -> (lat: Double, lng: Double)? {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
            // Wait briefly for the user's answer.
            for _ in 0..<40 where manager.authorizationStatus == .notDetermined {
                try? await Task.sleep(for: .milliseconds(250))
            }
        }
        guard isAuthorized else { return nil }
        let coord: CLLocationCoordinate2D? = await withCheckedContinuation { cont in
            continuation?.resume(returning: nil)
            continuation = cont
            manager.requestLocation()
        }
        guard let coord else { return nil }
        let r = (Self.round2(coord.latitude), Self.round2(coord.longitude))
        lastRounded = r
        return r
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let c = locations.last?.coordinate
        Task { @MainActor in
            self.continuation?.resume(returning: c)
            self.continuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.continuation?.resume(returning: nil)
            self.continuation = nil
        }
    }
}
