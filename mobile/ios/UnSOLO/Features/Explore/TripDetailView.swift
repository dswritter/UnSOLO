import SwiftUI

/// Trip detail: photo pager, who's going (the hero), departures, includes, stories from people who went,
/// and a sticky "Take a seat" bar that hands off to the web checkout in SFSafariViewController.
struct TripDetailView: View {
    let slug: String
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @State private var page = 0
    @State private var selectedDate: String?
    @State private var showGoing = false

    private var detail: TripDetail? { app.explore.details[slug] }
    private var lite: TripLite? { detail?.lite ?? app.explore.trip(slug: slug) }

    var body: some View {
        Group {
            if let lite {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        photos(lite)
                        header(lite)
                        whoIsGoing(lite)
                        host(lite)
                        if let d = detail {
                            departures(d)
                            includes(d)
                            stories(d)
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
                .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar(lite) }
            } else {
                ProgressView().tint(Pc.ink).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .pcScreen()
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: DeepLink.trip(slug: slug).webURL, subject: Text(lite?.title ?? "UnSOLO trip")) {
                    Image(systemName: "square.and.arrow.up")
                }
                .accessibilityLabel("Share trip")
            }
        }
        .sheet(isPresented: $showGoing) { WhoIsGoingSheet(seats: detail?.seats ?? lite.map { SeatBuilder.tripSeats($0) } ?? [], blurred: !session.isSignedIn) }
        .task {
            await app.explore.refreshDetail(slug)
            if selectedDate == nil { selectedDate = detail?.departures.first(where: { $0.seatsLeft > 0 })?.date ?? lite?.nextDeparture }
            await app.analytics.track("trip.view", screen: "trip_detail", props: ["slug": slug])
        }
    }

    // MARK: Sections

    private func photos(_ t: TripLite) -> some View {
        let images = (detail?.images.isEmpty == false ? detail!.images : [t.image].compactMap { $0 })
        return ZStack(alignment: .bottomTrailing) {
            TabView(selection: $page) {
                ForEach(Array(images.enumerated()), id: \.offset) { i, m in
                    PcAsyncImage(media: m).tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: 320)
            if images.count > 1 {
                Text("\(page + 1) / \(images.count)")
                    .font(.system(size: 12, weight: .semibold).monospacedDigit())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(.black.opacity(0.45)))
                    .padding(14)
                    .accessibilityLabel("Photo \(page + 1) of \(images.count)")
            }
        }
    }

    private func header(_ t: TripLite) -> some View {
        let back = Fmt.day(t.nextDeparture).flatMap { Fmt.calendar.date(byAdding: .day, value: max(0, t.durationDays - 1), to: $0) }.map(Fmt.ymd)
        return VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 8) {
                Text(t.title).pcFont(.display).foregroundStyle(Pc.ink).fixedSize(horizontal: false, vertical: true)
                if let place = t.place?.name { Text(place).pcFont(.body).foregroundStyle(Pc.ink2) }
                FactsRow(facts: [
                    Fact(symbol: "calendar", text: "\(Fmt.weekdayDayMonth(selectedDate ?? t.nextDeparture)) – \(Fmt.dayMonth(back))"),
                    Fact(symbol: "clock", text: Fmt.duration(t.durationDays)),
                ] + (detail?.rating.flatMap { $0.count > 0 ? [Fact(symbol: "star", text: "\(String(format: "%.1f", $0.avg)) · \($0.count) reviews")] : nil } ?? []))
                .padding(.top, 2)
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
        }
    }

    private func whoIsGoing(_ t: TripLite) -> some View {
        let seats = (detail?.seats.isEmpty == false) ? detail!.seats : SeatBuilder.tripSeats(t)
        let taken = seats.filter { $0.state != .open }.count
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Who's going").pcFont(.title2).foregroundStyle(Pc.ink).accessibilityAddTraits(.isHeader)
                Spacer()
                Text("\(taken) of \(seats.count)").pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
            }
            Button { showGoing = true } label: {
                SeatRow(seats: seats, cellSize: PcTokens.seat, spacing: 8, maxCells: 16, blurFaces: !session.isSignedIn)
                    .frame(minHeight: 56)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(taken) of \(seats.count) seats taken. Show who's going")
            HStack {
                if !session.isSignedIn {
                    Text("Sign in to see faces. Counts are always shown.").pcFont(.small).foregroundStyle(Pc.ink2)
                } else if taken <= 1 {
                    Text("Be the first · host confirmed").pcFont(.small).foregroundStyle(Pc.ink2)
                } else {
                    Text("\(t.seatsLeft ?? 0) seats left on this departure").pcFont(.small).foregroundStyle((t.seatsLeft ?? 0) <= 5 ? Pc.red : Pc.ink2)
                }
                Spacer()
                Button { showGoing = true } label: {
                    HStack(spacing: 2) { Text("All"); Image(systemName: "chevron.right") }.pcFont(.small, weight: .semibold)
                }
                .buttonStyle(.plain)
                .frame(minHeight: PcTokens.touch)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }

    private func host(_ t: TripLite) -> some View {
        Group {
            if let host = t.host {
                Button { router.push(.profile(username: host.username)) } label: {
                    HStack(spacing: 12) {
                        SeatCell(seat: Seat(state: .host, user: host), size: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(host.name).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                                PcTag(text: "Host", style: .host)
                            }
                            Text("Hosted on UnSOLO · \(detail?.rating.map { "\($0.count) reviews" } ?? "new host")").pcFont(.small).foregroundStyle(Pc.ink2)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(Pc.ink)
                    }
                    .padding(14)
                    .pcCard()
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
        }
    }

    private func departures(_ d: TripDetail) -> some View {
        section("Departures", trailing: "\(d.departures.count)") {
            VStack(spacing: 0) {
                ForEach(Array(d.departures.enumerated()), id: \.element.date) { idx, dep in
                    let selected = (selectedDate ?? d.nextDeparture) == dep.date
                    Button { selectedDate = dep.date } label: {
                        HStack(spacing: 12) {
                            Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                                .font(.system(size: 18)).foregroundStyle(Pc.ink)
                            Text(Fmt.weekdayDayMonth(dep.date)).pcFont(.bodyStrong).monospacedDigit().foregroundStyle(Pc.ink)
                            Spacer()
                            if dep.seatsLeft == 0 {
                                PcTag(text: "Waitlist", style: .waitlist)
                            } else {
                                Text("\(dep.seatsLeft) of \(dep.seatsTotal) left").pcFont(.small, weight: dep.seatsLeft <= 3 ? .semibold : .regular)
                                    .foregroundStyle(dep.seatsLeft <= 3 ? Pc.red : Pc.ink2)
                            }
                        }
                        .padding(.horizontal, 14)
                        .frame(minHeight: 52)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    if idx < d.departures.count - 1 { HairlineRule().padding(.leading, 44) }
                }
            }
            .pcCard()
        }
    }

    private func includes(_ d: TripDetail) -> some View {
        section("Includes") {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(d.includes, id: \.self) { item in
                    Label {
                        Text(item).pcFont(.body).foregroundStyle(Pc.ink)
                    } icon: {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Pc.green)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .pcCard()
        }
    }

    @ViewBuilder private func stories(_ d: TripDetail) -> some View {
        if !d.stories.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: "From people who went", trailing: "\(d.stories.count) stor\(d.stories.count == 1 ? "y" : "ies")")
                    .padding(.horizontal, 20)
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: 12) {
                        ForEach(d.stories) { s in
                            let post = app.tribe.posts[s.id] ?? s
                            Button { router.push(.post(id: post.id)) } label: { StoryMiniCard(post: post) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
            .padding(.top, 20)
        }
    }

    private func section<C: View>(_ title: String, trailing: String? = nil, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(title: title, trailing: trailing)
            content()
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }

    private func bottomBar(_ t: TripLite) -> some View {
        let date = selectedDate ?? t.nextDeparture
        let left = detail?.departures.first { $0.date == date }?.seatsLeft ?? t.seatsLeft ?? 0
        return BottomActionBar {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(Fmt.rupees(t.priceFromPaise)).pcFont(.title1).monospacedDigit().foregroundStyle(Pc.ink)
                Text("/ person").pcFont(.small).foregroundStyle(Pc.ink2)
            }
            Text(left == 0 ? "Full on \(Fmt.dayMonth(date)) · waitlist open" : "\(Fmt.dayMonth(date)) · \(left) seat\(left == 1 ? "" : "s") left")
                .pcFont(.small).foregroundStyle(Pc.ink2)
        } trailing: {
            Button(left == 0 ? "Join waitlist" : "Take a seat") { app.openBooking(slug: slug, date: date) }
                .buttonStyle(.pcPrimary)
        }
    }
}

struct StoryMiniCard: View {
    let post: Post
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack(alignment: .bottomLeading) {
                PcAsyncImage(media: post.media.first)
                    .frame(width: 230, height: 150)
                    .clipShape(Pc.shape(Pc.imageRadius))
                HStack(spacing: 4) {
                    Avatar(user: post.author, size: 24).background(Circle().fill(Pc.paper).padding(-1))
                    if post.reactions.wantToGo > 0 {
                        Text("+\(post.reactions.love)").font(.system(size: 11, weight: .bold).monospacedDigit())
                            .padding(.horizontal, 6).frame(height: 22).background(Capsule().fill(Pc.raised))
                    }
                }
                .padding(8)
            }
            Text(post.displayTitle).pcFont(.bodyStrong).foregroundStyle(Pc.ink).lineLimit(2).multilineTextAlignment(.leading)
            Text("\(post.author.firstName) · \(post.reactions.wantToGo) want to go").pcFont(.small).foregroundStyle(Pc.ink2)
        }
        .frame(width: 230, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Whole-row tap target → list of travellers with 64 pt rows (direction.md revision 4).
struct WhoIsGoingSheet: View {
    let seats: [Seat]
    let blurred: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(Array(seats.enumerated()), id: \.offset) { i, seat in
                    HStack(spacing: 12) {
                        SeatCell(seat: seat, size: 40, blurFaces: blurred)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(name(seat)).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                            Text("Seat \(i + 1)").pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
                        }
                        Spacer()
                        if seat.state == .host { PcTag(text: "Host", style: .host) }
                        if seat.state == .organiser { PcTag(text: "Organiser", style: .organiser) }
                    }
                    .frame(minHeight: 64)
                    .listRowBackground(Pc.paper)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .pcScreen()
            .navigationTitle("Who's going")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func name(_ seat: Seat) -> String {
        switch seat.state {
        case .open: return "Open seat"
        case .held: return "Held"
        case .you: return "You"
        case .requested: return "Requested"
        default:
            if blurred { return "Traveller" }
            return seat.user?.name ?? "Traveller (face hidden)"
        }
    }
}
