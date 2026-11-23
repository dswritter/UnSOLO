import MapKit
import SwiftUI

/// Explore on a map: trips on their destination, stays/activities/rentals where they are, and open plans.
/// Pins from `GET /explore/map`; tap one for a card that opens it.
struct ExploreMapView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var category = "all"
    @State private var pins: [MapPin] = []
    @State private var loading = true
    @State private var failed = false
    @State private var selected: MapPin?
    @State private var position: MapCameraPosition = .region(MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 23.5, longitude: 79.0), span: MKCoordinateSpan(latitudeDelta: 26, longitudeDelta: 26)))

    private static let categories: [(String, String)] = [("all", "All"), ("trips", "Trips"), ("stays", "Stays"), ("activities", "Activities"),
                                                         ("rentals", "Rentals"), ("plans", "Plans")]

    var body: some View {
        ZStack(alignment: .top) {
            Map(position: $position, selection: Binding(get: { selected?.id }, set: { id in selected = pins.first { $0.id == id } })) {
                ForEach(pins) { p in
                    Annotation(p.title, coordinate: CLLocationCoordinate2D(latitude: p.lat, longitude: p.lng), anchor: .bottom) {
                        pinView(p)
                    }
                    .tag(p.id)
                    .annotationTitles(.hidden)
                }
                UserAnnotation()
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .mapControls { MapUserLocationButton(); MapCompass(); MapScaleView() }
            .ignoresSafeArea(edges: .bottom)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Self.categories, id: \.0) { c in
                        PcChip(text: c.1, selected: category == c.0, showsCheck: false) { category = c.0 }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            .background(.regularMaterial)
            if loading { ProgressView().tint(Pc.ink).padding(.top, 70) }
            else if failed {
                Button { Task { await load() } } label: {
                    (Text("Couldn't load the places · ") + Text("Try again").bold().foregroundColor(Pc.accentInk))
                        .pcFont(.small).foregroundStyle(Pc.ink)
                        .padding(.horizontal, 14).padding(.vertical, 10).background(Capsule().fill(.regularMaterial))
                }
                .buttonStyle(.pcPress)
                .padding(.top, 70)
            }
            else if pins.isEmpty { Text("Nothing on the map here yet").pcFont(.small).padding(10).background(Capsule().fill(.regularMaterial)).padding(.top, 70) }
        }
        .overlay(alignment: .bottom) {
            if let p = selected { card(p).padding(16).transition(.move(edge: .bottom).combined(with: .opacity)) }
        }
        .animation(.snappy, value: selected?.id)
        .pcNavigationBar("Map")
        .task(id: category) { await load() }
        // Re-fit whenever the set of places changes (the saved copy first, then the fresh one).
        .onChange(of: pins.map(\.id)) { _, _ in fit() }
    }

    /// All the pins in view; pins in (nearly) one spot get a city-level zoom around them.
    static func fitRegion(_ pins: [MapPin]) -> MKCoordinateRegion {
        let lats = pins.map(\.lat), lngs = pins.map(\.lng)
        let minLat = lats.min() ?? 23.5, maxLat = lats.max() ?? 23.5, minLng = lngs.min() ?? 79, maxLng = lngs.max() ?? 79
        let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2)
        if maxLat - minLat < 0.02 && maxLng - minLng < 0.02 {
            return MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15))
        }
        return MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: (maxLat - minLat) * 1.4 + 0.05,
                                                                         longitudeDelta: (maxLng - minLng) * 1.4 + 0.05))
    }

    private func fit() {
        guard !pins.isEmpty else { return }
        let region = Self.fitRegion(pins)
        withAnimation(.easeInOut(duration: 0.4)) { position = .region(region) }
    }

    private func load() async {
        loading = true
        failed = false
        let key = "map:\(category)"
        if let cached = app.store.entry([MapPin].self, key) { pins = cached }
        do {
            let r = try await app.api.mapPins(category: category)
            pins = r.pins
            app.store.setEntry(key, r.pins)
        } catch { failed = pins.isEmpty }
        if let s = selected, !pins.contains(where: { $0.id == s.id }) { selected = nil }
        loading = false
    }

    private func color(_ kind: String) -> Color {
        switch kind {
        case "plan": Pc.rose
        case "stay": Pc.green
        case "activity", "rental": Pc.goldInk
        default: Pc.ink
        }
    }

    private func pinView(_ p: MapPin) -> some View {
        let label = p.kind == "plan" ? "Plan" : p.priceFromPaise.map { Fmt.rupees($0) } ?? p.title
        let on = selected?.id == p.id
        return Text(label)
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(on ? Pc.onPine : .white)
            .lineLimit(1)
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(Capsule().fill(on ? Pc.pine : p.isPast ? Pc.ink3 : color(p.kind)))
            .overlay(Capsule().strokeBorder(.white, lineWidth: 1.5))
            .shadow(color: .black.opacity(0.2), radius: 3, y: 2)
            .accessibilityLabel("\(p.title), \(p.place ?? "")")
    }

    private func card(_ p: MapPin) -> some View {
        Button { open(p) } label: {
            HStack(spacing: 12) {
                PcAsyncImage(media: p.image, targetSize: CGSize(width: 72, height: 72)).frame(width: 72, height: 72).clipShape(Pc.shape(12))
                VStack(alignment: .leading, spacing: 3) {
                    Text(p.kind.capitalized).pcFont(.label, weight: .bold).foregroundStyle(color(p.kind))
                    Text(p.title).pcFont(.bodyStrong, weight: .bold).foregroundStyle(Pc.ink).lineLimit(2).multilineTextAlignment(.leading)
                    Text(subtitle(p)).pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(Pc.ink3)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 18).fill(Pc.raised))
            .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
        }
        .buttonStyle(.pcPress)
    }

    private func subtitle(_ p: MapPin) -> String {
        var parts: [String] = []
        if let place = p.place { parts.append(place.components(separatedBy: ",").first ?? place) }
        if let d = p.date { parts.append(Fmt.dayMonth(d)) }
        if let price = p.priceFromPaise { parts.append(Fmt.rupees(price) + (p.unit.map { "/\($0)" } ?? (p.kind == "trip" ? "/person" : ""))) }
        if p.isPast { parts.append("Ask for dates"); return parts.joined(separator: " · ") }
        if let s = p.seatsLeft { parts.append("\(s) left") }
        if let s = p.spotsLeft, p.kind == "plan" { parts.append("\(s) spots open") }
        return parts.joined(separator: " · ")
    }

    private func open(_ p: MapPin) {
        if p.kind == "plan", let id = p.postId ?? Optional(p.id), DeepLink.isUUID(id) { router.push(.post(id: id)) }
        else if let slug = p.slug, DeepLink.isSlug(slug) { router.push(.trip(slug: slug)) }
    }
}
