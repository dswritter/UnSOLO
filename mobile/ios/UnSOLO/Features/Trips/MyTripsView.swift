import SwiftUI

struct MyTripsView: View {
    enum Segment: Hashable { case upcoming, past }
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
                    PcSegmented(items: [(.upcoming, "Upcoming · \(my.upcoming.count + my.plans.count + my.requested.count)"), (.past, "Past · \(my.past.count)")],
                                selection: $segment)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 12)
                    if segment == .upcoming { upcoming } else { past }
                }
            }
        }
        .refreshable { await app.trips.refresh() }
        .pcScreen()
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await app.trips.refresh()
            await app.chat.refreshChats()
        }
    }

    private var signedOut: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your bookings, plans and trip chats live here.").pcFont(.body).foregroundStyle(Pc.ink)
            Button("Sign in") { router.authSheet = true }.buttonStyle(.pc(.primary, fullWidth: true))
        }
        .padding(16)
    }

    @ViewBuilder private var upcoming: some View {
        if my.upcoming.isEmpty && my.plans.isEmpty && my.requested.isEmpty {
            EmptyState(symbol: "ticket", title: "No trips yet", message: "Take a seat on a hosted trip or join a plan in the Tribe.")
            Button("Explore departures") { router.select(.explore) }.buttonStyle(.pc(.outline, fullWidth: true)).padding(16)
        }
        ForEach(my.upcoming) { b in TicketCard(booking: b).padding(.horizontal, 20).padding(.bottom, 14) }
        if !my.plans.isEmpty {
            SectionHeader(title: "Plans you're in").padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 8)
            ForEach(my.plans) { p in PlanTripCard(post: app.tribe.posts[p.id] ?? p).padding(.horizontal, 20).padding(.bottom, 10) }
        }
        if !my.requested.isEmpty {
            SectionHeader(title: "Requested").padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 8)
            ForEach(my.requested) { p in PlanTripCard(post: app.tribe.posts[p.id] ?? p).padding(.horizontal, 20).padding(.bottom, 10) }
        }
        if let last = my.past.first(where: { $0.storyPrompt == true }) {
            SectionHeader(title: "Last trip").padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 8)
            PastTripRow(booking: last, showsDivider: false).pcCard().padding(.horizontal, 20)
        }
        Color.clear.frame(height: 20)
    }

    @ViewBuilder private var past: some View {
        if my.past.isEmpty { EmptyState(symbol: "clock.arrow.circlepath", title: "No past trips yet") }
        VStack(spacing: 0) { ForEach(my.past) { b in PastTripRow(booking: b) } }
            .pcCard().padding(.horizontal, 20)
    }
}

/// Ticket stub: countdown in days, booking code, balance, trip chat.
struct TicketCard: View {
    let booking: Booking
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        let days = Fmt.daysUntil(booking.travelDate) ?? 0
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(String(format: "%02d", max(0, days))).font(.system(size: 44, weight: .semibold).width(.condensed).monospacedDigit()).foregroundStyle(Pc.ink)
                        Text(days == 1 ? "day to go" : "days to go").pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                    Text(booking.trip.title).pcFont(.title2).foregroundStyle(Pc.ink).lineLimit(2)
                    Text("\(Fmt.weekdayDayMonth(booking.travelDate)) · \(booking.guests) seat\(booking.guests == 1 ? "" : "s") · hosted").pcFont(.small).foregroundStyle(Pc.ink2)
                }
                .padding(14)
                Spacer(minLength: 0)
                PcAsyncImage(media: booking.trip.image).frame(width: 92, height: 92)
                    .clipShape(Pc.shape(Pc.imageRadius))
                    .padding(14)
            }
            .fixedSize(horizontal: false, vertical: true)
            HairlineRule(dashed: true, color: Pc.rule2).padding(.horizontal, 14)
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Booking code").pcFont(.label).foregroundStyle(Pc.ink2)
                    Text(booking.confirmationCode ?? "—").pcFont(.bodyStrong).monospacedDigit().foregroundStyle(Pc.ink)
                }
                Spacer()
                if booking.balancePaise > 0 {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Balance").pcFont(.label).foregroundStyle(Pc.ink2)
                        Text(Fmt.rupees(booking.balancePaise)).pcFont(.bodyStrong).monospacedDigit().foregroundStyle(Pc.ink)
                    }
                    Button("Pay") { router.safari = SafariItem(url: AppInfo.webBaseURL.appendingPathComponent("bookings")) }
                        .buttonStyle(.pc(.outline, compact: true))
                } else {
                    PcTag(text: "\(Fmt.rupees(booking.paidPaise)) paid", style: .paid)
                }
            }
            .padding(14)
            if let room = booking.chatRoomId {
                HairlineRule().padding(.horizontal, 14)
                Button { router.push(.chat(roomId: room, title: booking.trip.title)) } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "bubble.left").foregroundStyle(Pc.ink)
                        Text("Trip chat").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                        Spacer()
                        let unread = app.chat.chats.first { $0.id == room }?.unread ?? 0
                        if unread > 0 { CountPill(count: unread) }
                        Image(systemName: "chevron.right").foregroundStyle(Pc.ink)
                    }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 52)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .pcCard()
        .contentShape(Rectangle())
        .onTapGesture { router.push(.trip(slug: booking.trip.slug)) }
        .accessibilityElement(children: .contain)
    }
}

/// Pencilled (dashed) plan card in My trips.
struct PlanTripCard: View {
    let post: Post
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        let isOrganiser = post.viewer?.isAuthor == true
        let requests = (app.tribe.requests[post.id] ?? []).filter { $0.state == .requested }.count
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(post.displayTitle).pcFont(.title3).foregroundStyle(Pc.ink)
                Spacer()
                Text(Fmt.range(post.startsOn, post.endsOn)).pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
            }
            HStack(spacing: 6) {
                if isOrganiser { PcTag(text: "Organiser", style: .organiser) }
                if post.viewer?.membership == .requested && !isOrganiser {
                    Label("Requested · waiting for \(post.author.firstName)", systemImage: "clock").pcFont(.small).foregroundStyle(Pc.ink)
                } else {
                    Text("\(post.memberCount) of \(post.spotsTotal ?? post.memberCount)\(isOrganiser && requests > 0 ? " · \(requests) request\(requests == 1 ? "" : "s")" : "")")
                        .pcFont(.small).foregroundStyle(Pc.ink2)
                }
            }
            SeatRow(seats: SeatBuilder.planSeats(post), cellSize: SeatBuilder.planSeats(post).count > 8 ? 28 : PcTokens.seatSmall, spacing: 6)
            if post.viewer?.membership == .approved || isOrganiser {
                HairlineRule()
                Button { router.push(.post(id: post.id)) } label: {
                    HStack {
                        Image(systemName: "bubble.left")
                        Text(isOrganiser && requests > 0 ? "Review requests" : "Open plan").pcFont(.bodyStrong)
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .foregroundStyle(Pc.ink)
                    .frame(minHeight: PcTokens.touch)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
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
                Text(Fmt.dayNumber(booking.travelDate)).pcFont(.title1).monospacedDigit().foregroundStyle(Pc.ink)
                Text(Fmt.monthShort(booking.travelDate)).font(.system(size: 11, weight: .semibold)).foregroundStyle(Pc.ink2)
            }
            .frame(width: 44)
            PcAsyncImage(media: booking.trip.image, targetSize: CGSize(width: 60, height: 60)).frame(width: 60, height: 60)
                .clipShape(Pc.shape(Pc.imageRadius))
            VStack(alignment: .leading, spacing: 2) {
                Text(booking.trip.title).pcFont(.bodyStrong).foregroundStyle(Pc.ink).lineLimit(2)
                Text(booking.storyPrompt == true ? "Share it with your group · +20 pts" : "Booking \(booking.confirmationCode ?? "")").pcFont(.small).foregroundStyle(Pc.ink2)
            }
            Spacer(minLength: 4)
            if booking.storyPrompt == true {
                Button("Post story") { router.openCompose(.story, tripSlug: booking.trip.slug) }
                    .buttonStyle(.pc(.primary, compact: true))
            } else {
                Image(systemName: "chevron.right").foregroundStyle(Pc.ink2)
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
