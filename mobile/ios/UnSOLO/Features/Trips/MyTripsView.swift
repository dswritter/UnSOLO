import SwiftUI

struct MyTripsView: View {
    enum Segment: Hashable { case upcoming, plans, past }
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @State private var segment: Segment = .upcoming

    private var my: MyTripsResponse { app.trips.myTrips }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                AppHeader(title: "My trips")
                if !session.isSignedIn {
                    signedOut
                } else {
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
        .refreshable { await app.trips.refresh() }
        .pcScreen()
        .toolbar(.hidden, for: .navigationBar)
        .task(id: session.isSignedIn) {
            await app.trips.refresh()
            await app.chat.refreshChats()
        }
    }

    private var signedOut: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your bookings, plans and trip circles live here.").pcFont(.body).foregroundStyle(Pc.ink)
            Button("Sign in") { router.authSheet = true }.buttonStyle(.pc(.primary, fullWidth: true))
        }
        .padding(20)
    }

    @ViewBuilder private var upcoming: some View {
        if my.upcoming.isEmpty {
            EmptyState(symbol: "ticket", title: "No trips yet", message: "Grab a spot on a hosted trip or join a plan in the Tribe.")
            Button("Explore departures") { router.select(.explore) }.buttonStyle(.pc(.outline, fullWidth: true)).padding(.horizontal, 20)
        }
        VStack(spacing: 12) {
            ForEach(my.upcoming) { b in TicketCard(booking: b) }
            if let last = my.past.first(where: { $0.storyPrompt == true }) { PastTripCard(booking: last) }
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
        if my.past.isEmpty { EmptyState(symbol: "clock.arrow.circlepath", title: "No past trips yet") }
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
                SeatRing(seats: RingSeats.trip(trip, you: session.user), size: 112, dots: .faces,
                         badge: trip.host.map { RingBadge(user: $0, kind: .host) }, centre: .photo(trip.image))
                VStack(alignment: .leading, spacing: 6) {
                    PcTag(text: days <= 0 ? "Today" : "In \(days) day\(days == 1 ? "" : "s")", style: .verified, icon: "calendar.badge.checkmark")
                    Text(trip.title).pcFont(.title3).foregroundStyle(Pc.ink).lineLimit(2)
                    Text("\(Fmt.weekdayDayMonth(booking.travelDate)) · \(booking.guests) spot\(booking.guests == 1 ? "" : "s")").pcFont(.small).foregroundStyle(Pc.ink2)
                    SeatCaption(counts: counts, font: .system(size: 12.5, weight: .semibold))
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
                SeatRing(seats: RingSeats.trip(booking.trip, you: session.user), size: 80, past: true, dots: .none, centre: .photo(booking.trip.image))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Went · \(Fmt.dayMonth(booking.travelDate))").font(.system(size: 12, weight: .bold)).foregroundStyle(Pc.ink3)
                    Text(booking.trip.title).pcFont(.title3).foregroundStyle(Pc.ink).lineLimit(2)
                    Text("\(booking.guests) spot\(booking.guests == 1 ? "" : "s") · booking \(booking.confirmationCode ?? "")").pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                }
                Spacer(minLength: 0)
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
