import SwiftUI

/// Host hub: "Plans looking for a host" (the demand board) → make an offer.
struct HostHubView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    /// The contract has no dedicated "plans looking for a host" endpoint yet, so we use /feed?kind=plan
    /// and show live plans the host doesn't organise (see ios.md, Contract gaps).
    private var plans: [Post] {
        app.tribe.items(for: "plan").compactMap { item -> Post? in
            if case .post(let p) = item, p.viewer?.isAuthor != true, p.status == .live, !p.isLocal { return p }
            return nil
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Hosting").pcFont(.display).foregroundStyle(Pc.ink)
                    Spacer()
                    Button { router.safari = SafariItem(url: AppInfo.webBaseURL.appendingPathComponent("host")) } label: {
                        Label("New trip", systemImage: "plus")
                    }
                    .buttonStyle(.pc(.primary, compact: true))
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                if !app.flags.hostOffersEnabled {
                    Text("Host offers are paused right now.").pcFont(.small).foregroundStyle(Pc.red).padding(16)
                }
                SectionHeader(title: "Plans looking for a host", trailing: "\(plans.count)").padding(.horizontal, 20).padding(.top, 20).padding(.bottom, 10)
                VStack(spacing: 10) {
                    ForEach(plans) { p in demandCard(p) }
                }
                .padding(.horizontal, 20)
                Text("Only the organiser and members see offers. If they accept, every member gets a held seat and 48h to pay.")
                    .pcFont(.small).foregroundStyle(Pc.ink2).padding(16)
                SectionHeader(title: "Your departures").padding(.horizontal, 20).padding(.top, 8)
                Text("Departures, balances and payouts are managed on unsolo.in for now.").pcFont(.small).foregroundStyle(Pc.ink2)
                    .padding(.horizontal, 20).padding(.top, 4)
                Button("Open host dashboard") { router.safari = SafariItem(url: AppInfo.webBaseURL.appendingPathComponent("host")) }
                    .buttonStyle(.pcLink).padding(.horizontal, 20)
                Color.clear.frame(height: 24)
            }
        }
        .refreshable { await app.tribe.refreshFeed(key: "plan") }
        .pcScreen()
        .pcNavigationBar()
        .task { await app.tribe.refreshFeed(key: "plan") }
    }

    private func demandCard(_ p: Post) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("\(p.reactions.wantToGo) want to go", systemImage: "mappin.and.ellipse").labelStyle(CountLabelStyle())
            HStack(alignment: .firstTextBaseline) {
                Text(p.displayTitle).pcFont(.title3).foregroundStyle(Pc.ink)
                Spacer()
                Text(Fmt.range(p.startsOn, p.endsOn)).pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
            }
            Text("\(p.place?.name.components(separatedBy: ",").first ?? "") · \(p.memberCount) of \(p.spotsTotal ?? 0) in · organiser \(p.author.firstName)")
                .pcFont(.small).foregroundStyle(Pc.ink2)
            HStack {
                FaceStack(users: SeatBuilder.planSeats(p).compactMap(\.user), size: 26)
                Spacer()
                let offered = (app.tribe.offers[p.id] ?? []).contains { $0.host.id == session.user?.id }
                Button(offered ? "Offer sent" : "Offer to host") { router.push(.offerForm(postId: p.id)) }
                    .buttonStyle(.pc(.outline, compact: true))
                    .disabled(offered || !app.flags.hostOffersEnabled)
            }
        }
        .padding(16)
        .pcPencilled()
    }
}

struct OfferFormView: View {
    let postId: String
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var price = ""
    @State private var includes: Set<String> = ["Transport from Delhi", "Stays"]
    @State private var custom = ""
    @State private var keepDates = true
    @State private var extraSeats = 0
    @State private var note = ""
    @State private var sending = false
    @State private var error: String?

    static let presets = ["Transport from Delhi", "Stays", "Trek guide", "Meals", "Permits", "Trip captain", "Activities"]
    private var post: Post? { app.tribe.post(postId) }
    private var pricePaise: Int? { Int(price.filter(\.isNumber)).map { $0 * 100 } }
    private var estimatePaise: Int? {
        guard let text = post?.estCostText else { return nil }
        let digits = text.split(whereSeparator: { !$0.isNumber && $0 != "," }).first.map { $0.filter(\.isNumber) }
        return digits.flatMap { Int($0) }.map { $0 * 100 }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let post {
                    VStack(alignment: .leading, spacing: 6) {
                        CommunityPlanLabel(text: "Community plan · organiser \(post.author.firstName)")
                        HStack(alignment: .firstTextBaseline) {
                            Text(post.displayTitle).pcFont(.title3).foregroundStyle(Pc.ink)
                            Spacer()
                            Text(Fmt.range(post.startsOn, post.endsOn)).pcFont(.small).monospacedDigit().foregroundStyle(Pc.ink2)
                        }
                        Text("Group of \(post.spotsTotal ?? 0) · \(post.memberCount) in · \(post.estCostText ?? "no estimate")").pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                    .padding(14)
                    .pcPencilled()
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                }
                FormRow(label: "Your price per person", hint: comparison) {
                    HStack(spacing: 2) {
                        Text("₹").pcFont(.title1).foregroundStyle(Pc.ink)
                        TextField("5,499", text: $price).keyboardType(.numberPad).pcFont(.title1).monospacedDigit()
                    }
                }
                FormRow(label: "Included") {
                    FlowLayout(spacing: 8) {
                        ForEach(Self.presets + includes.filter { !Self.presets.contains($0) }.sorted(), id: \.self) { item in
                            PcChip(text: item, selected: includes.contains(item)) {
                                if includes.contains(item) { includes.remove(item) } else { includes.insert(item) }
                            }
                        }
                    }
                    HStack {
                        TextField("Add something else", text: $custom).pcFont(.body)
                        Button("Add") {
                            let c = custom.trimmingCharacters(in: .whitespaces)
                            if !c.isEmpty { includes.insert(c); custom = "" }
                        }
                        .buttonStyle(.pcLink)
                    }
                }
                Toggle(isOn: $keepDates) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Keep the group's dates").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                        Text(post.map { Fmt.range($0.startsOn, $0.endsOn) + ", as planned" } ?? "").pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                }
                .tint(Pc.pine).padding(16).pcCard().padding(.horizontal, 20).padding(.top, 12)
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Open more seats to others").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                        Text("The group can say no to this").pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                    Spacer()
                    Text("\(extraSeats)").pcFont(.bodyStrong).monospacedDigit()
                    Stepper("Extra seats", value: $extraSeats, in: 0...8).labelsHidden()
                }
                .padding(16).pcCard().padding(.horizontal, 20).padding(.top, 12)
                FormRow(label: "Note to the group") { TextField("We've run Kalga 14 times…", text: $note, axis: .vertical).pcFont(.body).lineLimit(2...6) }
                if let error { Text(error).pcFont(.small).foregroundStyle(Pc.red).padding(16) }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BottomActionBar {
                Text("Seen by the \(post?.memberCount ?? 0) members only").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                Text("Not shown in the public feed").pcFont(.small).foregroundStyle(Pc.ink2)
            } trailing: {
                Button(sending ? "Sending…" : "Send offer") { send() }
                    .buttonStyle(.pcPrimary)
                    .disabled(sending || (pricePaise ?? 0) < 10_000 || includes.isEmpty)
            }
        }
        .pcScreen()
        .pcNavigationBar("Offer to host")
        .task { if post == nil { await app.tribe.refreshPost(postId) } }
    }

    private var comparison: String {
        guard let p = pricePaise, let e = estimatePaise else { return "Paid through UnSOLO, under your cancellation policy." }
        let diff = p - e
        let rel = diff == 0 ? "Same as" : diff > 0 ? "\(Fmt.rupees(diff)) more than" : "\(Fmt.rupees(-diff)) less than"
        return "\(rel) the group's estimate (~\(Fmt.rupees(e))). Paid through UnSOLO, under your cancellation policy."
    }

    private func send() {
        guard let pricePaise else { return }
        sending = true
        error = nil
        Task {
            do {
                try await app.tribe.makeOffer(postId: postId, OfferBody(pricePaise: pricePaise, includes: Array(includes).sorted(),
                                                                         notes: note.isEmpty ? nil : note, extraSeats: extraSeats))
                app.showToast("Offer sent to the group")
                dismiss()
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
            sending = false
        }
    }
}

/// Organiser reviews host offers: accept turns the plan into a hosted trip (members get held seats, 48h to pay).
struct OfferReviewView: View {
    let postId: String
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var index = 0
    @State private var busy = false
    @State private var accepted: AcceptOfferResponse?
    @State private var confirmDecline = false
    @State private var error: String?

    private var post: Post? { app.tribe.post(postId) }
    private var offers: [HostOffer] { app.tribe.offers[postId] ?? [] }

    var body: some View {
        Group {
            if offers.isEmpty {
                if app.tribe.detailState[postId] == .loading { ProgressView().tint(Pc.pine).frame(maxWidth: .infinity, maxHeight: .infinity) }
                else { EmptyState(symbol: "tent", title: "No offers yet", message: "Hosts can offer to run your plan. You'll get a notification.") }
            } else {
                let offer = offers[min(index, offers.count - 1)]
                ScrollView { content(offer) }
                    .safeAreaInset(edge: .bottom, spacing: 0) { bar(offer) }
            }
        }
        .pcScreen()
        .pcNavigationBar(offers.count > 1 ? "Offer \(index + 1) of \(offers.count)" : "Host offer")
        .toolbar {
            if offers.count > 1 {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { index = max(0, index - 1) } label: { Image(systemName: "chevron.left") }.disabled(index == 0).accessibilityLabel("Previous offer")
                    Button { index = min(offers.count - 1, index + 1) } label: { Image(systemName: "chevron.right") }.disabled(index >= offers.count - 1).accessibilityLabel("Next offer")
                }
            }
        }
        .task { await app.tribe.refreshPost(postId) }
    }

    private func content(_ offer: HostOffer) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Run \(post?.displayTitle ?? "your plan") as a hosted trip?").pcFont(.display).foregroundStyle(Pc.ink).fixedSize(horizontal: false, vertical: true)
            Text("Your group of \(post?.spotsTotal ?? 0) stays together. The dates don't change. Expires \(Fmt.relativeFuture(offer.expiresAt)).")
                .pcFont(.body).foregroundStyle(Pc.ink2)
            if let accepted {
                VStack(alignment: .leading, spacing: 8) {
                    PcTag(text: "Accepted", style: .paid)
                    Text("It's a hosted trip now").pcFont(.title2).foregroundStyle(Pc.ink)
                    Text("Every member has a held seat\(accepted.payBy.map { " until \(Fmt.dayMonth(Fmt.ymd($0)))" } ?? ""). The plan chat becomes the trip chat.")
                        .pcFont(.body).foregroundStyle(Pc.ink)
                    Button("Open the trip") { app.openBooking(slug: accepted.packageSlug, date: post?.startsOn) }.buttonStyle(.pc(.primary, fullWidth: true))
                }
                .padding(14)
                .background(Pc.green.opacity(0.1), in: Pc.shape())
            }
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    SeatCell(seat: Seat(state: .host, user: offer.host), size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(offer.host.name).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                            PcTag(text: "Host", style: .host)
                        }
                        Text(offer.state == .pending ? "Offer pending" : offer.state.rawValue.capitalized).pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                }
                .padding(12)
                FactsRow(facts: [
                    Fact(symbol: "calendar", text: Fmt.range(post?.startsOn, post?.endsOn)),
                    Fact(symbol: "indianrupeesign", text: "\(Fmt.rupees(offer.pricePaise)) each"),
                    Fact(symbol: "person.2", text: "Your estimate \(post?.estCostText.map { $0.replacingOccurrences(of: "Est. ", with: "").replacingOccurrences(of: " each", with: "") } ?? "—")"),
                ])
                .padding(.horizontal, 14)
                .padding(.bottom, 6)
                ForEach(offer.includes, id: \.self) { item in
                    HStack {
                        Text(item).pcFont(.body).foregroundStyle(Pc.ink)
                        Spacer()
                        Image(systemName: "checkmark").foregroundStyle(Pc.ink)
                    }
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .overlay(alignment: .top) { HairlineRule().padding(.horizontal, 12) }
                }
                if let notes = offer.notes { Text("“\(notes)”").pcFont(.small).foregroundStyle(Pc.ink2).padding(12) }
                if offer.extraSeats > 0 { Text("Also opens \(offer.extraSeats) more seats to others").pcFont(.small).foregroundStyle(Pc.ink).padding(.horizontal, 12).padding(.bottom, 12) }
            }
            .pcCard()
            Text("If you accept").pcFont(.title2).foregroundStyle(Pc.ink)
            VStack(spacing: 0) {
                step(1, "Each member gets a held seat and 48h to pay through UnSOLO")
                step(2, "Your plan chat becomes the trip chat. \(offer.host.name) joins as host")
                step(3, "Unpaid seats are released. Refunds follow the host's policy")
            }
            if let error { Text(error).pcFont(.small).foregroundStyle(Pc.red) }
        }
        .padding(16)
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text("\(n)").font(.system(size: 13, weight: .bold).monospacedDigit()).foregroundStyle(Pc.ink)
                .frame(width: 26, height: 26).background(Circle().fill(Pc.tonal))
            Text(text).pcFont(.body).foregroundStyle(Pc.ink)
            Spacer()
        }
        .padding(.vertical, 6)
    }

    private func bar(_ offer: HostOffer) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 10) {
                Button("Ask the group") { router.push(.messages) }.buttonStyle(.pc(.outline, fullWidth: true))
                Button(busy ? "Accepting…" : "Accept offer") { accept(offer) }
                    .buttonStyle(.pc(.primary, fullWidth: true))
                    .disabled(busy || offer.state != .pending)
            }
            if offer.state == .pending {
                Button("Decline this offer…") { confirmDecline = true }.buttonStyle(.pc(.danger))
                    .confirmationDialog("Decline \(offer.host.name)'s offer?", isPresented: $confirmDecline, titleVisibility: .visible) {
                        Button("Decline offer", role: .destructive) {
                            Task {
                                do { try await app.tribe.declineOffer(offer) } catch { self.error = error.localizedDescription }
                            }
                        }
                    }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(.bar)
        .overlay(alignment: .top) { HairlineRule(color: Pc.rule.opacity(0.5)) }
    }

    private func accept(_ offer: HostOffer) {
        busy = true
        error = nil
        Task {
            do { accepted = try await app.tribe.acceptOffer(offer) } catch { self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription }
            busy = false
        }
    }
}

extension Fmt {
    static func relativeFuture(_ date: Date, now: Date = Date()) -> String {
        let s = date.timeIntervalSince(now)
        if s <= 0 { return "now" }
        if s < 3600 { return "in \(Int(s / 60)) min" }
        if s < 86_400 { return "in \(Int(s / 3600))h" }
        let d = Int(s / 86_400)
        return "in \(d) day\(d == 1 ? "" : "s")"
    }
}
