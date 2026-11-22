import SwiftUI
import WidgetKit

/// What the app writes to the shared App Group (see UnSOLO/Services/WidgetBridge.swift; keep the two in step).
struct CountdownSnapshot: Codable, Equatable {
    var title: String
    var place: String?
    var startDate: String // YYYY-MM-DD (IST)
    var endDate: String?
    var slug: String
    var bookingId: String
    var travellers: Int?

    static let appGroup = "group.in.unsolo.app"
    static let key = "widget.countdown"

    static func load() -> CountdownSnapshot? {
        guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(CountdownSnapshot.self, from: data)
    }
}

struct CountdownEntry: TimelineEntry {
    let date: Date
    let trip: CountdownSnapshot?
}

struct CountdownProvider: TimelineProvider {
    func placeholder(in context: Context) -> CountdownEntry {
        CountdownEntry(date: Date(), trip: CountdownSnapshot(title: "Spiti winter circuit", place: "Kaza", startDate: Self.ymd(Date().addingTimeInterval(9 * 86_400)),
                                                             endDate: nil, slug: "spiti", bookingId: "", travellers: 8))
    }

    func getSnapshot(in context: Context, completion: @escaping (CountdownEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : CountdownEntry(date: Date(), trip: CountdownSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CountdownEntry>) -> Void) {
        let trip = CountdownSnapshot.load()
        // One entry per day until it starts; refresh just after midnight IST.
        var entries: [CountdownEntry] = []
        let cal = Self.calendar
        let start = cal.startOfDay(for: Date())
        for d in 0..<8 { if let day = cal.date(byAdding: .day, value: d, to: start) { entries.append(CountdownEntry(date: d == 0 ? Date() : day, trip: trip)) } }
        completion(Timeline(entries: entries, policy: .atEnd))
    }

    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Kolkata") ?? .current
        return c
    }

    static func ymd(_ d: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func day(_ ymd: String?) -> Date? {
        guard let p = ymd?.split(separator: "-").compactMap({ Int($0) }), p.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }

    /// Days from `now` to the trip start (0 = today), and whether it's under way.
    static func countdown(_ t: CountdownSnapshot, now: Date) -> (days: Int, onTrip: Bool)? {
        guard let s = day(t.startDate) else { return nil }
        let today = calendar.startOfDay(for: now)
        let days = calendar.dateComponents([.day], from: today, to: s).day ?? 0
        let end = day(t.endDate) ?? s
        return (days, days <= 0 && today <= end)
    }
}

struct CountdownView: View {
    let entry: CountdownEntry
    @Environment(\.widgetFamily) private var family

    private let gold = Color(red: 0.988, green: 0.729, blue: 0.071)
    private let ink = Color(red: 0.067, green: 0.067, blue: 0.067)

    var body: some View {
        Group {
            if let t = entry.trip, let c = CountdownProvider.countdown(t, now: entry.date) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(c.onTrip ? "ON YOUR TRIP" : "NEXT TRIP").font(.system(size: 10, weight: .heavy)).tracking(0.6).foregroundStyle(ink.opacity(0.7))
                    if c.onTrip {
                        Text("Today").font(.system(size: 34, weight: .heavy, design: .rounded)).foregroundStyle(ink)
                    } else {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(max(0, c.days))").font(.system(size: 44, weight: .heavy, design: .rounded)).monospacedDigit().foregroundStyle(ink)
                            Text(c.days == 1 ? "day" : "days").font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(ink)
                        }
                    }
                    Spacer(minLength: 0)
                    Text(t.title).font(.system(size: 14, weight: .bold)).foregroundStyle(ink).lineLimit(family == .systemSmall ? 2 : 1)
                    if family != .systemSmall {
                        Text([t.place, t.travellers.map { "\($0) going" }].compactMap { $0 }.joined(separator: " · "))
                            .font(.system(size: 12, weight: .medium)).foregroundStyle(ink.opacity(0.75)).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .widgetURL(URL(string: "unsolo://bookings"))
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("UNSOLO").font(.system(size: 13, weight: .black)).foregroundStyle(ink)
                    Spacer(minLength: 0)
                    Text("No trip booked yet").font(.system(size: 14, weight: .bold)).foregroundStyle(ink)
                    Text("Find your next one").font(.system(size: 12)).foregroundStyle(ink.opacity(0.7))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .widgetURL(URL(string: "unsolo://explore"))
            }
        }
        .containerBackground(gold, for: .widget)
    }
}

struct CountdownWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TripCountdown", provider: CountdownProvider()) { entry in
            CountdownView(entry: entry)
        }
        .configurationDisplayName("Trip countdown")
        .description("Days to your next UnSOLO trip.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct UnSOLOWidgets: WidgetBundle {
    var body: some Widget { CountdownWidget() }
}
