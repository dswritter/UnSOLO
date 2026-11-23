import Foundation
import Observation

/// Trip safety and companions: SOS on trip days, live location in trip groups, travel buddies,
/// offline trip packs and server-synced saved trips (docs/revamp/api-v1.md, migration 124).
@MainActor
@Observable
final class SafetyRepo: AppBound {
    @ObservationIgnored weak var app: AppModel?
    var sos: SosStatus?
    var activeAlert: SosAlert?
    var buddies: [Buddy]?
    var buddiesFailed = false
    var packs: [String: TripPack] = [:]
    /// Live shares by room, and the room you're sharing to (with when it ends).
    var live: [String: [LiveLocation]] = [:]
    var sharing: (roomId: String, until: Date)?
    @ObservationIgnored private var lastSent: Date?
    @ObservationIgnored private var shareTimer: Task<Void, Never>?

    func bind(_ app: AppModel) {
        self.app = app
        app.outbox.register("trip.save", OutboxHandler(success: { _, _ in }))
        app.marks.onToggle = { [weak self] slug, on in self?.saveTrip(slug, on: on) }
        if let s = app.store.entry(SosStatus.self, "sos") { sos = s }
    }

    var onTrip: Bool { sos?.onTrip ?? false }

    func refreshSos() async {
        guard let app, app.session.isSignedIn else { sos = nil; return }
        if let s = try? await app.api.sosStatus() {
            sos = s
            app.store.setEntry("sos", s, isPrivate: true)
        }
    }

    // MARK: SOS

    /// Sends an SOS with your location (if allowed). Returns the alert, or a message to show.
    func raiseSos(note: String?, bookingId: String?) async -> Result<SosAlert, SosError> {
        guard let app else { return .failure(SosError(message: "Couldn't send. Call for help directly.")) }
        let fix = await PreciseLocation.shared.current(timeout: .seconds(8))
        do {
            let a = try await app.api.raiseSos(SosBody(lat: fix?.lat, lng: fix?.lng, accuracy: fix?.accuracy, note: note, bookingId: bookingId))
            activeAlert = a
            Haptics.success()
            // Keep the team's map current for a few minutes while the app is open.
            Task { [weak self] in await self?.followUpLocation(a.id) }
            return .success(a)
        } catch APIError.offline {
            return .failure(SosError(message: "You're offline. Call or text for help directly below."))
        } catch {
            return .failure(SosError(message: (error as? APIError)?.errorDescription ?? "Couldn't send. Call for help directly below."))
        }
    }

    private func followUpLocation(_ id: String) async {
        for _ in 0..<5 {
            try? await Task.sleep(for: .seconds(60))
            guard activeAlert?.id == id, let app else { return }
            if let f = await PreciseLocation.shared.current() {
                try? await app.api.updateSos(id, SosUpdateBody(lat: f.lat, lng: f.lng, accuracy: f.accuracy, status: nil))
            }
        }
    }

    func markSafe() async -> Bool {
        guard let app, let a = activeAlert else { return false }
        do {
            try await app.api.updateSos(a.id, SosUpdateBody(lat: nil, lng: nil, accuracy: nil, status: "safe"))
            activeAlert = nil
            return true
        } catch { return false }
    }

    // MARK: Live location

    func refreshLive(_ roomId: String) async {
        guard let app, let r = try? await app.api.liveLocations(roomId: roomId) else { return }
        live[roomId] = r.items
        if let mine = r.items.first(where: { $0.mine == true }), sharing == nil, let until = mine.expiresAt, until > Date() {
            // Shared from another session: pick it back up.
            sharing = (roomId, until)
            Task { await startStreaming() }
        }
    }

    /// Start sharing to a trip group for `minutes` (15–480). Updates go out while the app is open.
    func startSharing(roomId: String, minutes: Int) async -> String? {
        guard let app else { return "Couldn't start sharing." }
        guard let f = await PreciseLocation.shared.current() else {
            return PreciseLocation.shared.isDenied ? "Location is off for UnSOLO. Turn it on in Settings to share." : "Couldn't find your location. Try again outside."
        }
        do {
            try await app.api.shareLiveLocation(roomId: roomId, LiveLocationBody(lat: f.lat, lng: f.lng, accuracy: f.accuracy, minutes: max(15, min(480, minutes))))
            sharing = (roomId, Date().addingTimeInterval(Double(minutes) * 60))
            lastSent = Date()
            await startStreaming()
            await refreshLive(roomId)
            return nil
        } catch APIError.offline {
            return "You're offline."
        } catch {
            return (error as? APIError)?.errorDescription ?? "Couldn't start sharing."
        }
    }

    private func startStreaming() async {
        let ok = await PreciseLocation.shared.startUpdates()
        guard ok else { return }
        PreciseLocation.shared.onUpdate = { [weak self] f in self?.sendUpdate(f) }
        shareTimer?.cancel()
        shareTimer = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard let self, let s = self.sharing else { return }
                if s.until <= Date() { self.endLocally(); return }
            }
        }
    }

    private func sendUpdate(_ f: PreciseLocation.Fix) {
        guard let app, let s = sharing else { return }
        // At most one update a minute.
        if let last = lastSent, Date().timeIntervalSince(last) < 60 { return }
        lastSent = Date()
        Task { try? await app.api.shareLiveLocation(roomId: s.roomId, LiveLocationBody(lat: f.lat, lng: f.lng, accuracy: f.accuracy, minutes: nil)) }
    }

    func stopSharing() async {
        guard let app, let s = sharing else { return }
        endLocally()
        try? await app.api.stopLiveLocation(roomId: s.roomId)
        await refreshLive(s.roomId)
    }

    func endLocally() {
        sharing = nil
        shareTimer?.cancel()
        PreciseLocation.shared.stopUpdates()
        PreciseLocation.shared.onUpdate = nil
    }

    // MARK: Buddies

    func refreshBuddies() async {
        guard let app else { return }
        if buddies == nil { buddies = app.store.entry([Buddy].self, "buddies") }
        do {
            let r = try await app.api.buddies()
            buddies = r.items
            buddiesFailed = false
            app.store.setEntry("buddies", r.items, isPrivate: true)
        } catch { if buddies == nil { buddiesFailed = true } }
    }

    // MARK: Offline trip pack

    func pack(_ bookingId: String) -> TripPack? {
        if let p = packs[bookingId] { return p }
        if let p = app?.store.entry(TripPack.self, "pack:\(bookingId)") { packs[bookingId] = p; return p }
        return nil
    }

    @discardableResult
    func refreshPack(_ bookingId: String) async -> Bool {
        guard let app, let p = try? await app.api.tripPack(bookingId: bookingId) else { return false }
        packs[bookingId] = p
        app.store.setEntry("pack:\(bookingId)", p, isPrivate: true)
        return true
    }

    /// Saves packs for trips starting within a week, so they open with no signal.
    func prefetchPacks(_ upcoming: [Booking]) async {
        for b in upcoming where (Fmt.daysUntil(b.travelDate) ?? 99) <= 7 || b.onTrip == true {
            if let p = pack(b.id), let at = p.generatedAt, Date().timeIntervalSince(at) < 6 * 3600 { continue }
            await refreshPack(b.id)
        }
    }

    // MARK: Saved trips (server copy for price-drop and seats-left alerts)

    private func saveTrip(_ slug: String, on: Bool) {
        guard let app, app.session.isSignedIn, DeepLink.isSlug(slug) else { return }
        Haptics.tick()
        app.outbox.enqueue(kind: "trip.save", method: on ? .put : .delete, path: "/trips/\(slug)/save", body: nil,
                           clientId: "trip.save:\(slug)", coalesce: true)
        Task { await app.outbox.drain() }
        if on { app.showToast("Saved. We'll tell you if the price drops or it's nearly full.") }
    }

    /// After sign-in: send trips saved on this phone, then take the server's list (never removes).
    func syncSavedTrips() async {
        guard let app, app.session.isSignedIn else { return }
        let local = Array(app.marks.savedTrips)
        if !local.isEmpty { try? await app.api.addSavedTrips(local) }
        if let r = try? await app.api.savedTrips() { app.marks.merge(r.slugs) }
    }
}

struct SosError: Error { var message: String }
