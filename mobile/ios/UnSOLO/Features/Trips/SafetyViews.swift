import MapKit
import PhotosUI
import SwiftUI

// SOS on trip days, live location in trip groups, travel buddies, the offline trip pack and reviews with photos.

// MARK: - SOS

/// Red SOS bar on the Bookings tab while you're on a trip today.
struct SosBar: View {
    @Environment(AppModel.self) private var app
    @State private var open = false

    var body: some View {
        if app.safety.onTrip {
            Button { open = true } label: {
                HStack(spacing: 10) {
                    Text("SOS").font(.system(size: 14, weight: .black)).foregroundStyle(.white)
                        .frame(width: 44, height: 44).background(Circle().fill(Pc.red))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(app.safety.activeAlert != nil ? "Help is on the way" : "Need help on your trip?").pcFont(.bodyStrong, weight: .bold).foregroundStyle(Pc.ink)
                        Text(app.safety.activeAlert != nil ? "Tap to call, message, or say you're safe" : "Alert your host, the UnSOLO team and your emergency contact")
                            .pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(Pc.ink3)
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 16).fill(Pc.red.opacity(0.08)))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Pc.red.opacity(0.4), lineWidth: 1))
            }
            .buttonStyle(.pcPress)
            .accessibilityLabel("SOS. Get help on your trip")
            .padding(.horizontal, 14)
            .padding(.bottom, 8)
            .sheet(isPresented: $open) { SosSheet().presentationDetents([.large]).pcSheet() }
        }
    }
}

struct SosSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var sending = false
    @State private var error: String?
    @State private var holding = false
    @State private var hold: Double = 0

    var body: some View {
        let status = app.safety.sos
        let alert = app.safety.activeAlert
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: alert == nil ? "SOS" : "Help is on the way",
                            subtitle: alert == nil ? "Hold the button for 2 seconds. We send your location to your host, the UnSOLO team and your emergency contact."
                                : "We've told the people below. Call them now if you can.")
                if alert == nil {
                    if let trip = status?.trips.first { Text("On \(trip.title)").pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink2) }
                    TextField("What's happening? (optional)", text: $note, axis: .vertical)
                        .lineLimit(2...4).padding(12).pcField()
                    holdButton
                    if let error { Text(error).pcFont(.small).foregroundStyle(Pc.red) }
                    if status?.emergencyContact == nil {
                        Button("Add an emergency contact") { dismiss(); router.push(.editProfile) }.buttonStyle(.pcLink)
                    }
                } else if let alert {
                    if let n = alert.notified, !n.isEmpty {
                        Text(notifiedText(n)).pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                }
                Overline(text: "Call or message directly").padding(.top, 6)
                contactRow("phone.fill", "Emergency (112)", "112") { call("112") }
                if let h = alert?.host, let p = h.phone { contactRow("phone.fill", "Call \(h.name ?? "your host")", p) { call(p) } }
                if let e = alert?.emergencyContact ?? status?.emergencyContact {
                    contactRow("phone.fill", "Call \(e.name ?? "your emergency contact")", e.phone) { call(e.phone) }
                    contactRow("message.fill", "Text \(e.name ?? "them") your location", e.phone) { sms(e.phone, alert?.message) }
                }
                if let w = alert?.supportWhatsapp ?? status?.supportWhatsapp, !w.isEmpty {
                    contactRow("bubble.left.and.bubble.right.fill", "WhatsApp UnSOLO support", w) { whatsapp(w, alert?.message) }
                }
                if alert != nil {
                    Button("I'm safe now") {
                        Task {
                            if await app.safety.markSafe() { app.showToast("Glad you're safe. We've told the team."); dismiss() }
                            else { app.showToast("Couldn't update that. Try again.") }
                        }
                    }
                    .buttonStyle(.pc(.outline, fullWidth: true))
                    .padding(.top, 6)
                }
            }
            .padding(20)
        }
        .task { await app.safety.refreshSos() }
    }

    private var holdButton: some View {
        ZStack {
            Circle().fill(Pc.red).frame(width: 150, height: 150)
            Circle().trim(from: 0, to: hold).stroke(.white, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90)).frame(width: 136, height: 136)
            if sending { ProgressView().tint(.white).controlSize(.large) }
            else { Text("SOS").font(.system(size: 34, weight: .black)).foregroundStyle(.white) }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .onLongPressGesture(minimumDuration: 2, pressing: { p in
            holding = p
            withAnimation(p ? .linear(duration: 2) : .easeOut(duration: 0.2)) { hold = p ? 1 : 0 }
            if p { Haptics.tap() }
        }) { send() }
        .accessibilityElement()
        .accessibilityLabel("Send SOS")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { send() }
        .disabled(sending)
    }

    private func send() {
        guard !sending else { return }
        sending = true
        error = nil
        Task {
            let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
            switch await app.safety.raiseSos(note: text.isEmpty ? nil : text, bookingId: app.safety.sos?.trips.first?.bookingId) {
            case .success: break
            case .failure(let e): error = e.message
            }
            sending = false
            hold = 0
        }
    }

    private func notifiedText(_ n: [String: String]) -> String {
        var parts: [String] = []
        if n["team"] != nil { parts.append("the UnSOLO team") }
        if n["host"] != nil { parts.append("your host") }
        if n["emergencySms"] == "sent" { parts.append("your emergency contact (SMS)") }
        return parts.isEmpty ? "Your alert is saved. Call for help directly below." : "Told \(ListFormatter.localizedString(byJoining: parts))."
    }

    private func contactRow(_ icon: String, _ title: String, _ detail: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon).foregroundStyle(Pc.red).frame(width: 26)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                    Text(detail).pcFont(.small).foregroundStyle(Pc.ink2)
                }
                Spacer()
            }
            .padding(12)
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Pc.rule, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.pcPress)
    }

    private func digits(_ p: String) -> String { p.filter { $0.isNumber || $0 == "+" } }
    private func call(_ p: String) { if let u = URL(string: "tel:\(digits(p))") { openURL(u) } }
    private func sms(_ p: String, _ body: String?) {
        let b = (body ?? "I need help. Please call me.").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let u = URL(string: "sms:\(digits(p))&body=\(b)") { openURL(u) }
    }
    private func whatsapp(_ p: String, _ body: String?) {
        let n = p.filter(\.isNumber)
        let b = (body ?? "SOS: I need help on my UnSOLO trip.").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let u = URL(string: "https://wa.me/\(n)?text=\(b)") { openURL(u) }
    }
}

// MARK: - Live location in trip groups

/// Who's sharing their location in this group, on a map; start (15 min – 8 h) or stop your own.
struct LiveLocationSheet: View {
    let roomId: String
    @Environment(AppModel.self) private var app
    @State private var busy = false
    @State private var position: MapCameraPosition = .automatic

    private static let durations: [(Int, String)] = [(15, "15 min"), (60, "1 hour"), (240, "4 hours"), (480, "8 hours")]

    var body: some View {
        let items = app.safety.live[roomId] ?? []
        let sharingHere = app.safety.sharing?.roomId == roomId
        VStack(alignment: .leading, spacing: 12) {
            SheetHeader(title: "Live location", subtitle: "Share where you are with this group for a while. It stops by itself.")
            Map(position: $position) {
                ForEach(items) { l in
                    Annotation(l.mine == true ? "You" : l.user.firstName, coordinate: CLLocationCoordinate2D(latitude: l.lat, longitude: l.lng)) {
                        Avatar(user: l.user, size: 34, ring: l.mine == true ? Pc.gold : Pc.raised)
                    }
                }
                UserAnnotation()
            }
            .mapControls { MapUserLocationButton(); MapCompass() }
            .frame(height: 300)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            if items.isEmpty {
                Text("No one is sharing right now.").pcFont(.small).foregroundStyle(Pc.ink2)
            } else {
                ForEach(items) { l in
                    HStack(spacing: 10) {
                        Avatar(user: l.user, size: 30)
                        Text(l.mine == true ? "You" : l.user.name).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                        Spacer()
                        if let u = l.updatedAt { Text("updated \(Fmt.relative(u))").pcFont(.small).foregroundStyle(Pc.ink2) }
                    }
                }
            }
            if sharingHere, let until = app.safety.sharing?.until {
                Text("You're sharing until \(Fmt.time(until)). Keep UnSOLO open so it stays fresh.").pcFont(.small).foregroundStyle(Pc.ink2)
                Button(busy ? "Stopping…" : "Stop sharing") {
                    busy = true
                    Task { await app.safety.stopSharing(); busy = false }
                }
                .buttonStyle(.pc(.outline, fullWidth: true))
            } else {
                Overline(text: "Share mine for")
                HStack(spacing: 8) {
                    ForEach(Self.durations, id: \.0) { d in
                        Button(d.1) {
                            busy = true
                            Task {
                                if let err = await app.safety.startSharing(roomId: roomId, minutes: d.0) { app.showToast(err) }
                                else { app.showToast("Sharing your location with the group for \(d.1).") }
                                busy = false
                            }
                        }
                        .buttonStyle(.pc(.quiet, fullWidth: true, compact: true))
                        .disabled(busy)
                    }
                }
            }
        }
        .padding(20)
        .task {
            await app.safety.refreshLive(roomId)
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(20))
                await app.safety.refreshLive(roomId)
            }
        }
    }
}

// MARK: - Travel buddies

/// People going where you're going: same departure, same place within a week, the same saved trips.
struct BuddiesView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                Text("People going where you're going: the same departure, the same place within a week, or the same saved trips.")
                    .pcFont(.small).foregroundStyle(Pc.ink2).padding(.horizontal, 16)
                if let list = app.safety.buddies {
                    if list.isEmpty {
                        EmptyState(symbol: "person.2.wave.2", title: "No matches yet",
                                   message: "Book a trip or save a few, and travellers headed the same way show up here.")
                    }
                    ForEach(list) { b in row(b) }
                } else if app.safety.buddiesFailed {
                    EmptyState(symbol: "wifi.slash", title: "Couldn't load travel buddies", message: "Pull to try again.")
                } else {
                    VStack(spacing: 12) { ForEach(0..<5, id: \.self) { _ in SkeletonBlock(height: 64) } }.padding(16)
                }
            }
            .padding(.vertical, 10)
        }
        .refreshable { await app.safety.refreshBuddies() }
        .pcScreen()
        .pcNavigationBar("Travel buddies")
        .task { await app.safety.refreshBuddies() }
    }

    private func row(_ b: Buddy) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { router.push(.profile(username: b.user.username)) } label: { PersonRow(user: b.user) }.buttonStyle(.plain)
            if !b.reasons.isEmpty {
                FlowLayout(spacing: 6) { ForEach(b.reasons, id: \.self) { PcTag(text: $0, style: .kind) } }
            }
            HStack(spacing: 8) {
                if let t = b.trip { Button(t.title) { router.push(.trip(slug: t.slug)) }.buttonStyle(.pc(.quiet, compact: true)) }
                if let p = b.planId, DeepLink.isUUID(p) { Button("See plan") { router.push(.post(id: p)) }.buttonStyle(.pc(.quiet, compact: true)) }
                Spacer()
                Button("Message") {
                    Task { if let room = await app.chat.directChat(with: b.user.id) { router.push(.chat(roomId: room, title: b.user.name)) } }
                }
                .buttonStyle(.pc(.outline, compact: true))
            }
        }
        .padding(14)
        .pcCard()
        .padding(.horizontal, 16)
    }
}

// MARK: - Offline trip pack

/// Everything for a booked trip, saved on the phone: dates and times, code, what's included, host and
/// travellers, the group chat, support and helplines. Opens with no signal.
struct TripPackView: View {
    let bookingId: String
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.openURL) private var openURL
    @State private var refreshing = true
    @State private var failed = false

    var body: some View {
        ScrollView {
            if let p = app.safety.pack(bookingId) {
                content(p)
            } else if failed {
                EmptyState(symbol: "wifi.slash", title: "Trip pack isn't saved yet", message: "Open this once with a connection and it stays on your phone.")
            } else {
                VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in SkeletonBlock(height: 80) } }.padding(16)
            }
        }
        .refreshable { await load() }
        .pcScreen()
        .pcNavigationBar("Trip pack")
        .task { await load() }
    }

    private func load() async {
        refreshing = true
        let ok = await app.safety.refreshPack(bookingId)
        failed = !ok && app.safety.pack(bookingId) == nil
        refreshing = false
    }

    @ViewBuilder private func content(_ p: TripPack) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if let at = p.generatedAt {
                Label("Saved on this phone · \(Fmt.relative(at))", systemImage: "arrow.down.circle.fill").pcFont(.small, weight: .semibold).foregroundStyle(Pc.green)
            }
            Text(p.trip?.title ?? "Your trip").pcFont(.title1).foregroundStyle(Pc.ink)
            VStack(alignment: .leading, spacing: 8) {
                fact("calendar", "Dates", Fmt.range(p.startDate, p.endDate))
                if let t = p.departureTime { fact("clock", "Leaves", t) }
                if let t = p.returnTime { fact("clock.arrow.circlepath", "Back", t) }
                if let c = p.confirmationCode { fact("number", "Booking code", c) }
                if let g = p.guests { fact("person.2", "Travellers", "\(g)") }
                if let bal = p.balancePaise, bal > 0 { fact("indianrupeesign.circle", "Balance due", Fmt.rupees(bal)) }
                if let r = p.specialRequests, !r.isEmpty { fact("text.bubble", "Your requests", r) }
            }
            .padding(14).pcCard()
            if !p.includes.isEmpty {
                section("What's included") { ForEach(p.includes, id: \.self) { Label($0, systemImage: "checkmark").pcFont(.body).foregroundStyle(Pc.ink) } }
            }
            if let h = p.host, let u = h.user {
                section("Your host") {
                    HStack {
                        PersonRow(user: u)
                        if let ph = h.phone { Button("Call") { tel(ph) }.buttonStyle(.pc(.quiet, compact: true)) }
                    }
                }
            }
            if !p.travellers.isEmpty {
                section("Travelling with") { FaceStack(users: Array(p.travellers.prefix(8)), size: 30, extra: max(0, p.travellers.count - 8)) }
            }
            if let room = p.chatRoomId {
                Button { router.push(.chat(roomId: room, title: p.trip?.title)) } label: { Label("Open the group chat", systemImage: "bubble.left.and.bubble.right.fill") }
                    .buttonStyle(.pc(.primary, fullWidth: true))
            }
            if let d = p.description, !d.isEmpty { section("About the trip") { Text(d).pcFont(.body).foregroundStyle(Pc.ink) } }
            if let c = p.cancellationPolicy, !c.isEmpty { section("Cancellation") { Text(c).pcFont(.small).foregroundStyle(Pc.ink2) } }
            section("Help") {
                if let w = p.support?.whatsapp {
                    Button { if let u = URL(string: "https://wa.me/\(w.filter(\.isNumber))") { openURL(u) } } label: { Label("WhatsApp UnSOLO support", systemImage: "message") }
                        .buttonStyle(.pcLink)
                }
                ForEach(p.helplines, id: \.phone) { h in
                    Button { tel(h.phone) } label: { Label("\(h.label) · \(h.phone)", systemImage: "phone") }.buttonStyle(.pcLink)
                }
            }
        }
        .padding(16)
    }

    private func tel(_ p: String) { if let u = URL(string: "tel:\(p.filter { $0.isNumber || $0 == "+" })") { openURL(u) } }

    private func fact(_ icon: String, _ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).foregroundStyle(Pc.ink2).frame(width: 22)
            Text(label).pcFont(.small).foregroundStyle(Pc.ink2).frame(width: 96, alignment: .leading)
            Text(value).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
            Spacer(minLength: 0)
        }
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Overline(text: title)
            content()
        }
    }
}

// MARK: - Reviews with photos

struct ReviewComposeItem: Identifiable, Equatable {
    let bookingId: String
    let title: String
    var id: String { bookingId }
}

/// "How was {trip}?": two ratings, a few words and up to 6 photos. One review per booking.
struct ReviewComposer: View {
    let item: ReviewComposeItem
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var destination = 0
    @State private var experience = 0
    @State private var title = ""
    @State private var text = ""
    @State private var photos: [Data] = []
    @State private var sending = false
    @State private var progress: Double = 0
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("How was \(item.title)?").pcFont(.title1).foregroundStyle(Pc.ink)
                    stars("The place", $destination)
                    stars("The trip and your host", $experience)
                    FormRow(label: "Title (optional)") { PcTextField(placeholder: "Best weekend of the year", text: $title) }.padding(.horizontal, -16)
                    FormRow(label: "Tell others") { PcTextField(placeholder: "What made it, what to know before going", text: $text, axis: .vertical) }.padding(.horizontal, -16)
                    FormRow(label: "Photos") { PhotosField(photos: $photos, max: 6) }.padding(.horizontal, -16)
                    if sending && !photos.isEmpty { ProgressView(value: progress).tint(Pc.gold) }
                    if let error { Text(error).pcFont(.small).foregroundStyle(Pc.red) }
                }
                .padding(20)
            }
            .pcScreen()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(sending) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(sending ? "Posting…" : "Post") { send() }.buttonStyle(.pc(.accent, compact: true))
                        .disabled(destination == 0 || experience == 0 || sending)
                }
            }
        }
        .interactiveDismissDisabled(sending)
    }

    private func stars(_ label: String, _ value: Binding<Int>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink)
            HStack(spacing: 6) {
                ForEach(1...5, id: \.self) { i in
                    Button { value.wrappedValue = i; Haptics.tick() } label: {
                        Image(systemName: i <= value.wrappedValue ? "star.fill" : "star").font(.system(size: 28)).foregroundStyle(i <= value.wrappedValue ? Pc.gold : Pc.rule2)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(i) star\(i == 1 ? "" : "s")")
                    .accessibilityAddTraits(i == value.wrappedValue ? .isSelected : [])
                }
            }
        }
    }

    private func send() {
        sending = true
        error = nil
        Task {
            defer { sending = false }
            var urls: [String] = []
            for (i, raw) in photos.enumerated() {
                guard let jpeg = await Task.detached(priority: .userInitiated, operation: { try? ImageCompressor.compress(raw).data }).value else {
                    error = "Couldn't read a photo. Try another."; return
                }
                do {
                    let m = try await app.api.upload(jpeg: jpeg, purpose: "review") { _ in }
                    urls.append(m.url)
                    progress = Double(i + 1) / Double(photos.count)
                } catch {
                    self.error = (error as? APIError)?.errorDescription ?? "Couldn't upload a photo."; return
                }
            }
            do {
                _ = try await app.api.postReview(ReviewBody(bookingId: item.bookingId, ratingDestination: destination, ratingExperience: experience,
                                                            title: title.isEmpty ? nil : title, body: text.isEmpty ? nil : text, photos: urls))
                Haptics.success()
                app.showToast("Thanks! Your review is up.")
                await app.trips.refresh()
                dismiss()
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? "Couldn't post your review. Try again."
            }
        }
    }
}

/// Reviews on a trip page, ones with photos first.
struct TripReviewsSection: View {
    let reviews: [TripReview]
    @State private var viewing: Media?

    var body: some View {
        if !reviews.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: "Reviews", trailing: "\(reviews.count)")
                ForEach(reviews.prefix(6)) { r in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 8) {
                            if let a = r.author { Avatar(user: a, size: 26); Text(a.firstName).pcFont(.small, weight: .bold).foregroundStyle(Pc.ink) }
                            let n = min(5, max(0, r.rating ?? 0))
                            Text(String(repeating: "★", count: n) + String(repeating: "☆", count: 5 - n)).pcFont(.small).foregroundStyle(Pc.goldInk)
                            Spacer()
                            if let at = r.createdAt { Text(Fmt.relative(at)).pcFont(.label).foregroundStyle(Pc.ink3) }
                        }
                        if let t = r.title, !t.isEmpty { Text(t).pcFont(.bodyStrong).foregroundStyle(Pc.ink) }
                        if let b = r.body, !b.isEmpty { Text(b).pcFont(.body).foregroundStyle(Pc.ink).lineLimit(6) }
                        if !r.photos.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) {
                                    ForEach(Array(r.photos.enumerated()), id: \.offset) { _, m in
                                        Button { viewing = m } label: {
                                            PcAsyncImage(media: m, targetSize: CGSize(width: 96, height: 96)).frame(width: 96, height: 96).clipShape(Pc.shape(12))
                                        }
                                        .buttonStyle(.pcPress)
                                        .accessibilityLabel("Review photo")
                                    }
                                }
                            }
                        }
                    }
                    .padding(12)
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Pc.rule, lineWidth: 1))
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 26)
            .fullScreenCover(item: Binding(get: { viewing.map { IdentifiedMedia(media: $0) } }, set: { viewing = $0?.media })) { m in
                ZStack(alignment: .topTrailing) {
                    Color.black.ignoresSafeArea()
                    PcAsyncImage(media: m.media, contentMode: .fit).ignoresSafeArea()
                    Button { viewing = nil } label: {
                        Image(systemName: "xmark").font(.system(size: 16, weight: .bold)).foregroundStyle(.white).frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Close")
                    .padding()
                }
            }
        }
    }

    private struct IdentifiedMedia: Identifiable { let media: Media; var id: String { media.url } }
}
