import SwiftUI

/// "See all": every card for the current tab, full width, 20 at a time; the next page loads as you near the end.
struct ExploreAllView: View {
    @State var category: ExploreCategory
    @Environment(AppModel.self) private var app

    init(category: ExploreCategory) { _category = State(initialValue: category) }

    private var items: [TripLite] { app.explore.all[category] ?? app.explore.lists[category] ?? [] }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                ChipTabs(items: ExploreCategory.allCases.map { ($0, $0.label) }, selection: $category, icons: ExploreView.categoryIcons)
                if items.isEmpty {
                    if app.explore.allState[category] == .loading || app.explore.allState[category] == nil {
                        ProgressView().tint(Pc.ink2).frame(maxWidth: .infinity).padding(40)
                    } else {
                        EmptyState(symbol: "magnifyingglass", title: "No \(category.noun) yet", message: "Check back soon.")
                    }
                }
                ForEach(items) { t in
                    TripCard(trip: t, category: ExploreCategory(kind: t.kind))
                        .padding(.horizontal, 16)
                        .onAppear {
                            if t.id == items.dropLast(4).last?.id || t.id == items.last?.id { Task { await app.explore.loadAll(category) } }
                        }
                }
                if app.explore.allState[category] == .loading && !items.isEmpty {
                    ProgressView().tint(Pc.ink2).frame(maxWidth: .infinity).padding(16)
                } else if app.explore.allDone.contains(category) && !items.isEmpty {
                    Text("That's all \(items.count) \(category.noun)").pcFont(.small).foregroundStyle(Pc.ink3).frame(maxWidth: .infinity).padding(16)
                }
            }
            .padding(.vertical, 8)
        }
        .refreshable { await app.explore.loadAll(category, reset: true) }
        .pcScreen()
        .pcNavigationBar(category == .trips ? "All trips" : "All \(category.noun)")
        .task(id: category) { if app.explore.all[category] == nil { await app.explore.loadAll(category, reset: true) } }
    }
}

extension ExploreCategory {
    var noun: String {
        switch self {
        case .trips: "trips"
        case .stays: "stays"
        case .activities: "activities"
        case .rentals: "rentals"
        }
    }
    var heroTitle: String {
        switch self {
        case .trips: "Leaving soon"
        case .stays: "Places to stay"
        case .activities: "Things to do"
        case .rentals: "Rent for the road"
        }
    }
}
