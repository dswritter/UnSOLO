import SwiftUI

struct MyTripsView: View {
    enum Segment: Hashable { case upcoming, plans, past }
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @State private var segment: Segment = .upcoming

    private var my: MyTripsResponse { app.trips.myTrips }

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                AppHeader(title: "Bookings").id("top")
                if !session.isSignedIn {
                    signedOut
                } else {
                    SosBar()
                    ChipTabs(items: [(.upcoming, "Upcoming · \(my.upcoming.count)"), (.plans, "Plans · \(my.plans.count + my.requested.count)"), (.past, "Past · \(my.past.count)")],
                             selection: $segment)
                        .padding(.bottom, 8)
                    switch segment {
                    case .upcoming: upcoming
                    case .plans: plans
                    case .past: past
                    }
                }
            }
        }
        .refreshable {
            async let a: Void = app.trips.refresh()
            async let b: Void = app.chat.refreshChats()
            _ = await (a, b)
        }
        .onChange(of: router.reselected[.trips]) { _, _ in withAnimation { proxy.scrollTo("top", anchor: .top) } }
        }
        .signInBar(!session.isSignedIn)
        .pcScreen()
        .toolbar(.hidden, for: .navigationBar)
        .task(id: session.isSignedIn) {
            await app.trips.refresh()
            await app.chat.refreshChats()
        }
    }

    private var signedOut: some View {
        SignInInvite(message: "Sign in to see the trips, stays and rentals you book, the plans you join and their group chats.")
    }

    @ViewBuilder private var upcoming: some View {
        if my.upcoming.isEmpty {
            if my.past.isEmpty {
                EmptyState(symbol: "ticket", title: "No bookings yet", message: "Grab a spot on a trip, book a stay or a rental, or ask to join a plan in Tribe.")
            } else {
                EmptyState(symbol: "ticket", title: "Nothing coming up yet.", message: nil)
            }
            Button(my.past.isEmpty ? "Explore" : "Find your next") { router.select(.explore) }.buttonStyle(.pc(.outline, fullWidth: true)).padding(.horizontal, 20)
        }
        VStack(spacing: 12) {
            ForEach(my.upcoming) { b in TicketCard(booking: b) }
            if let r = my.past.first(where: { $0.canReview == true }) { PastTripCard(booking: r) }
            else if let last = my.past.first(where: { $0.storyPrompt == true }) { PastTripCard(booking: last) }
            if !my.upcoming.isEmpty || !my.past.isEmpty {
                Button { router.push(.buddies) } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "person.2.wave.2").font(.system(size: 16)).foregroundStyle(Pc.ink).frame(width: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Travel buddies").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                            Text("People going where you're going").pcFont(.small).foregroundStyle(Pc.ink2)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(Pc.ink3)
                    }
                    .padding(14)
                    .pcCard()
                }
                .buttonStyle(.pcPress)
            }
        }
        .padding(.horizontal, 14)
        Color.clear.frame(height: 20)
    }

    @ViewBuilder private var plans: some View {
        if my.plans.isEmpty && my.requested.isEmpty {
            EmptyState(symbol: "person.3", title: "No plans yet", message: "Plans you organise, join or request show up here.")
        }
        VStack(spacing: 12) {
            ForEach(my.plans) { p in PlanTripCard(post: app.tribe.posts[p.id] ?? p) }
            ForEach(my.requested) { p in PlanTripCard(post: app.tribe.posts[p.id] ?? p) }
        }
        .padding(.horizontal, 14)
        Color.clear.frame(height: 20)
    }

    @ViewBuilder private var past: some View {
        if my.past.isEmpty { EmptyState(symbol: "clock.arrow.circlepath", title: "Nothing past yet", message: "Trips, stays and activities you've done show up here.") }
        VStack(spacing: 12) { ForEach(my.past) { b in PastTripCard(booking: b) } }
            .padding(.horizontal, 14)
        Color.clear.frame(height: 20)
    }
}

/// Booked trip: your circle (faces of co-travellers, your gold seat, host badge, trip photo in the centre),
/// countdown, booking code and balance, and "Meet the circle" (trip chat).
struct TicketCard: View {
    let booking: Booking
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    var body: some View {
        let days = Fmt.daysUntil(booking.travelDate) ?? 0
        let trip = booking.trip
        let counts = SeatCounts(trip: trip)
        let others = trip.goingFaces.filter { $0.id != trip.host?.id && $0.id != session.user?.id }
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 16) {
                if booking.isService {
                    // Stays, activities and rentals: no circle of seats, just the place.
                    PcAsyncImage(media: trip.image, targetSize: CGSize(width: 96, height: 96))
                        .frame(width: 96, height: 96).clipShape(Pc.shape(Pc.imageRadius))
                } else {
                    SeatRing(seats: RingSeats.trip(trip, you: session.user), size: 112, dots: .faces,
                             badge: trip.host.map { RingBadge(user: $0, kind: .host) }, centre: .photo(trip.image))
                }
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        PcTag(text: days <= 0 ? "Today" : days == 1 ? "Tomorrow" : "In \(days) days", style: .verified, icon: "calendar.badge.checkmark")
                        if booking.isService { PcTag(text: booking.kindLabel, style: .kind) }
                    }
                    Text(trip.title).pcFont(.title3).foregroundStyle(Pc.ink).lineLimit(2)
                    Text("\(Fmt.weekdayDayMonth(booking.travelDate)) · \(booking.guestsLabel)").pcFont(.small).foregroundStyle(Pc.ink2)
                    if !booking.isService { SeatCaption(counts: counts, font: .system(size: 12.5, weight: .semibold)) }
                    else if let place = trip.place?.name { Text(place).pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1) }
                }
                Spacer(minLength: 0)
            }
            if !others.isEmpty {
                HStack(spacing: 10) {
                    FaceStack(users: Array(others.prefix(4)), size: 26)
                    Text(ListFormatter.localizedString(byJoining: others.prefix(3).map(\.firstName) + ["you"]))
                        .pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                }
            }
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Booking code").font(.system(size: 11, weight: .bold)).foregroundStyle(Pc.ink2)
                    Text(booking.confirmationCode ?? "—").font(.system(size: 14, weight: .bold, design: .monospaced)).foregroundStyle(Pc.ink)
                }
                Spacer()
                if booking.balancePaise > 0 {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("Balance").font(.system(size: 11, weight: .bold)).foregroundStyle(Pc.ink2)
                        Text(Fmt.rupees(booking.balancePaise)).font(PcFont.rounded(14, .bold)).foregroundStyle(Pc.ink)
                    }
                    Button("Pay") { router.safari = SafariItem(url: AppInfo.webBaseURL.appendingPathComponent("bookings")) }
                        .buttonStyle(.pc(.outline, compact: true))
                } else {
                    PcTag(text: "\(Fmt.rupees(booking.paidPaise)) paid", style: .paid, icon: "checkmark.circle.fill")
                }
            }
            .padding(12)
            .background(Pc.tonal, in: Pc.shape(Pc.radius))
            Button { router.push(.tripPack(bookingId: booking.id)) } label: {
                Label(app.safety.pack(booking.id) != nil ? "Trip pack · saved offline" : "Trip pack", systemImage: "arrow.down.doc")
            }
            .buttonStyle(.pc(.quiet, fullWidth: true, compact: true))
            if let room = booking.chatRoomId {
                let unread = app.chat.chats.first { $0.id == room }?.unread ?? 0
                Button { router.push(.chat(roomId: room, title: booking.trip.title)) } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                        Text("Meet the circle")
                        if unread > 0 {
                            Text("\(unread)").font(.system(size: 11, weight: .heavy)).monospacedDigit()
                                .foregroundStyle(Pc.ink).padding(.horizontal, 7).frame(minHeight: 20).background(Capsule().fill(Pc.raised))
                        }
                    }
                }
                .buttonStyle(.pc(.primary, fullWidth: true))
            }
        }
        .padding(16)
        .pcCard()
        .contentShape(Rectangle())
        .onTapGesture { router.push(.trip(slug: booking.trip.slug)) }
        .accessibilityElement(children: .contain)
    }
}

/// Past trip: desaturated ring, "Went · date", and a prompt to post a story.
struct PastTripCard: View {
    let booking: Booking
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 16) {
                if booking.isService {
                    PcAsyncImage(media: booking.trip.image, targetSize: CGSize(width: 80, height: 80))
                        .frame(width: 80, height: 80).clipShape(Circle()).saturation(0.4)
                } else {
                    SeatRing(seats: RingSeats.trip(booking.trip, you: session.user), size: 80, past: true, dots: .none, centre: .photo(booking.trip.image))
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text("Went · \(Fmt.dayMonth(booking.travelDate))").font(.system(size: 12, weight: .bold)).foregroundStyle(Pc.ink3)
                    Text(booking.trip.title).pcFont(.title3).foregroundStyle(Pc.ink).lineLimit(2)
                    Text("\(booking.guestsLabel) · booking \(booking.confirmationCode ?? "")").pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            if booking.canReview == true {
                Button { router.reviewComposer = ReviewComposeItem(bookingId: booking.id, title: booking.trip.title) } label: {
                    Label("Review this trip", systemImage: "star.bubble")
                }
                .buttonStyle(.pc(.accent, fullWidth: true, compact: true))
            }
            if booking.storyPrompt == true {
                Button { router.openCompose(.story, tripSlug: booking.trip.slug) } label: {
                    Label("Post a story · +20 pts", systemImage: "camera.fill")
                }
                .buttonStyle(.pc(.quiet, fullWidth: true, compact: true))
            }
        }
        .padding(16)
        .pcCard()
        .contentShape(Rectangle())
        .onTapGesture { router.push(.trip(slug: booking.trip.slug)) }
        .accessibilityElement(children: .contain)
    }
}

/// Pencilled (dashed) plan card in My trips, with the plan ring.
struct PlanTripCard: View {
    let post: Post
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    var body: some View {
        let isOrganiser = post.viewer?.isAuthor == true
        let requested = post.viewer?.membership == .requested && !isOrganiser
        let requests = (app.tribe.requests[post.id] ?? []).filter { $0.state == .requested }.count
        let counts = SeatCounts(plan: post)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 16) {
                SeatRing(seats: RingSeats.plan(post), size: 88, plan: true, womenOnly: post.audience == .women,
                         dots: .none, centre: .user(post.author), waiting: requested ? session.user : nil)
                    .padding(.trailing, requested ? 18 : 0)
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 6) {
                        if isOrganiser { PcTag(text: "Organiser", style: .organiser) }
                        if post.audience == .women { PcTag(text: "Women only", style: .women) }
                    }
                    Text(post.displayTitle).pcFont(.title3).foregroundStyle(Pc.ink).lineLimit(2)
                    Text(Fmt.range(post.startsOn, post.endsOn)).pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
                    if requested {
                        Label("Waiting for \(post.author.firstName)", systemImage: "clock.fill").font(.system(size: 12, weight: .bold)).foregroundStyle(Pc.ink)
                    } else {
                        SeatCaption(counts: counts, noun: "spots", font: .system(size: 12.5, weight: .semibold))
                    }
                }
                Spacer(minLength: 0)
            }
            if post.viewer?.membership == .approved || isOrganiser {
                Button { router.push(.post(id: post.id)) } label: {
                    Label(isOrganiser && requests > 0 ? "Review \(requests) request\(requests == 1 ? "" : "s")" : "Open plan", systemImage: isOrganiser && requests > 0 ? "person.badge.clock.fill" : "arrow.right")
                }
                .buttonStyle(.pc(.quiet, fullWidth: true, compact: true))
            }
        }
        .padding(16)
        .pcPencilled()
        .contentShape(Rectangle())
        .onTapGesture { router.push(.post(id: post.id)) }
        .accessibilityElement(children: .contain)
    }
}

struct PastTripRow: View {
    let booking: Booking
    var showsDivider = true
    @Environment(Router.self) private var router

    var body: some View {
        HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(Fmt.dayNumber(booking.travelDate)).font(PcFont.rounded(19)).foregroundStyle(Pc.ink)
                Text(Fmt.monthShort(booking.travelDate)).font(.system(size: 10.5, weight: .heavy)).foregroundStyle(Pc.ink2)
            }
            .frame(width: 44)
            PcAsyncImage(media: booking.trip.image, targetSize: CGSize(width: 60, height: 60)).frame(width: 60, height: 60)
                .clipShape(Pc.shape(Pc.imageRadius))
            VStack(alignment: .leading, spacing: 2) {
                Text(booking.trip.title).font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(2)
                Text(booking.storyPrompt == true ? "Share it with your group · +20 pts" : "Booking \(booking.confirmationCode ?? "")").pcFont(.small).foregroundStyle(Pc.ink2)
            }
            Spacer(minLength: 4)
            if booking.storyPrompt == true {
                Button("Post story") { router.openCompose(.story, tripSlug: booking.trip.slug) }
                    .buttonStyle(.pc(.primary, compact: true))
            } else {
                MiniArc(counts: SeatCounts(trip: booking.trip))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(minHeight: 84)
        .contentShape(Rectangle())
        .onTapGesture { router.push(.trip(slug: booking.trip.slug)) }
        .overlay(alignment: .bottom) { if showsDivider { HairlineRule().padding(.leading, 70) } }
    }
}

extension Booking {
    /// A stay, activity or rental (service booking), not a group trip.
    var isService: Bool { trip.isListing || ["stay", "activity", "rental"].contains(trip.kind ?? "") }
    var kindLabel: String {
        switch trip.kind {
        case "stay": "Stay"
        case "activity": "Activity"
        case "rental": "Rental"
        default: "Trip"
        }
    }
    var guestsLabel: String {
        switch trip.kind {
        case "stay": "\(guests) guest\(guests == 1 ? "" : "s")"
        case "rental": "\(guests) booked"
        case "activity": "\(guests) \(guests == 1 ? "person" : "people")"
        default: "\(guests) spot\(guests == 1 ? "" : "s")"
        }
    }
}
