import SwiftUI

/// What the Explore search sheet narrows the lists to. Everything is filtered on the client from the
/// `/explore` lists (or `/explore?q=` results when there is a query).
struct ExploreFilter: Equatable {
    enum When: Hashable {
        case any, weekend, next30
        case month(String) // "2026-12"
    }
    enum Length: String, CaseIterable, Hashable {
        case any, short, week, long
        var label: String {
            switch self {
            case .any: "Any length"
            case .short: "Weekend · 1–3 days"
            case .week: "4–7 days"
            case .long: "8+ days"
            }
        }
        func matches(_ days: Int) -> Bool {
            switch self {
            case .any: true
            case .short: days <= 3
            case .week: (4...7).contains(days)
            case .long: days >= 8
            }
        }
    }

    var query = ""
    var when: When = .any
    var length: Length = .any
    var openOnly = false

    var activeCount: Int { (when == .any ? 0 : 1) + (length == .any ? 0 : 1) + (openOnly ? 1 : 0) }
    var isEmpty: Bool { query.isEmpty && activeCount == 0 }

    func matches(_ t: TripLite, now: Date = Date()) -> Bool {
        if openOnly && (t.seatsLeft ?? 0) == 0 { return false }
        if !length.matches(t.durationDays) { return false }
        switch when {
        case .any: break
        case .weekend:
            guard let d = Fmt.daysUntil(t.nextDeparture, now: now), let day = Fmt.day(t.nextDeparture) else { return false }
            let wd = Fmt.calendar.component(.weekday, from: day) // 1 = Sun … 7 = Sat
            if d < 0 || d > 7 || ![1, 6, 7].contains(wd) { return false }
        case .next30:
            guard let d = Fmt.daysUntil(t.nextDeparture, now: now), (0...30).contains(d) else { return false }
        case .month(let ym):
            guard t.nextDeparture?.hasPrefix(ym) == true else { return false }
        }
        return true
    }

    var whenLabel: String {
        switch when {
        case .any: "Any week"
        case .weekend: "This weekend"
        case .next30: "Next 30 days"
        case .month(let ym): ExploreFilter.monthLabel(ym)
        }
    }

    static func monthLabel(_ ym: String) -> String {
        let name = Fmt.monthShort(ym + "-01").capitalized
        let year = ym.prefix(4)
        let thisYear = String(Fmt.calendar.component(.year, from: Date()))
        return year == thisYear ? name : "\(name) \(year)"
    }
}

/// Explore: wordmark + Activity/Messages, category chips, "Leaving soon" photo-first ring cards,
/// month lists with mini arcs, and the search dock floating above the tab bar.
struct ExploreView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var category: ExploreCategory = .trips
    @State private var filter = ExploreFilter()
    @State private var showSearch = false

    private var base: [TripLite] {
        filter.query.isEmpty ? (app.explore.lists[category] ?? []) : app.explore.searchResults
    }

    private var trips: [TripLite] {
        base.filter { filter.matches($0) }.sorted { ($0.nextDeparture ?? "9") < ($1.nextDeparture ?? "9") }
    }

    private var leavingSoon: [TripLite] { Array(trips.prefix(5)) }

    var body: some View {
        ZStack(alignment: .bottom) {
        ScrollViewReader { proxy in
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                AppHeader(showsWordmark: true)
                ChipTabs(items: ExploreCategory.allCases.map { ($0, $0.label) }, selection: $category, icons: Self.categoryIcons)
                    .padding(.top, 2)
                    .padding(.bottom, 6)
                if !filter.isEmpty { activeFilterRow }
                content
                Color.clear.frame(height: 84) // room for the search dock
            }
        }
        .refreshable { await refresh() }
        .task {
            #if DEBUG
            if DebugLaunch.startScreen == "explorePlans" {
                try? await Task.sleep(for: .seconds(2.5))
                proxy.scrollTo("plans", anchor: .top)
            }
            #endif
        }
        }
            SearchDock(title: filter.query.isEmpty ? "Where to?" : filter.query, subtitle: filter.whenLabel, activeFilters: filter.activeCount) {
                showSearch = true
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .pcScreen()
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $showSearch) {
            ExploreSearchSheet(filter: $filter, category: category)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .pcSheet()
        }
        .task { await refresh() }
        .task(id: category) { if app.explore.lists[category] == nil { await app.explore.refresh(category) } }
        .onAppear {
            Task { await app.analytics.track("screen.view", screen: "explore") }
            #if DEBUG
            if DebugLaunch.startScreen == "exploreSearch" || DebugLaunch.startScreen == "search" { showSearch = true }
            #endif
        }
    }

    static let categoryIcons: [ExploreCategory: String] = [
        .trips: "backpack", .stays: "bed.double", .activities: "figure.hiking", .rentals: "motorcycle",
    ]

    private func refresh() async {
        async let a: Void = app.explore.refresh(category)
        async let b: Void = app.explore.refreshSuggestions()
        _ = await (a, b)
        if app.tribe.feeds["plan"] == nil { await app.tribe.refreshFeed(key: "plan") }
        if let first = trips.first, category == .trips { await app.explore.refreshDetail(first.slug) }
    }

    private var activeFilterRow: some View {
        HStack(spacing: 8) {
            Image(systemName: "line.3.horizontal.decrease").font(.system(size: 13, weight: .bold)).foregroundStyle(Pc.ink)
            Text([filter.query.isEmpty ? nil : "“\(filter.query)”", filter.when == .any ? nil : filter.whenLabel,
                  filter.length == .any ? nil : filter.length.label, filter.openOnly ? "Open seats" : nil]
                .compactMap { $0 }.joined(separator: " · "))
                .pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink).lineLimit(1)
            Spacer()
            Button("Clear") { withAnimation { filter = ExploreFilter() } }.buttonStyle(.pcLink)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 4)
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        if trips.isEmpty {
            if !filter.isEmpty {
                EmptyState(symbol: "magnifyingglass", title: "Nothing matches", message: "Try another week or fewer filters.")
            } else if case .failed = app.explore.state[category] {
                EmptyState(symbol: "wifi.slash", title: "Couldn't load departures", message: "Pull to try again.")
            } else {
                ProgressView().tint(Pc.ink2).frame(maxWidth: .infinity).padding(40)
            }
        } else {
            SectionHeader(title: "Leaving soon")
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 12)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 12) {
                    ForEach(leavingSoon) { t in
                        TripCard(trip: t, category: category)
                            .containerRelativeFrame(.horizontal) { w, _ in min(w - 52, 360) }
                    }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, 16, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            if category == .trips && filter.isEmpty {
                PlansLookingRow().padding(.top, 26).id("plans")
            }
            monthSections
            Color.clear.frame(height: 16)
        }
    }

    @ViewBuilder private var monthSections: some View {
        let rest = Array(trips.dropFirst(leavingSoon.count))
        let list = rest.isEmpty ? trips : rest
        let order = list.map { String(($0.nextDeparture ?? "").prefix(7)) }.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        let thisMonth = String(Fmt.ymd(Date()).prefix(7))
        ForEach(order, id: \.self) { ym in
            let rows = list.filter { ($0.nextDeparture ?? "").hasPrefix(ym) }
            SectionHeader(title: ym == thisMonth ? "This month" : (ym.isEmpty ? "Dates to come" : Self.monthTitle(ym)))
                .padding(.horizontal, 20)
                .padding(.top, 26)
                .padding(.bottom, 4)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, t in
                    TripListRow(trip: t, category: category, showsDivider: i < rows.count - 1) { router.push(.trip(slug: t.slug)) }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    static func monthTitle(_ ym: String) -> String {
        Fmt.monthYear(ym + "-01").capitalized
    }
}

// MARK: - Photo-first trip card

/// Photo (196 pt) with a date chip and a save button; the 88 pt ring overlaps the photo's bottom edge
/// with the open count in its centre; title, place · duration, host, seat caption, price + "Take a seat".
struct TripCard: View {
    let trip: TripLite
    var category: ExploreCategory = .trips
    var cta = "Take a seat"
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    private var counts: SeatCounts { SeatCounts(trip: trip) }
    private var showsRing: Bool { category == .trips }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            photo
            HStack(alignment: .top, spacing: 12) {
                if showsRing {
                    SeatRing(seats: RingSeats.trip(trip), size: PcTokens.ringCard, dots: .none,
                             centreLabel: counts.isFull ? ("Full", "\(counts.total)/\(counts.total)") : (String(counts.open), counts.open == 1 ? "seat left" : "seats left"),
                             seatIcon: true)
                        .padding(5)
                        .background(Circle().fill(Pc.raised))
                        .padding(.top, -49)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(trip.title).pcFont(.title3, weight: .bold).foregroundStyle(Pc.ink).lineLimit(1)
                    Text([trip.place?.name.components(separatedBy: ",").first, Fmt.duration(trip.durationDays)].compactMap { $0 }.joined(separator: " · "))
                        .pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                }
                .padding(.top, showsRing ? 8 : 12)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    if let host = trip.host {
                        PcTag(text: host.name, style: .verified, icon: host.isIdVerified ? "checkmark.seal.fill" : nil)
                            .layoutPriority(-1)
                    }
                    Spacer(minLength: 4)
                    if showsRing {
                        SeatCaption(counts: counts, font: .system(size: 12.5, weight: .semibold))
                    } else {
                        Text(category.meter(left: trip.seatsLeft, total: trip.seatsTotal)).pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink2)
                    }
                }
                HStack {
                    PriceText(paise: trip.priceFromPaise, unit: category.unit)
                    Spacer(minLength: 8)
                    Button(counts.isFull && showsRing ? "See trip" : cta) { router.push(.trip(slug: trip.slug)) }
                        .buttonStyle(.pc(.quiet, compact: true))
                }
            }
            .padding(.horizontal, 8)
            .padding(.top, 10)
            .padding(.bottom, 4)
        }
        .padding(8)
        .pcCard()
        .contentShape(Pc.shape())
        .onTapGesture { router.push(.trip(slug: trip.slug)) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(trip.title), \(Fmt.weekdayDayMonth(trip.nextDeparture)), \(Fmt.rupees(trip.priceFromPaise)). \(SeatCaption.plain(counts))")
        .accessibilityAction(named: "Open") { router.push(.trip(slug: trip.slug)) }
    }

    private var photo: some View {
        ZStack(alignment: .top) {
            PcAsyncImage(media: trip.image)
                .frame(height: 196)
                .frame(maxWidth: .infinity)
                .overlay(alignment: .bottom) {
                    LinearGradient(colors: [.clear, PcTokens.light.ink.opacity(0.28)], startPoint: .top, endPoint: .bottom).frame(height: 70)
                }
            HStack(alignment: .top) {
                DateChip(ymd: trip.nextDeparture)
                Spacer()
                SaveTripButton(slug: trip.slug)
            }
            .padding(.leading, 12)
            .padding(.trailing, 6)
            .padding(.top, 12)
        }
        .clipShape(Pc.shape(Pc.imageRadius + 1))
    }
}

/// Heart on a glass disc. Saved trips live on this device only (the API has saves for posts, not trips).
struct SaveTripButton: View {
    let slug: String
    @Environment(AppModel.self) private var app
    var body: some View {
        let saved = app.marks.isSaved(slug)
        Button { withAnimation(.snappy) { app.marks.toggleSaved(slug) } } label: {
            GlassIcon(systemName: saved ? "heart.fill" : "heart", tint: saved ? Pc.red : Pc.ink)
        }
        .buttonStyle(.pcPress)
        .padding(.top, -4)
        .accessibilityLabel(saved ? "Saved" : "Save trip")
        .accessibilityAddTraits(saved ? .isSelected : [])
    }
}

extension ExploreCategory {
    var unit: String {
        switch self {
        case .stays: "/night"
        case .rentals: "/day"
        default: "/person"
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

// MARK: - List row (thumbnail + mini arc + price)

struct TripListRow: View {
    let trip: TripLite
    var category: ExploreCategory = .trips
    var showsDivider = true
    let action: () -> Void

    var body: some View {
        let counts = SeatCounts(trip: trip)
        Button(action: action) {
            HStack(spacing: 12) {
                PcAsyncImage(media: trip.image, targetSize: CGSize(width: 52, height: 52))
                    .frame(width: 52, height: 52)
                    .clipShape(Pc.shape(16))
                VStack(alignment: .leading, spacing: 3) {
                    Text(trip.title).font(.system(size: 15, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(1)
                    Text(subtitle).pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                }
                Spacer(minLength: 4)
                if category == .trips { MiniArc(counts: counts) }
                VStack(alignment: .trailing, spacing: 1) {
                    Text(Fmt.rupees(trip.priceFromPaise)).font(PcFont.rounded(17)).foregroundStyle(Pc.ink).lineLimit(1).fixedSize()
                    Text(category == .trips ? (counts.isFull ? "Full" : "\(counts.open) open") : category.meter(left: trip.seatsLeft, total: trip.seatsTotal))
                        .pcFont(.small, weight: counts.isFull ? .bold : .regular).foregroundStyle(counts.isFull ? Pc.full : Pc.ink2).lineLimit(1)
                }
                .frame(minWidth: 62, alignment: .trailing)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 12)
            .frame(minHeight: 76)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pcPress)
        .overlay(alignment: .bottom) { if showsDivider { HairlineRule() } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(trip.title), \(subtitle), \(Fmt.rupees(trip.priceFromPaise)). \(category == .trips ? SeatCaption.plain(counts) : category.meter(left: trip.seatsLeft, total: trip.seatsTotal))")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Opens the trip")
    }

    private var subtitle: String {
        let place = trip.place?.name.components(separatedBy: ",").first ?? ""
        return [Fmt.weekdayDayMonth(trip.nextDeparture), category == .trips ? Fmt.duration(trip.durationDays) : nil, place.isEmpty ? nil : place]
            .compactMap { $0 }.joined(separator: " · ")
    }
}

/// Kept for call sites outside Explore (search results, caught-up footer).
struct DepartureRow: View {
    let trip: TripLite
    let category: ExploreCategory
    var showsDivider = true
    let action: () -> Void
    var body: some View { TripListRow(trip: trip, category: category, showsDivider: showsDivider, action: action) }
}

// MARK: - Tribe bridge row

struct TribeBridgeRow: View {
    let detail: TripDetail
    @Environment(Router.self) private var router

    var body: some View {
        if let count = detail.planningCount, count >= 3 {
            Button { router.select(.tribe) } label: {
                HStack(spacing: 12) {
                    FaceStack(users: Array(detail.goingFaces.prefix(3)), size: 28)
                    VStack(alignment: .leading, spacing: 2) {
                        Overline(text: "In the Tribe")
                        Text("\(count) people are planning \(detail.place?.slug?.capitalized ?? detail.place?.name ?? "this")")
                            .font(.system(size: 15, weight: .bold)).foregroundStyle(Pc.ink).multilineTextAlignment(.leading)
                        Text("\(detail.stories.count) stories from people who went").pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.ink2)
                }
                .padding(14)
                .pcPencilled()
            }
            .buttonStyle(.pcPress)
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
            SectionHeader(title: "For you").padding(.horizontal, 20)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 10) {
                    ForEach(items) { s in
                        Button {
                            Task { await app.analytics.track("suggestion.tap", props: ["type": s.type, "reason": s.reason]) }
                            if let p = s.post { router.push(.post(id: p.id)) } else if let t = s.trip { router.push(.trip(slug: t.slug)) }
                        } label: { card(s) }
                        .buttonStyle(.pcPress)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func card(_ s: Suggestion) -> some View {
        let isPlan = s.post != nil
        let women = s.post?.audience == .women
        return HStack(alignment: .center, spacing: 12) {
            if let p = s.post {
                MiniArc(counts: SeatCounts(plan: p), womenOnly: women)
            } else if let t = s.trip {
                MiniArc(counts: SeatCounts(trip: t))
            }
            VStack(alignment: .leading, spacing: 4) {
                if women {
                    PcTag(text: "Women only", style: .women)
                } else {
                    Overline(text: s.reason).lineLimit(1)
                }
                Text(s.post?.displayTitle ?? s.trip?.title ?? "").font(.system(size: 15, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(2).multilineTextAlignment(.leading)
                if let p = s.post {
                    Text("\(Fmt.range(p.startsOn, p.endsOn)) · \(p.openSpots) spots").pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                } else if let t = s.trip {
                    Text("\(Fmt.dayMonth(t.nextDeparture)) · \(Fmt.rupees(t.priceFromPaise))").pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(width: 260, height: 112, alignment: .leading)
        .modifier(PcCardModifier(pencilled: isPlan, fill: nil))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Search sheet

/// Search and filters as a bottom sheet: query, when, trip length, open seats; live results; "Show N" at the bottom.
struct ExploreSearchSheet: View {
    @Binding var filter: ExploreFilter
    let category: ExploreCategory
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ExploreFilter()
    @FocusState private var focused: Bool

    private var pool: [TripLite] { draft.query.isEmpty ? (app.explore.lists[category] ?? []) : app.explore.searchResults }
    private var results: [TripLite] {
        pool.filter { draft.matches($0) }.sorted { ($0.nextDeparture ?? "9") < ($1.nextDeparture ?? "9") }
    }
    private var months: [String] {
        let all = (app.explore.lists[category] ?? []).compactMap { $0.nextDeparture.map { String($0.prefix(7)) } }
        return Array(Set(all)).sorted().prefix(6).map { $0 }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                SheetHeader(title: "Find a trip").padding(.top, 22)
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").font(.system(size: 17, weight: .bold)).foregroundStyle(Pc.ink)
                    TextField("Where to? Spiti, Kasol, Bhutan…", text: $draft.query)
                        .font(.system(size: 16, weight: .semibold))
                        .focused($focused)
                        .submitLabel(.search)
                        .onSubmit { Task { await app.explore.search(draft.query) } }
                    if !draft.query.isEmpty {
                        Button { draft.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Pc.ink3) }
                            .buttonStyle(.plain).frame(width: 32, height: 32).accessibilityLabel("Clear search")
                    }
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                .pcField(focused: focused)
                if draft.query.isEmpty {
                    FlowLayout(spacing: 8, lineSpacing: 0) {
                        ForEach(["Spiti", "Kasol", "Rishikesh", "Bhutan", "Tungnath"], id: \.self) { s in
                            PcChip(text: s, icon: "mappin") { draft.query = s }
                        }
                    }
                }
                group("When") {
                    FlowLayout(spacing: 8, lineSpacing: 0) {
                        chip("Any week", draft.when == .any) { draft.when = .any }
                        chip("This weekend", draft.when == .weekend) { draft.when = .weekend }
                        chip("Next 30 days", draft.when == .next30) { draft.when = .next30 }
                        ForEach(months, id: \.self) { m in
                            chip(ExploreFilter.monthLabel(m), draft.when == .month(m)) { draft.when = .month(m) }
                        }
                    }
                }
                group("Trip length") {
                    FlowLayout(spacing: 8, lineSpacing: 0) {
                        ForEach(ExploreFilter.Length.allCases, id: \.self) { l in
                            chip(l.label, draft.length == l) { draft.length = l }
                        }
                    }
                }
                PcToggleRow(title: "Only trips with open seats", subtitle: "Hide full departures", isOn: $draft.openOnly)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 4)
                    .pcField()
                VStack(alignment: .leading, spacing: 0) {
                    Text(results.isEmpty ? "No departures match" : "\(results.count) departure\(results.count == 1 ? "" : "s")")
                        .pcFont(.small, weight: .bold).foregroundStyle(Pc.ink2).padding(.bottom, 4)
                    ForEach(Array(results.prefix(8).enumerated()), id: \.element.id) { i, t in
                        TripListRow(trip: t, category: draft.query.isEmpty ? category : .trips, showsDivider: i < min(results.count, 8) - 1) {
                            filter = draft
                            dismiss()
                            router.push(.trip(slug: t.slug))
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack(spacing: 12) {
                Button("Clear all") { draft = ExploreFilter() }.buttonStyle(.pcLink).disabled(draft.isEmpty)
                Spacer()
                Button("Show \(results.count) trip\(results.count == 1 ? "" : "s")") {
                    filter = draft
                    dismiss()
                }
                .buttonStyle(.pcAccent)
            }
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 8)
            .pcBarBackground()
        }
        .onAppear { draft = filter }
        .onChange(of: draft.query) { _, q in
            Task {
                try? await Task.sleep(for: .milliseconds(300))
                if q == draft.query { await app.explore.search(q) }
            }
        }
    }

    private func group<C: View>(_ title: String, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 12, weight: .bold)).foregroundStyle(Pc.ink2)
            content()
        }
    }

    private func chip(_ text: String, _ on: Bool, _ action: @escaping () -> Void) -> some View {
        PcChip(text: text, selected: on, showsCheck: false, action: action)
    }
}
