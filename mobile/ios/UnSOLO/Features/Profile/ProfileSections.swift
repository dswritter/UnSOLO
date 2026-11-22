import SwiftUI

// Profile pieces shared by You and other people's profiles (Android ui/profile/ProfileSections.kt).

/// Pulsing placeholder block.
struct SkeletonBlock: View {
    var height: CGFloat = 14
    var width: CGFloat? = nil
    @State private var on = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        RoundedRectangle(cornerRadius: 12).fill(Pc.tonal)
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
            .opacity(on ? 0.9 : 0.45)
            .onAppear { if !reduceMotion { withAnimation(.easeInOut(duration: 0.7).repeatForever()) { on = true } } }
    }
}

/// Status, bio and stats placeholders while the profile loads.
struct ProfileSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SkeletonBlock(height: 34, width: 240)
            SkeletonBlock()
            SkeletonBlock(width: 260)
            SkeletonBlock(height: 12, width: 160)
            HStack(spacing: 8) { ForEach(0..<4, id: \.self) { _ in SkeletonBlock(height: 56, width: 76) } }.padding(.top, 8)
            SkeletonBlock(height: 48)
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .accessibilityElement()
        .accessibilityLabel("Loading profile")
    }
}

/// Status line, bio, place / Instagram / website, travel style, joined.
struct ProfileAbout: View {
    let profile: ProfileResponse
    var onEditStatus: (() -> Void)?
    @Environment(\.openURL) private var openURL

    var body: some View {
        let u = profile.user
        VStack(alignment: .leading, spacing: 8) {
            if u.statusText != nil || onEditStatus != nil {
                let status = u.statusText
                Button { onEditStatus?() } label: {
                    HStack(spacing: 6) {
                        Text("💭").font(.system(size: 14))
                        Text(status ?? "Set a status").pcFont(.bodyStrong).foregroundStyle(status != nil ? Pc.ink : Pc.ink2).lineLimit(2)
                        if onEditStatus != nil { Image(systemName: "pencil").font(.system(size: 12, weight: .bold)).foregroundStyle(Pc.ink2) }
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 14).fill(status != nil ? Pc.goldBg : Pc.tonal))
                }
                .buttonStyle(.plain)
                .disabled(onEditStatus == nil)
                .accessibilityHint(onEditStatus != nil ? "Edit your status" : "")
                .padding(.top, 10)
            }
            if let bio = u.bio, !bio.isEmpty { Text(bio).pcFont(.body).foregroundStyle(Pc.ink) }
            FlowLayout(spacing: 8) {
                if let loc = u.location ?? u.homeCity, !loc.isEmpty {
                    linkChip("mappin", loc) {
                        let q = loc.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? loc
                        if let url = URL(string: "https://maps.apple.com/?q=\(q)") { openURL(url) }
                    }
                }
                if let ig = u.instagramUrl, !ig.isEmpty, let url = URL(string: ig) {
                    linkChip("camera", "@" + (ig.split(separator: "/").last.map(String.init) ?? ig)) { openURL(url) }
                }
                if let web = u.websiteUrl, !web.isEmpty, let url = URL(string: web) {
                    linkChip("link", web.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
                        .replacingOccurrences(of: "www.", with: "").trimmingCharacters(in: CharacterSet(charactersIn: "/"))) { openURL(url) }
                }
                if let j = u.joinedAt, let d = Fmt.day(String(j.prefix(10))) {
                    linkChip("calendar", "Joined \(Fmt.monthShort(Fmt.ymd(d)).capitalized) \(Fmt.calendar.component(.year, from: d))", nil)
                }
                if profile.followsYou == true { PcTag(text: "Follows you", style: .neutral) }
            }
            if let styles = u.travelStyle, !styles.isEmpty {
                FlowLayout(spacing: 6) { ForEach(styles, id: \.self) { PcTag(text: $0, style: .kind) } }
            }
        }
        .padding(.horizontal, 20)
    }

    private func linkChip(_ symbol: String, _ text: String, _ action: (() -> Void)?) -> some View {
        Button { action?() } label: {
            HStack(spacing: 4) {
                Image(systemName: symbol).font(.system(size: 12, weight: .semibold)).foregroundStyle(Pc.ink2)
                Text(text).pcFont(.small).foregroundStyle(action != nil ? Pc.accentInk : Pc.ink2).lineLimit(1)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
    }
}

/// Trips · states · reviews · listings · points · badges · followers · following; every number opens its details.
struct ProfileStatsRow: View {
    let profile: ProfileResponse
    var fallbackTrips: Int?
    let onOpen: (String) -> Void

    var body: some View {
        let s = profile.stats
        VStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    stat(s?.trips.map(String.init) ?? (s != nil ? "🔒" : "\(fallbackTrips ?? profile.user.tripsCount)"), "trips") { onOpen("trips") }
                    stat(s?.states.map(String.init) ?? (s != nil ? "🔒" : "0"), "states") { onOpen("trips") }
                    stat("\(s?.reviews ?? 0)", "reviews") { onOpen("reviews") }
                    if (s?.listings ?? 0) > 0 { stat("\(s!.listings!)", "listings") { onOpen("listings") } }
                    stat("\(s?.points ?? 0)", "points") { onOpen("leaderboard") }
                    stat("\(profile.badges?.earned?.count ?? 0)", "badges") { onOpen("badges") }
                    stat("\(profile.user.followers)", "followers") { onOpen("followers") }
                    stat("\(profile.user.following)", "following") { onOpen("following") }
                }
                .padding(.horizontal, 20)
            }
            if let s, let tier = s.tier {
                // Leaderboard tier and how far to the next one; tap for the full leaderboard.
                Button { onOpen("leaderboard") } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 0) {
                            Text(tier.name ?? "Newcomer").pcFont(.bodyStrong, weight: .bold).foregroundStyle(Pc.ink)
                            if let r = s.rank { Text("  · #\(r) on the leaderboard").pcFont(.small).foregroundStyle(Pc.ink2) }
                            Spacer()
                            if let next = tier.next { Text("\(tier.pointsToNext ?? 0) pts to \(next)").pcFont(.small).foregroundStyle(Pc.ink2) }
                        }
                        GeometryReader { g in
                            Capsule().fill(Pc.rule).overlay(alignment: .leading) {
                                Capsule().fill(Pc.gold).frame(width: g.size.width * min(1, max(0, Double(tier.percent ?? 0) / 100)))
                            }
                        }
                        .frame(height: 6)
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Pc.tonal))
                }
                .buttonStyle(.pcPress)
                .accessibilityHint("Opens the leaderboard")
                .padding(.horizontal, 20)
            }
        }
        .padding(.top, 12)
    }

    private func stat(_ value: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 1) {
                Text(value).font(PcFont.rounded(22)).foregroundStyle(Pc.ink)
                Text(label).pcFont(.small).foregroundStyle(Pc.ink2)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Pc.rule, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.pcPress)
        .accessibilityLabel("\(value) \(label)")
        .accessibilityHint("Opens \(label)")
    }
}

/// Their phone: shown, masked with "Ask for number", or request pending.
struct PhoneRow: View {
    let phone: ProfilePhone
    let onRequest: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "phone").font(.system(size: 15, weight: .semibold)).foregroundStyle(Pc.ink2)
            Text(phone.number ?? phone.masked ?? "Phone hidden").pcFont(.num).foregroundStyle(Pc.ink)
            Spacer()
            if let n = phone.number {
                Button("Call") { if let url = URL(string: "tel:\(n.filter { $0.isNumber || $0 == "+" })") { openURL(url) } }
                    .buttonStyle(.pc(.quiet, compact: true))
            } else if phone.request == "pending" {
                Text("Request sent").pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink2)
            } else if phone.canRequest == true {
                Button(phone.request == "rejected" ? "Ask again" : "Ask for number", action: onRequest).buttonStyle(.pc(.quiet, compact: true))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Pc.rule, lineWidth: 1))
        .padding(.horizontal, 20)
        .padding(.top, 10)
    }
}

/// Own profile: people asking for your number, with Share / Decline.
struct PhoneRequestsCard: View {
    @Environment(AppModel.self) private var app
    var body: some View {
        let items = app.profiles.phoneRequests
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Asked for your number").pcFont(.bodyStrong, weight: .bold).foregroundStyle(Pc.ink)
                ForEach(items) { r in
                    HStack(spacing: 8) {
                        Avatar(user: r.user, size: 32)
                        Text(r.user.name).pcFont(.body).foregroundStyle(Pc.ink).lineLimit(1)
                        Spacer()
                        Button("Decline") { Task { await app.profiles.decidePhoneRequest(r, approve: false) } }.buttonStyle(.pc(.link, compact: true))
                        Button("Share") { Task { await app.profiles.decidePhoneRequest(r, approve: true) } }.buttonStyle(.pc(.quiet, compact: true))
                    }
                }
            }
            .padding(14)
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Pc.gold, lineWidth: 1))
            .padding(.horizontal, 20)
            .padding(.top, 10)
        }
    }
}

/// How you're connected (others' profiles): mutual follows, shared trips, shared groups, places in common.
struct ConnectionsCard: View {
    let connections: ProfileConnections?
    let mutualPlaces: [String]
    @Environment(Router.self) private var router

    var body: some View {
        let mutual = connections?.mutual ?? []
        let shared = connections?.shared ?? []
        let rooms = connections?.rooms ?? []
        if !(mutual.isEmpty && shared.isEmpty && rooms.isEmpty && mutualPlaces.isEmpty) {
            VStack(alignment: .leading, spacing: 8) {
                Text("How you're connected").pcFont(.label, weight: .bold).foregroundStyle(Pc.ink2)
                if !mutual.isEmpty {
                    HStack(spacing: 8) {
                        FaceStack(users: Array(mutual.prefix(3)), size: 26)
                        let count = connections?.mutualCount ?? mutual.count
                        Text(mutual.prefix(2).map(\.firstName).joined(separator: ", ") + (count > 2 ? " +\(count - 2)" : "") + " in common")
                            .pcFont(.small).foregroundStyle(Pc.ink)
                    }
                }
                ForEach(Array(shared.prefix(3).enumerated()), id: \.offset) { _, s in
                    Button("\(s.hostedByThem == true ? "They host" : "You both booked") \(s.title)") {
                        let slug = s.path.split(separator: "/").last.map(String.init) ?? ""
                        if DeepLink.isSlug(slug) { router.push(.trip(slug: slug)) }
                    }
                    .buttonStyle(.plain).pcFont(.small).foregroundStyle(Pc.accentInk)
                }
                if !rooms.isEmpty { Text("Both in \(rooms.prefix(3).map(\.name).joined(separator: ", "))").pcFont(.small).foregroundStyle(Pc.ink) }
                if !mutualPlaces.isEmpty {
                    Text("You've both been to \(mutualPlaces.prefix(3).map { $0.components(separatedBy: ",").first ?? $0 }.joined(separator: " · "))")
                        .pcFont(.small).foregroundStyle(Pc.ink)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16).fill(Pc.tonal))
            .padding(.horizontal, 20)
            .padding(.top, 10)
        }
    }
}

/// A row of faces: "Reached out to you" (own host profile) or "Travellers hosted".
struct PeopleRail: View {
    let title: String
    let people: [UserLite]
    var total: Int?
    @Environment(Router.self) private var router

    var body: some View {
        if !people.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeader(title: title, trailing: (total ?? 0) > people.count ? "\(total!)" : nil).padding(.horizontal, 20)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(people) { u in
                            Button { if !u.username.isEmpty { router.push(.profile(username: u.username)) } } label: {
                                VStack(spacing: 4) {
                                    Avatar(user: u, size: 48)
                                    Text(u.firstName).pcFont(.label).foregroundStyle(Pc.ink2).lineLimit(1)
                                }
                                .frame(width: 62)
                            }
                            .buttonStyle(.pcPress)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
            .padding(.top, 14)
        }
    }
}

/// States explored on the India map (visited ones filled), then the trip log.
struct TravelSection: View {
    let travel: ProfileTravel?
    let own: Bool
    var pastFallback: [Booking] = []
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let travel {
                if let states = travel.states {
                    let visited = Set(states)
                    Text("\(visited.count) of \(indianStates.count) states explored").pcFont(.bodyStrong, weight: .bold).foregroundStyle(Pc.ink)
                    IndiaMap(visited: visited)
                    FlowLayout(spacing: 6) {
                        let ordered = indianStates.filter { visited.contains($0) } + visited.filter { !indianStates.contains($0) }.sorted()
                            + indianStates.filter { !visited.contains($0) }
                        ForEach(ordered, id: \.self) { st in
                            let on = visited.contains(st)
                            Text(st).font(.system(size: 11, weight: on ? .bold : .regular)).foregroundStyle(on ? Pc.onGold : Pc.ink3)
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(Capsule().fill(on ? Pc.gold : Pc.tonal))
                        }
                    }
                } else {
                    EmptyState(symbol: "lock", title: "Travel is private", message: "They've chosen to keep their trips to themselves.")
                }
                let trips = travel.trips ?? []
                if !trips.isEmpty {
                    Overline(text: "Trips").padding(.top, 10)
                    ForEach(Array(trips.enumerated()), id: \.offset) { _, t in
                        Button { if let s = t.slug { router.push(.trip(slug: s)) } } label: {
                            HStack {
                                Text(Fmt.dayMonth(t.date)).pcFont(.num).foregroundStyle(Pc.ink).frame(width: 72, alignment: .leading)
                                Text(t.title).pcFont(.bodyStrong).foregroundStyle(Pc.ink).lineLimit(1)
                                Spacer()
                            }
                            .padding(.vertical, 10)
                            .overlay(alignment: .bottom) { HairlineRule() }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(t.slug == nil)
                    }
                } else if travel.states?.isEmpty == true {
                    Text(own ? "Book a trip and the states you visit light up here." : "No trips yet.").pcFont(.small).foregroundStyle(Pc.ink2)
                }
            } else if pastFallback.isEmpty {
                EmptyState(symbol: "map", title: "Trip log", message: own ? "Your past UnSOLO trips show here." : "Trips are shown to the traveller only.")
            } else {
                ForEach(pastFallback) { b in PastTripRow(booking: b) }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }
}

/// Reviews they received as a host (with the average), then reviews they wrote.
struct ReviewsSection: View {
    let profile: ProfileResponse

    var body: some View {
        let hostReviews = profile.host?.reviews ?? []
        let written = profile.reviewsWritten ?? []
        VStack(alignment: .leading, spacing: 10) {
            if !hostReviews.isEmpty {
                Text("★ \(profile.host?.reviewAverage.map { String(format: "%.1f", $0) } ?? "–") · \(profile.host?.reviewTotal ?? hostReviews.count) reviews as a host")
                    .pcFont(.bodyStrong, weight: .bold).foregroundStyle(Pc.ink)
                ForEach(hostReviews) { ReviewCard(review: $0) }
            }
            if !written.isEmpty {
                Overline(text: "Reviews they wrote").padding(.top, 6)
                ForEach(written) { ReviewCard(review: $0) }
            }
            if hostReviews.isEmpty && written.isEmpty {
                EmptyState(symbol: "star", title: "No reviews yet", message: "Reviews from trips and hosts show here.")
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }
}

struct ReviewCard: View {
    let review: ProfileReview
    @Environment(Router.self) private var router
    var body: some View {
        Button { if let s = review.slug { router.push(.trip(slug: s)) } } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if let r = review.reviewer {
                        Avatar(user: r, size: 24)
                        Text(r.firstName).pcFont(.small, weight: .bold).foregroundStyle(Pc.ink)
                    }
                    let n = min(5, max(0, review.rating ?? 0))
                    Text(String(repeating: "★", count: n) + String(repeating: "☆", count: 5 - n)).pcFont(.small).foregroundStyle(Pc.goldInk)
                    Spacer()
                    if let at = review.createdAt { Text(Fmt.relative(at)).pcFont(.label).foregroundStyle(Pc.ink3) }
                }
                if let s = review.subject { Text(s).pcFont(.label).foregroundStyle(Pc.ink2) }
                if let b = review.body, !b.isEmpty { Text(b).pcFont(.body).foregroundStyle(Pc.ink).multilineTextAlignment(.leading) }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Pc.rule, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(review.slug == nil)
    }
}

/// Badges earned, and the next few to unlock.
struct BadgesSection: View {
    let badges: ProfileBadges?
    let own: Bool

    var body: some View {
        let earned = badges?.earned ?? []
        let next = badges?.next ?? []
        VStack(alignment: .leading, spacing: 10) {
            Text("\(earned.count) of \(badges?.total ?? 0) badges").pcFont(.bodyStrong, weight: .bold).foregroundStyle(Pc.ink)
            if earned.isEmpty {
                Text(own ? "Book trips, write reviews and meet people to earn them." : "None yet.").pcFont(.small).foregroundStyle(Pc.ink2)
            }
            FlowLayout(spacing: 10) { ForEach(earned) { tile($0, earned: true) } }
            if !next.isEmpty {
                Overline(text: "Next to unlock").padding(.top, 8)
                FlowLayout(spacing: 10) { ForEach(next) { tile($0, earned: false) } }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    private func tile(_ b: Badge, earned: Bool) -> some View {
        VStack(spacing: 3) {
            Text(b.icon ?? "🏅").font(.system(size: 26)).opacity(earned ? 1 : 0.55)
            Text(b.name).font(.system(size: 11, weight: .bold)).foregroundStyle(earned ? Pc.ink : Pc.ink3).multilineTextAlignment(.center).lineLimit(2)
            Text(b.description ?? "").font(.system(size: 10)).foregroundStyle(Pc.ink3).multilineTextAlignment(.center).lineLimit(2)
        }
        .padding(10)
        .frame(width: 100)
        .background(RoundedRectangle(cornerRadius: 14).fill(earned ? Pc.goldBg : Pc.tonal))
        .accessibilityElement(children: .combine)
    }
}

/// Your profile status line and who sees it.
struct StatusEditSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var visibility = "public"
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SheetHeader(title: "Your status", subtitle: "A line on your profile, like \"Off to Spiti next week\".")
            TextField("What are you up to?", text: $text)
                .padding(.horizontal, 14).padding(.vertical, 12).pcField()
                .onChange(of: text) { _, v in if v.count > 140 { text = String(v.prefix(140)) } }
            Text("\(text.count)/140").pcFont(.label).foregroundStyle(Pc.ink3)
            PcSegmented(items: [("public", "Everyone"), ("followers", "Followers only")], selection: $visibility)
            HStack(spacing: 10) {
                if !(session.me?.user.statusText ?? "").isEmpty {
                    Button("Clear") { save("") }.buttonStyle(.pc(.outline, fullWidth: true)).disabled(busy)
                }
                Button(busy ? "Saving…" : "Save") { save(text.trimmingCharacters(in: .whitespaces)) }.buttonStyle(.pc(.accent, fullWidth: true)).disabled(busy)
            }
        }
        .padding(20)
        .onAppear {
            text = session.me?.user.statusText ?? ""
            visibility = session.me?.user.statusVisibility ?? "public"
        }
    }

    private func save(_ value: String) {
        busy = true
        Task {
            let r = await session.saveProfile(ProfilePatch(statusText: value, statusVisibility: visibility))
            busy = false
            if let err = r { app.showToast(err) } else {
                if let u = session.user?.username { await app.profiles.refresh(u) }
                dismiss()
            }
        }
    }
}
