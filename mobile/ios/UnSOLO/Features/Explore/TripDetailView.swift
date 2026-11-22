import SwiftUI

/// Trip detail: full-bleed cover over the top ~45 % with round back/share buttons, the 240 pt seat ring
/// overlapping the cover's bottom edge (host badge on top, trip photo in the centre), facts, departures,
/// includes, stories, and a sticky bottom bar with save, price and "Grab a spot" (web checkout).
struct TripDetailView: View {
    let slug: String
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var page = 0
    @State private var selectedDate: String?
    @State private var showGoing = false

    private var detail: TripDetail? { app.explore.details[slug] }
    private var lite: TripLite? { detail?.lite ?? app.explore.trip(slug: slug) }
    private var booking: Booking? { app.trips.myTrips.upcoming.first { $0.trip.slug == slug } }
    /// Co-travellers (booked, or the API marks a seat as yours) see faces; signed-in viewers initials; signed-out none.
    private var isCoTraveller: Bool { booking != nil || (detail?.seats.contains { $0.state == .you } ?? false) }
    private var dots: RingDots { !session.isSignedIn ? .none : (isCoTraveller ? .faces : .initials) }

    /// The ring and caption follow the selected departure. Seat-level data (faces, your seat) only exists
    /// for the next departure; other dates show anonymous counts.
    private func selectedDeparture(_ t: TripLite) -> Departure? {
        guard let date = selectedDate, date != t.nextDeparture else { return nil }
        return detail?.departures.first { $0.date == date }
    }

    private func seatCounts(_ t: TripLite) -> SeatCounts {
        selectedDeparture(t).map { SeatCounts(departure: $0, hasHost: t.host != nil) } ?? SeatCounts(trip: t)
    }

    private func ringSeats(_ t: TripLite) -> [RingSeat] {
        if selectedDeparture(t) != nil {
            let c = seatCounts(t)
            return Array(repeating: .taken(nil), count: c.going) + Array(repeating: .open, count: c.open)
        }
        return RingSeats.trip(t, detailSeats: detail?.seats ?? [], you: booking != nil ? session.user : nil)
    }

    var body: some View {
        Group {
            if let lite {
                ScrollView {
                    VStack(spacing: 0) {
                        cover(lite)
                        ringBlock(lite)
                        header(lite)
                        if let d = detail {
                            if !d.isListing { departures(d) }
                            includes(d)
                        }
                        host(lite)
                        if let d = detail {
                            stories(d)
                            TripReviewsSection(reviews: d.reviews ?? [])
                            if let desc = d.description, !desc.isEmpty {
                                section("About this trip") { Text(desc).pcFont(.body).foregroundStyle(Pc.ink).fixedSize(horizontal: false, vertical: true) }
                            }
                        } else if case .failed(let m) = app.explore.detailState[slug] {
                            Text(m).pcFont(.small).foregroundStyle(Pc.ink2).padding(16)
                        }
                        Color.clear.frame(height: 24)
                    }
                }
                .ignoresSafeArea(edges: .top)
                .overlay(alignment: .top) { topButtons(lite) }
                .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar(lite) }
            } else {
                ProgressView().tint(Pc.ink2).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .pcScreen()
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $showGoing) {
            if let lite {
                WhoIsGoingSheet(trip: lite, seats: detail?.seats ?? [], you: booking != nil ? session.user : nil, dots: dots,
                                takeSeat: { showGoing = false; app.openBooking(slug: slug, date: selectedDate ?? lite.nextDeparture) })
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .pcSheet()
            }
        }
        .task {
            if session.isSignedIn && app.trips.myTrips.upcoming.isEmpty { await app.trips.refresh() }
            await app.explore.refreshDetail(slug)
            if selectedDate == nil { selectedDate = detail?.departures.first(where: { $0.seatsLeft > 0 })?.date ?? lite?.nextDeparture }
            #if DEBUG
            if DebugLaunch.startScreen == "tripFull" { selectedDate = lite?.nextDeparture }
            #endif
            await app.analytics.track("trip.view", screen: "trip_detail", props: ["slug": slug])
        }
        .onAppear {
            #if DEBUG
            if DebugLaunch.startScreen == "whosGoing" {
                Task { try? await Task.sleep(for: .milliseconds(700)); showGoing = true }
            }
            #endif
        }
    }

    // MARK: Cover

    private func cover(_ t: TripLite) -> some View {
        let images = (detail?.images.isEmpty == false ? detail!.images : [t.image].compactMap { $0 })
        return ZStack(alignment: .bottom) {
            TabView(selection: $page) {
                ForEach(Array(images.enumerated()), id: \.offset) { i, m in
                    PcAsyncImage(media: m).tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            LinearGradient(colors: [PcTokens.light.ink.opacity(0.35), .clear, .clear, PcTokens.light.ink.opacity(0.4)], startPoint: .top, endPoint: .bottom)
                .allowsHitTesting(false)
            if images.count > 1 {
                HStack(spacing: 5) {
                    ForEach(0..<images.count, id: \.self) { i in
                        Capsule().fill(.white.opacity(i == page ? 1 : 0.5)).frame(width: i == page ? 16 : 6, height: 6)
                    }
                }
                .padding(.bottom, PcTokens.ringHero / 2 + 14)
                .accessibilityElement()
                .accessibilityLabel("Photo \(page + 1) of \(images.count)")
            }
        }
        .containerRelativeFrame(.vertical) { h, _ in max(280, h * 0.4) }
        .clipped()
    }

    private func topButtons(_ t: TripLite) -> some View {
        HStack(spacing: 4) {
            GlassIconButton(systemName: "arrow.left", label: "Back") { dismiss() }
            Spacer()
            ShareLink(item: DeepLink.trip(slug: slug).webURL, subject: Text(t.title)) {
                GlassIcon(systemName: "square.and.arrow.up")
            }
            .accessibilityLabel("Share trip")
            SaveTripButton(slug: slug).padding(.top, 4)
        }
        .padding(.horizontal, 10)
    }

    // MARK: Ring

    private func ringBlock(_ t: TripLite) -> some View {
        let counts = seatCounts(t)
        let centreImage = (detail?.images.count ?? 0) > 1 ? detail?.images[1] : t.image
        return Button { showGoing = true } label: {
            SeatRing(seats: ringSeats(t),
                     size: PcTokens.ringHero, dots: selectedDeparture(t) == nil ? dots : .none,
                     badge: t.host.map { RingBadge(user: $0, kind: .host) },
                     centre: .photo(centreImage),

                     spinOnAppear: counts.isFull,
                     accessibilityText: "\(counts.accessibilityText()). Show who's going",
                     centreSpots: counts)
                .padding(6)
                .background(Circle().fill(Pc.paper))
        }
        .buttonStyle(.pcPress)
        .padding(.top, -(PcTokens.ringHero / 2 + 2))
    }

    private func header(_ t: TripLite) -> some View {
        let counts = seatCounts(t)
        let back = Fmt.day(selectedDate ?? t.nextDeparture).flatMap { Fmt.calendar.date(byAdding: .day, value: max(0, t.durationDays - 1), to: $0) }.map(Fmt.ymd)
        return VStack(spacing: 6) {
            Text(t.title).pcFont(.title1).foregroundStyle(Pc.ink).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            hostLine(t)
            SeatCaption(counts: counts, font: .system(size: 14, weight: .semibold))
                .padding(.top, 8)
            if dots != .faces && counts.going > 0 {
                Label(session.isSignedIn ? "Faces show once you're travelling together" : "Sign in to see who's going", systemImage: "lock.fill")
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(Pc.ink3)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    FactChip(symbol: "calendar", text: Fmt.range(selectedDate ?? t.nextDeparture, back))
                    FactChip(symbol: "clock", text: Fmt.duration(t.durationDays))
                    if let r = detail?.rating, r.count > 0 { FactChip(symbol: "star.fill", text: "\(String(format: "%.1f", r.avg)) · \(r.count)") }
                }
                .padding(.horizontal, 16)
            }
            .padding(.horizontal, -20)
            .padding(.top, 10)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private func hostLine(_ t: TripLite) -> some View {
        let place = t.place?.name ?? ""
        if let host = t.host {
            (Text(place.isEmpty ? "hosted by " : "\(place) · hosted by ") + Text(host.name).fontWeight(.bold).foregroundStyle(Pc.ink)
             + (host.isIdVerified ? Text(" ") + Text(Image(systemName: "checkmark.seal.fill")).foregroundStyle(Pc.ink2) : Text("")))
                .font(.system(size: 14)).foregroundStyle(Pc.ink2).multilineTextAlignment(.center)
        } else if !place.isEmpty {
            Text(place).font(.system(size: 14)).foregroundStyle(Pc.ink2)
        }
    }

    // MARK: Sections

    private func host(_ t: TripLite) -> some View {
        Group {
            if let host = t.host {
                Button { router.push(.profile(username: host.username)) } label: {
                    HStack(spacing: 12) {
                        Avatar(user: host, size: 42, ring: Pc.rule)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(host.name).font(.system(size: 14.5, weight: .bold)).foregroundStyle(Pc.ink)
                                if host.isIdVerified { VerifiedBadge() }
                                PcTag(text: "Host", style: .host)
                            }
                            Text("Hosted on UnSOLO · \(detail?.rating.map { "\($0.count) reviews" } ?? "new host")").pcFont(.small).foregroundStyle(Pc.ink2)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold)).foregroundStyle(Pc.ink2)
                    }
                    .padding(14)
                    .pcCard()
                    .contentShape(Rectangle())
                }
                .buttonStyle(.pcPress)
                .padding(.horizontal, 16)
                .padding(.top, 22)
            }
        }
    }

    private func departures(_ d: TripDetail) -> some View {
        section("Departures", trailing: "\(d.departures.count)") {
            VStack(spacing: 8) {
                ForEach(d.departures, id: \.date) { dep in
                    let selected = (selectedDate ?? d.nextDeparture) == dep.date
                    let counts = SeatCounts(departure: dep, hasHost: d.host != nil)
                    Button { selectedDate = dep.date } label: {
                        HStack(spacing: 12) {
                            MiniArc(counts: counts, size: 36)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(Fmt.weekdayDayMonth(dep.date)).font(.system(size: 14, weight: .bold)).monospacedDigit().foregroundStyle(Pc.ink)
                                Text(counts.isFull ? "Full · \(counts.total)/\(counts.total)" : "\(counts.open) of \(counts.total) open")
                                    .pcFont(.small, weight: counts.isFull ? .bold : .regular).foregroundStyle(counts.isFull ? Pc.full : Pc.ink2)
                            }
                            Spacer()
                            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 19, weight: .bold)).foregroundStyle(selected ? Pc.ink : Pc.rule)
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: 52)
                        .pcSelectable(selected, radius: Pc.radius)
                        .opacity(counts.isFull && !selected ? 0.7 : 1)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.pcPress)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(Fmt.weekdayDayMonth(dep.date)), \(counts.accessibilityText())")
                    .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
    }

    @ViewBuilder private func includes(_ d: TripDetail) -> some View {
        if !d.includes.isEmpty {
            section("Includes") {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(d.includes, id: \.self) { item in
                        Label {
                            Text(item).pcFont(.body).foregroundStyle(Pc.ink)
                        } icon: {
                            Image(systemName: "checkmark.circle.fill").font(.system(size: 14.5, weight: .bold)).foregroundStyle(Pc.ink)
                        }
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .pcCard()
            }
        }
    }

    @ViewBuilder private func stories(_ d: TripDetail) -> some View {
        if !d.stories.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: "From people who went", trailing: "\(d.stories.count)")
                    .padding(.horizontal, 20)
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: 12) {
                        ForEach(d.stories) { s in
                            let post = app.tribe.posts[s.id] ?? s
                            Button { router.push(.post(id: post.id)) } label: { StoryMiniCard(post: post) }
                                .buttonStyle(.pcPress)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.top, 26)
        }
    }

    private func section<C: View>(_ title: String, trailing: String? = nil, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: title, trailing: trailing).padding(.horizontal, 4)
            content()
        }
        .padding(.horizontal, 16)
        .padding(.top, 26)
    }

    // MARK: Bottom bar

    private func bottomBar(_ t: TripLite) -> some View {
        let date = selectedDate ?? t.nextDeparture
        let left = detail?.departures.first { $0.date == date }?.seatsLeft ?? t.seatsLeft ?? 0
        let saved = app.marks.isSaved(slug)
        return HStack(spacing: 12) {
            Button { withAnimation(.snappy) { app.marks.toggleSaved(slug) } } label: {
                Image(systemName: saved ? "heart.fill" : "heart").font(.system(size: 16.5, weight: .bold))
                    .foregroundStyle(saved ? Pc.red : Pc.ink)
                    .frame(width: 44, height: 44)
                    .overlay(Circle().strokeBorder(Pc.rule, lineWidth: 1.5))
                    .contentShape(Circle())
            }
            .buttonStyle(.pcPress)
            .accessibilityLabel(saved ? "Saved" : "Save trip")
            if t.isListing {
                // Stays, activities and rentals: same native page, booking on the web listing.
                VStack(alignment: .leading, spacing: 1) {
                    PriceText(paise: t.priceFromPaise, unit: "/\(t.unit ?? "booking")")
                    Text(t.place?.name.components(separatedBy: ",").first ?? "").pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Button("Book") { app.openListing(t) }.buttonStyle(.pcAccent)
            } else {
            VStack(alignment: .leading, spacing: 1) {
                PriceText(paise: t.priceFromPaise)
                Text(left == 0 ? "Full on \(Fmt.dayMonth(date))" : "\(Fmt.dayMonth(date)) · \(left) spot\(left == 1 ? "" : "s") left")
                    .pcFont(.small).foregroundStyle(left == 0 ? Pc.full : Pc.ink2).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button(left == 0 ? "Join waitlist" : "Grab a spot") { app.openBooking(slug: slug, date: date) }
                .buttonStyle(.pcAccent)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .pcBarBackground()
    }
}

struct StoryMiniCard: View {
    let post: Post
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .bottomLeading) {
                PcAsyncImage(media: post.media.first)
                    .frame(width: 200, height: 125)
                    .clipShape(Pc.shape(Pc.imageRadius))
                Avatar(user: post.author, size: 28).background(Circle().fill(Pc.raised).padding(-2)).padding(10)
            }
            Text(post.displayTitle).font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(2).multilineTextAlignment(.leading)
            Text("\(post.author.firstName) · \(post.reactions.love) loved").pcFont(.small).foregroundStyle(Pc.ink2)
        }
        .frame(width: 200, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// "Who's going": the ring and its caption, then the host and every traveller (faces for co-travellers,
/// initials when signed in, anonymous when signed out), open spots summarised, and "Grab a spot" at the bottom.
struct WhoIsGoingSheet: View {
    let trip: TripLite
    let seats: [Seat]
    let you: UserLite?
    let dots: RingDots
    let takeSeat: () -> Void
    @Environment(\.dismiss) private var dismiss

    private var counts: SeatCounts { SeatCounts(trip: trip) }
    /// Same seats as the ring (n = seatsTotal; the host is listed separately, not as a seat).
    private var travellers: [Seat] {
        RingSeats.trip(trip, detailSeats: seats, you: you).compactMap { s in
            switch s {
            case .taken(let u): Seat(state: .member, user: u)
            case .you(let u): Seat(state: .you, user: u)
            case .held: Seat(state: .held, user: nil)
            case .open: nil
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                SeatRing(seats: RingSeats.trip(trip, detailSeats: seats, you: you), size: 150, dots: dots,
                         badge: trip.host.map { RingBadge(user: $0, kind: .host) }, centre: .photo(trip.image))
                    .padding(.top, 34)
                SeatCaption(counts: counts, font: .system(size: 14, weight: .semibold)).padding(.top, 10)
                Text("Who's going").pcFont(.title1).foregroundStyle(Pc.ink).padding(.top, 14).accessibilityAddTraits(.isHeader)
                VStack(spacing: 0) {
                    if let host = trip.host {
                        row(avatar: Avatar(user: host, size: 44, ring: Pc.rule), title: host.name, subtitle: "Runs this trip") {
                            PcTag(text: "Host", style: .host)
                        }
                    }
                    ForEach(Array(travellers.enumerated()), id: \.offset) { i, seat in
                        let isYou = seat.state == .you || seat.state == .held
                        row(avatar: travellerAvatar(seat.user, isYou: isYou), title: isYou ? "You" : name(seat), subtitle: "Spot \(i + 1)") {
                            if isYou { PcTag(text: "You", style: .held) }
                        }
                    }
                    if counts.open > 0 {
                        row(avatar: Circle().strokeBorder(Pc.seatOpen, lineWidth: 2).frame(width: 44, height: 44),
                            title: "\(counts.open) spot\(counts.open == 1 ? "" : "s") open", subtitle: counts.going == 0 ? "Be first in the circle" : "Take one before they go") { EmptyView() }
                    }
                }
                .padding(.top, 8)
                if dots != .faces {
                    Label(dots == .none ? "Sign in to see initials. Counts are always shown." : "Faces show once you're travelling together.", systemImage: "lock.fill")
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(Pc.ink3).padding(.top, 12)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack {
                PriceText(paise: trip.priceFromPaise)
                Spacer()
                if counts.open > 0 {
                    Button("Grab a spot", action: takeSeat).buttonStyle(.pcPrimary)
                } else {
                    Button("Close") { dismiss() }.buttonStyle(.pcQuiet)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 8)
            .pcBarBackground()
        }
    }

    private func row<A: View, T: View>(avatar: A, title: String, subtitle: String, @ViewBuilder trailing: () -> T) -> some View {
        HStack(spacing: 12) {
            avatar
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.ink)
                Text(subtitle).pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
            }
            Spacer()
            trailing()
        }
        .frame(minHeight: 56)
        .overlay(alignment: .bottom) { HairlineRule() }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func travellerAvatar(_ user: UserLite?, isYou: Bool) -> some View {
        if isYou {
            Text("You").font(.system(size: 12, weight: .heavy)).foregroundStyle(PcTokens.light.onGold)
                .frame(width: 44, height: 44).background(Circle().fill(Pc.gold)).overlay(Circle().strokeBorder(Pc.stroke, lineWidth: 1.5))
        } else if dots == .faces {
            Avatar(user: user, size: 44)
        } else {
            ZStack {
                Circle().fill(Pc.taken)
                if dots == .initials, let user {
                    Text(user.initials).font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.raised)
                } else {
                    Image(systemName: "person.fill").font(.system(size: 14.5, weight: .bold)).foregroundStyle(Pc.raised)
                }
            }
            .frame(width: 44, height: 44)
        }
    }

    private func name(_ seat: Seat) -> String {
        guard dots != .none, let user = seat.user else { return "Traveller" }
        return dots == .faces ? user.name : "Traveller · \(user.initials)"
    }
}
