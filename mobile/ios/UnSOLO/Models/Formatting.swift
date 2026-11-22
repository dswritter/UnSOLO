import Foundation

/// Deterministic formatting for money, dates and relative times. Dates in the contract are
/// `YYYY-MM-DD` (local to India); timestamps are ISO-8601 UTC. Everything renders in Asia/Kolkata.
enum Fmt {
    static let ist = TimeZone(identifier: "Asia/Kolkata") ?? .current
    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = ist
        c.locale = Locale(identifier: "en_IN")
        return c
    }

    private static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    private static let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    // MARK: Money

    /// Paise → "₹14,699" with Indian digit grouping (₹1,38,420).
    static func rupees(_ paise: Int) -> String {
        "₹" + indianGrouping(paise / 100)
    }

    static func indianGrouping(_ value: Int) -> String {
        let negative = value < 0
        var digits = String(abs(value))
        guard digits.count > 3 else { return (negative ? "-" : "") + digits }
        let last3 = String(digits.suffix(3))
        digits.removeLast(3)
        var groups: [String] = []
        while digits.count > 2 {
            groups.insert(String(digits.suffix(2)), at: 0)
            digits.removeLast(2)
        }
        if !digits.isEmpty { groups.insert(digits, at: 0) }
        return (negative ? "-" : "") + groups.joined(separator: ",") + "," + last3
    }

    // MARK: Dates

    static func day(_ ymd: String?) -> Date? {
        guard let ymd else { return nil }
        let parts = ymd.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
    }

    static func ymd(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// "Thu 26 Nov"
    static func weekdayDayMonth(_ ymd: String?) -> String {
        guard let d = day(ymd) else { return "Dates TBC" }
        let c = calendar.dateComponents([.weekday, .day, .month], from: d)
        return "\(weekdays[(c.weekday ?? 1) - 1]) \(c.day ?? 0) \(months[(c.month ?? 1) - 1])"
    }

    /// "26 Nov"
    static func dayMonth(_ ymd: String?) -> String {
        guard let d = day(ymd) else { return "TBC" }
        let c = calendar.dateComponents([.day, .month], from: d)
        return "\(c.day ?? 0) \(months[(c.month ?? 1) - 1])"
    }

    /// "26 Nov 2026" (falls back to the raw text).
    static func longDate(_ text: String?) -> String {
        guard let d = day(text.map { String($0.prefix(10)) }) else { return text ?? "" }
        return "\(dayMonth(Fmt.ymd(d))) \(calendar.component(.year, from: d))"
    }

    static func dayNumber(_ ymd: String?) -> String {
        guard let d = day(ymd) else { return "--" }
        return String(format: "%02d", calendar.component(.day, from: d))
    }

    static func weekdayShort(_ ymd: String?) -> String {
        guard let d = day(ymd) else { return "" }
        return weekdays[calendar.component(.weekday, from: d) - 1].uppercased()
    }

    static func monthShort(_ ymd: String?) -> String {
        guard let d = day(ymd) else { return "" }
        return months[calendar.component(.month, from: d) - 1].uppercased()
    }

    static func monthYear(_ ymd: String?) -> String {
        guard let d = day(ymd) else { return "" }
        let c = calendar.dateComponents([.month, .year], from: d)
        let full = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER",
                    "OCTOBER", "NOVEMBER", "DECEMBER"]
        return "\(full[(c.month ?? 1) - 1]) \(c.year ?? 0)"
    }

    /// "12–18 Jan", "28 Nov – 2 Dec", or a single day.
    static func range(_ from: String?, _ to: String?) -> String {
        guard let a = day(from) else { return "Dates open" }
        guard let b = day(to), b != a else { return dayMonth(from) }
        let ca = calendar.dateComponents([.day, .month], from: a)
        let cb = calendar.dateComponents([.day, .month], from: b)
        if ca.month == cb.month {
            return "\(ca.day ?? 0)–\(cb.day ?? 0) \(months[(ca.month ?? 1) - 1])"
        }
        return "\(dayMonth(from)) – \(dayMonth(to))"
    }

    static func daysUntil(_ ymd: String?, now: Date = Date()) -> Int? {
        guard let d = day(ymd) else { return nil }
        let start = calendar.startOfDay(for: now)
        let end = calendar.startOfDay(for: d)
        return calendar.dateComponents([.day], from: start, to: end).day
    }

    /// "2h", "3d", "14 Nov"
    static func relative(_ date: Date, now: Date = Date()) -> String {
        let s = max(0, now.timeIntervalSince(date))
        if s < 60 { return "now" }
        if s < 3600 { return "\(Int(s / 60))m" }
        if s < 86_400 { return "\(Int(s / 3600))h" }
        if s < 7 * 86_400 { return "\(Int(s / 86_400))d" }
        let c = calendar.dateComponents([.day, .month], from: date)
        return "\(c.day ?? 0) \(months[(c.month ?? 1) - 1])"
    }

    static func time(_ date: Date) -> String {
        let c = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    static func duration(_ days: Int) -> String {
        days <= 1 ? "1 day" : "\(days)D/\(days - 1)N"
    }

    /// Phone-only accounts carry a placeholder email `<digits>@phone.unsolo.in`; never show it.
    static func isPlaceholderEmail(_ email: String?) -> Bool {
        email?.lowercased().hasSuffix("@phone.unsolo.in") ?? false
    }

    /// The email to display, or nil for none / placeholder addresses.
    static func displayEmail(_ email: String?) -> String? {
        guard let email, !email.isEmpty, !isPlaceholderEmail(email) else { return nil }
        return email
    }
}
