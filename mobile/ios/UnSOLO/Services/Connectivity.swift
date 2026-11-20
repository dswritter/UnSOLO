import Foundation
import Network
import Observation

/// NWPathMonitor wrapper. `isOnline` drives the "Offline · showing saved" banner and outbox draining.
@MainActor
@Observable
final class Connectivity {
    private(set) var isOnline = true
    private(set) var isExpensive = false
    @ObservationIgnored private let monitor = NWPathMonitor()
    @ObservationIgnored private let queue = DispatchQueue(label: "in.unsolo.connectivity")
    @ObservationIgnored var onReconnect: (() -> Void)?

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            let expensive = path.isExpensive
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasOffline = !self.isOnline
                self.isOnline = online
                self.isExpensive = expensive
                if online && wasOffline { self.onReconnect?() }
            }
        }
        monitor.start(queue: queue)
    }

    /// Lets the server-unreachable path flag offline even when the radio is up.
    func markUnreachable() { isOnline = false }
    func markReachable() {
        let was = isOnline
        isOnline = true
        if !was { onReconnect?() }
    }
}
