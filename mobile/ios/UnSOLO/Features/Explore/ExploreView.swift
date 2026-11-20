import SwiftUI

/// Explore: departures as a ruled chart sorted by date, with seat strips. The next departure is the hero.
struct ExploreView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var category: ExploreCategory = .trips
    @State private var searching = false
    @State private var query = ""
    @FocusState private var searchFocused: Bool

    private var trips: [TripLite] {
        (app.explore.lists[category] ?? []).sorted { ($0.nextDeparture ?? "9") < ($1.nextDeparture ?? "9") }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
                AppHeader(showsWordmark: true)
                searchPill.padding(.horizontal, 20).padding(.top, 4)
                if searching {
                    searchResults
                } else {
                    ChipTabs(items: ExploreCategory.allCases.map { ($0, $0.label) }, selection: $category)
                        .padding(.top, 12)
                    content
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await refresh() }
        .pcScreen()
        .toolbar(.hidden, for: .navigationBar)
        .task { await refresh() }
        .task(id: category) { if app.explore.lists[category] == nil { await app.explore.refresh(category) } }
        .onAppear { Task { await app.analytics.track("screen.view", screen: "explore") } }
    }

    private func refresh() async {
        async let a: Void = app.explore.refresh(category)
        async let b: Void = app.explore.refreshSuggestions()
        _ = await (a, b)
        if let first = trips.first, category == .trips { await app.explore.refreshDetail(first.slug) }
    }

    // MARK: Search

    private var searchPill: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass").font(.system(size: 18, weight: .medium)).foregroundStyle(Pc.ink)
            if searching {
                TextField("Where to?", text: $query)
                    .pcFont(.bodyStrong)
                    .focused($searchFocused)
                    .submitLabel(.search)
                    .onSubmit { Task { await app.explore.search(query) } }
                    .onChange(of: query) { _, q in
                        Task {
                            try? await Task.sleep(for: .milliseconds(300))
                            if q == query { await app.explore.search(q) }
                        }
                    }
                Button("Cancel") {
                    searching = false
                    query = ""
                    searchFocused = false
                }
                .buttonStyle(.pcLink)
            } else {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Where to?").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                    Text("Any dates · 1 traveller").pcFont(.small).foregroundStyle(Pc.ink2)
                }
                Spacer()
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
        .pcCard(radius: 28)
        .contentShape(Rectangle())
        .onTapGesture {
            guard !searching else { return }
            searching = true
            searchFocused = true
        }
        .accessibilityAddTraits(.isSearchField)
        .accessibilityLabel("Search trips, stays and places")
    }

    @ViewBuilder private var searchResults: some View {
        let results = app.explore.searchResults
        if query.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Try").pcFont(.small).foregroundStyle(Pc.ink2)
                FlowLayout {
                    ForEach(["Spiti", "Kasol", "Rishikesh", "Bhutan", "Tungnath", "Valley of Flowers"], id: \.self) { s in
                        PcChip(text: s) { query = s }
                    }
                }
            }
            .padding(16)
        } else if results.isEmpty {
            EmptyState(symbol: "magnifyingglass", title: "Nothing for “\(query)” yet", message: "Try a nearby place, or ask the Tribe.")
        } else {
            Text("\(results.count) departures").pcFont(.small).foregroundStyle(Pc.ink2).padding(.horizontal, 24).padding(.vertical, 10)
            VStack(spacing: 0) {
                ForEach(Array(results.enumerated()), id: \.element.id) { i, t in
                    DepartureRow(trip: t, category: .trips, showsDivider: i < results.count - 1) { router.push(.trip(slug: t.slug)) }
                }
            }
            .pcCard()
            .padding(.horizontal, 20)
        }
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        if trips.isEmpty {
            if case .failed = app.explore.state[category] {
                EmptyState(symbol: "wifi.slash", title: "Couldn't load departures", message: "Pull to try again.")
            } else {
                ProgressView().tint(Pc.ink).frame(maxWidth: .infinity).padding(40)
            }
        } else {
            if let lead = trips.first {
                HStack(alignment: .firstTextBaseline) {
                    Text("Leaving next").pcFont(.title2).foregroundStyle(Pc.ink).accessibilityAddTraits(.isHeader)
                    Spacer()
                    if let days = Fmt.daysUntil(lead.nextDeparture) {
                        Text(days <= 0 ? "today" : "in \(days) day\(days == 1 ? "" : "s")").pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 10)
                LeavingNextCard(trip: lead, detail: app.explore.details[lead.slug], category: category)
                    .padding(.horizontal, 20)
                if category == .trips, let detail = app.explore.details[lead.slug] {
                    TribeBridgeRow(detail: detail).padding(.horizontal, 20).padding(.top, 14)
                }
            }
            if !app.explore.suggestions.isEmpty && category == .trips {
                SuggestionsRail(items: app.explore.suggestions).padding(.top, 22)
            }
            SectionHeader(title: category == .trips ? "Departures" : category.label, trailing: "\(trips.count) total")
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 8)
            departuresByMonth
            Color.clear.frame(height: 24)
        }
    }

    @ViewBuilder private var departuresByMonth: some View {
        let groups = Dictionary(grouping: trips.dropFirst()) { Fmt.monthYear($0.nextDeparture) }
        let order = trips.dropFirst().map { Fmt.monthYear($0.nextDeparture) }.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        ForEach(order, id: \.self) { month in
            HStack {
                Overline(text: month.capitalized)
                Spacer()
                Text("\(groups[month]?.count ?? 0)").pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
            }
            .padding(.horizontal, 24)
            .padding(.top, 14)
            .padding(.bottom, 6)
            VStack(spacing: 0) {
                let list = groups[month] ?? []
                ForEach(Array(list.enumerated()), id: \.element.id) { i, t in
                    DepartureRow(trip: t, category: category, showsDivider: i < list.count - 1) { router.push(.trip(slug: t.slug)) }
                }
            }
            .pcCard()
            .padding(.horizontal, 20)
        }
    }
}

// MARK: - Leaving next hero card

struct LeavingNextCard: View {
    let trip: TripLite
    let detail: TripDetail?
    let category: ExploreCategory
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    private var seats: [Seat] {
        if let d = detail, !d.seats.isEmpty { return d.seats }
        return SeatBuilder.tripSeats(trip)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            PcAsyncImage(media: trip.image)
                .frame(height: 168)
                .clipShape(Pc.shape(Pc.imageRadius))
            VStack(alignment: .leading, spacing: 4) {
                Text(trip.title).pcFont(.title1).foregroundStyle(Pc.ink).lineLimit(2)
                if let place = trip.place?.name { Text(place).pcFont(.body).foregroundStyle(Pc.ink2).lineLimit(1) }
            }
            FactsRow(facts: [
                Fact(symbol: "calendar", text: Fmt.weekdayDayMonth(trip.nextDeparture)),
                Fact(symbol: "clock", text: Fmt.duration(trip.durationDays)),
                Fact(symbol: "person.2", text: category == .trips ? "\(trip.seatsLeft ?? 0) of \(trip.seatsTotal ?? 0) open" : category.meter(left: trip.seatsLeft, total: trip.seatsTotal),
                     emphasis: (trip.seatsLeft ?? 0) <= 5),
            ])
            if category == .trips {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Who's going").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                        Text("\(max(0, (trip.seatsTotal ?? 0) - (trip.seatsLeft ?? 0))) of \(trip.seatsTotal ?? 0)").pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
                        Spacer()
                        seatsLeftLabel
                    }
                    SeatRow(seats: seats, cellSize: PcTokens.seat, spacing: 8, maxCells: 14, blurFaces: !session.isSignedIn)
                }
            }
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(Fmt.rupees(trip.priceFromPaise)).pcFont(.title1).monospacedDigit().foregroundStyle(Pc.ink)
                        Text(category == .stays ? "/ night" : category == .rentals ? "/ day" : "/ person").pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                    Text("Pay securely on unsolo.in").pcFont(.small).foregroundStyle(Pc.ink2)
                }
                Spacer()
                Button("Take a seat") { router.push(.trip(slug: trip.slug)) }
                    .buttonStyle(.pcPrimary)
            }
        }
        .padding(14)
        .pcCard()
        .contentShape(Rectangle())
        .onTapGesture { router.push(.trip(slug: trip.slug)) }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder private var seatsLeftLabel: some View {
        let left = trip.seatsLeft ?? 0
        if left == 0 {
            PcTag(text: "Waitlist", style: .waitlist)
        } else {
            Text("\(left) seat\(left == 1 ? "" : "s") left").pcFont(.small, weight: .semibold).foregroundStyle(left <= 5 ? Pc.red : Pc.ink2)
        }
    }
}

extension Text {
    /// Font for concatenated Text segments (ViewModifiers can't be used inside `+`).
    func pcFontText(_ style: PcTextStyle) -> Text {
        font(PcFont.make(style, size: UIFontMetrics(forTextStyle: style.relative.uiKit).scaledValue(for: style.size)))
    }
}

extension Font.TextStyle {
    var uiKit: UIFont.TextStyle {
        switch self {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
    }
}

// MARK: - Departure row (ruled chart row)

struct DepartureRow: View {
    let trip: TripLite
    let category: ExploreCategory
    var showsDivider = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 0) {
                    Text(Fmt.dayNumber(trip.nextDeparture)).pcFont(.title1).monospacedDigit().foregroundStyle(Pc.ink)
                    Text(Fmt.weekdayShort(trip.nextDeparture)).font(.system(size: 11, weight: .semibold)).foregroundStyle(Pc.ink2)
                }
                .frame(width: 44)
                PcAsyncImage(media: trip.image, targetSize: CGSize(width: 64, height: 64))
                    .frame(width: 64, height: 64)
                    .clipShape(Pc.shape(Pc.imageRadius))
                VStack(alignment: .leading, spacing: 4) {
                    Text(trip.title).pcFont(.title3).foregroundStyle(Pc.ink).multilineTextAlignment(.leading).lineLimit(2)
                    Text(subtitle).pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                    meter
                }
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(Fmt.rupees(trip.priceFromPaise)).pcFont(.num).foregroundStyle(Pc.ink)
                    Text(category == .stays ? "/ night" : category == .rentals ? "/ day" : "/ person").pcFont(.label, weight: .regular).foregroundStyle(Pc.ink2)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(minHeight: 88)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { if showsDivider { HairlineRule().padding(.leading, 70) } }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the trip")
    }

    private var subtitle: String {
        let place = trip.place?.name ?? ""
        return category == .trips ? "\(Fmt.duration(trip.durationDays)) · \(place)" : place
    }

    @ViewBuilder private var meter: some View {
        let left = trip.seatsLeft ?? 0
        let total = trip.seatsTotal ?? 0
        if category != .trips {
            Text(category.meter(left: left, total: total)).pcFont(.small, weight: .semibold).foregroundStyle(left <= 2 ? Pc.red : Pc.ink)
        } else if left == 0 {
            HStack(spacing: 6) {
                Text("Full").pcFont(.small).foregroundStyle(Pc.ink2)
                PcTag(text: "Waitlist", style: .waitlist)
            }
        } else if total - left <= 1 {
            HStack(spacing: 6) {
                if let host = trip.host { Avatar(user: host, size: 20) }
                Text("Be the first · host confirmed").pcFont(.small).foregroundStyle(Pc.ink2)
            }
        } else {
            HStack(spacing: 8) {
                FaceStack(users: trip.goingFaces, size: 20, extra: max(0, total - left - trip.goingFaces.count - 1))
                if left <= 3 {
                    Text("\(left) left").pcFont(.small, weight: .semibold).foregroundStyle(Pc.red)
                } else {
                    Text("\(total - left) of \(total)").pcFont(.code).foregroundStyle(Pc.ink2)
                    FillBar(filled: total - left, total: total, width: 40)
                }
            }
        }
    }
}

// MARK: - Tribe bridge row

struct TribeBridgeRow: View {
    let detail: TripDetail
    @Environment(Router.self) private var router

    var body: some View {
        if let count = detail.planningCount, count >= 3 {
            Button { router.select(.tribe) } label: {
                HStack(spacing: 12) {
                    FaceStack(users: Array(detail.goingFaces.prefix(3)), size: 26)
                    VStack(alignment: .leading, spacing: 2) {
                        Overline(text: "In the Tribe")
                        Text("\(count) people are planning \(detail.place?.slug?.capitalized ?? detail.place?.name ?? "this")")
                            .pcFont(.bodyStrong).foregroundStyle(Pc.ink).multilineTextAlignment(.leading)
                        Text("\(detail.stories.count) stories from people who went").pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(Pc.ink)
                }
                .padding(14)
                .pcPencilled()
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the Tribe")
        }
    }
}

// MARK: - Suggestions rail

struct SuggestionsRail: View {
    let items: [Suggestion]
    @Environment(Router.self) private var router
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("For you").pcFont(.title2).foregroundStyle(Pc.ink).padding(.horizontal, 20).accessibilityAddTraits(.isHeader)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 10) {
                    ForEach(items) { s in
                        Button {
                            Task { await app.analytics.track("suggestion.tap", props: ["type": s.type, "reason": s.reason]) }
                            if let p = s.post { router.push(.post(id: p.id)) } else if let t = s.trip { router.push(.trip(slug: t.slug)) }
                        } label: { card(s) }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    private func card(_ s: Suggestion) -> some View {
        let isPlan = s.post != nil
        return VStack(alignment: .leading, spacing: 6) {
            Overline(text: s.reason, color: s.reason == "Women-only plan" ? Pc.blue : Pc.ink2)
            Text(s.post?.displayTitle ?? s.trip?.title ?? "").pcFont(.title3).foregroundStyle(Pc.ink).lineLimit(2).multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            if let p = s.post {
                Text("\(Fmt.range(p.startsOn, p.endsOn)) · \(p.openSpots) open").pcFont(.small).foregroundStyle(Pc.ink2)
            } else if let t = s.trip {
                Text("\(Fmt.dayMonth(t.nextDeparture)) · \(Fmt.rupees(t.priceFromPaise))").pcFont(.small).foregroundStyle(Pc.ink2)
            }
        }
        .padding(14)
        .frame(width: 210, height: 124, alignment: .topLeading)
        .ruledFrame(dashed: isPlan)
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}
