import PhotosUI
import SwiftUI

// Leaderboard, followers/following, Edit profile, Invite friends and Offers
// (Android ui/profile/LeaderboardScreens.kt and EditProfileScreen.kt).

// MARK: - Leaderboard

/// The leaderboard, as on the web: all-time top 100 or this month, with your standing on top.
struct LeaderboardView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @State private var data: LeaderboardResponse?
    @State private var failed = false
    @State private var refreshing = true
    @State private var tab = "all"

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if refreshing && data != nil { ProgressView().progressViewStyle(.linear).tint(Pc.gold) }
                PcSegmented(items: [("all", "All time"), ("month", "This month")], selection: $tab).padding(.horizontal, 16).padding(.vertical, 8)
                if let d = data {
                    if let r = d.me?.rank {
                        HStack {
                            Text("You're #\(r)").pcFont(.title2).foregroundStyle(Pc.ink)
                            Spacer()
                            if let e = d.me?.entry { Text("\(e.points ?? 0) pts").pcFont(.num).foregroundStyle(Pc.ink) }
                        }
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 16).fill(Pc.goldBg))
                        .padding(16)
                    }
                    let list = tab == "all" ? d.entries : d.monthly
                    if list.isEmpty {
                        EmptyState(symbol: "trophy", title: tab == "all" ? "No one on the board yet" : "No trips booked this month yet",
                                   message: "Book trips and write reviews to earn points.")
                    }
                    ForEach(list, id: \.user.id) { e in row(e, monthly: tab == "month", me: e.user.id == session.user?.id) }
                } else if failed {
                    EmptyState(symbol: "wifi.slash", title: "Couldn't load the leaderboard", message: "Check your connection and try again.")
                } else {
                    VStack(spacing: 12) { ForEach(0..<8, id: \.self) { _ in SkeletonBlock(height: 52) } }.padding(16)
                }
            }
        }
        .refreshable { await load() }
        .pcScreen()
        .pcNavigationBar("Leaderboard")
        .task {
            // Last copy at once, then the fresh one.
            if data == nil { data = app.store.entry(LeaderboardResponse.self, "leaderboard") }
            await load()
        }
    }

    private func load() async {
        refreshing = true
        if let r = try? await app.api.leaderboard() {
            data = r
            app.store.setEntry("leaderboard", r)
        } else { failed = true }
        refreshing = false
    }

    private func row(_ e: LeaderEntry, monthly: Bool, me: Bool) -> some View {
        Button { if !e.user.username.isEmpty { router.push(.profile(username: e.user.username)) } } label: {
            HStack(spacing: 10) {
                Text(e.rank == 1 ? "🥇" : e.rank == 2 ? "🥈" : e.rank == 3 ? "🥉" : "#\(e.rank.map(String.init) ?? "–")")
                    .pcFont(.num).foregroundStyle(Pc.ink).frame(width: 44, alignment: .leading)
                Avatar(user: e.user, size: 38)
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.user.name).pcFont(.bodyStrong, weight: .bold).foregroundStyle(Pc.ink).lineLimit(1)
                    Text(["\(e.trips ?? 0) trips", "\(e.states ?? 0) places", "\(e.reviews ?? 0) reviews", e.location].compactMap { $0 }.joined(separator: " · "))
                        .pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                }
                Spacer()
                Text(monthly ? "\(e.monthlyTrips ?? 0) trips" : "\(e.points ?? 0) pts").pcFont(.num).foregroundStyle(Pc.ink)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(me ? Pc.goldBg : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Followers / following

struct PeopleListView: View {
    let username: String
    let kind: String
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var list: [UserLite]?
    @State private var refreshing = true

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if refreshing && list != nil { ProgressView().progressViewStyle(.linear).tint(Pc.gold) }
                if let list {
                    if list.isEmpty {
                        EmptyState(symbol: "person.2", title: kind == "followers" ? "No followers yet" : "Not following anyone yet")
                    }
                    ForEach(list) { u in
                        Button { if !u.username.isEmpty { router.push(.profile(username: u.username)) } } label: { PersonRow(user: u) }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 16)
                    }
                } else {
                    VStack(spacing: 12) { ForEach(0..<6, id: \.self) { _ in SkeletonBlock(height: 48) } }.padding(16)
                }
            }
        }
        .pcScreen()
        .pcNavigationBar(kind == "followers" ? "Followers" : "Following")
        .task {
            if list == nil { list = app.profiles.people(username, kind: kind) }
            let fresh = await app.profiles.refreshPeople(username, kind: kind)
            list = fresh ?? list ?? []
            refreshing = false
        }
    }
}

// MARK: - Edit profile

/// Everything the web's Edit profile has: photo, name, username (once every 40 days), bio, status,
/// location, Instagram, website, birthday, and what others can see. Save stays off until something
/// changes; leaving with changes asks first.
struct EditProfileView: View {
    @Environment(AppModel.self) private var app
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var loaded = false
    @State private var name = ""
    @State private var username = ""
    @State private var bio = ""
    @State private var status = ""
    @State private var statusFollowers = false
    @State private var location = ""
    @State private var instagram = ""
    @State private var website = ""
    @State private var dob: Date?
    @State private var tripsPrivate = false
    @State private var statesPrivate = false
    @State private var phonePublic = false
    @State private var avatarUrl: String?
    @State private var emergencyName = ""
    @State private var emergencyPhone = ""
    @State private var photo: PhotosPickerItem?
    @State private var uploading = false
    @State private var saving = false
    @State private var error: (field: String?, message: String)?
    @State private var confirmLeave = false
    @State private var pickDate = false

    private var u: MeUser? { session.me?.user }

    private var patch: ProfilePatch {
        guard let u else { return ProfilePatch() }
        func changed(_ v: String, _ old: String?) -> String? { let t = v.trimmingCharacters(in: .whitespacesAndNewlines); return t == (old ?? "") ? nil : t }
        let dobText = dob.map(Fmt.ymd)
        return ProfilePatch(
            name: changed(name, u.name), username: changed(username, u.username), bio: changed(bio, u.bio),
            statusText: changed(status, u.statusText),
            statusVisibility: (statusFollowers ? "followers" : "public") == (u.statusVisibility ?? "public") ? nil : (statusFollowers ? "followers" : "public"),
            location: changed(location, u.location), instagram: changed(instagram, u.instagram), website: changed(website, u.website),
            avatarUrl: avatarUrl == u.avatarUrl ? nil : avatarUrl,
            dateOfBirth: dobText != nil && dobText != u.dateOfBirth ? dobText : nil,
            tripsPrivate: tripsPrivate == (u.tripsPrivate ?? false) ? nil : tripsPrivate,
            statesPrivate: statesPrivate == (u.statesPrivate ?? false) ? nil : statesPrivate,
            phonePublic: phonePublic == (u.phonePublic ?? false) ? nil : phonePublic,
            emergencyName: changed(emergencyName, u.emergencyName), emergencyPhone: changed(emergencyPhone, u.emergencyPhone))
    }
    private var dirty: Bool { loaded && !patch.isEmpty }

    var body: some View {
        Group {
            if let u {
                form(u)
            } else {
                EmptyState(symbol: "person.crop.circle", title: "Sign in to edit your profile", message: "Your photo, name, bio and links live on your UnSOLO account.")
            }
        }
        .pcScreen()
        .pcNavigationBar("Edit profile")
        .navigationBarBackButtonHidden(dirty)
        .toolbar {
            if dirty {
                ToolbarItem(placement: .topBarLeading) {
                    Button { confirmLeave = true } label: { Image(systemName: "chevron.left").font(.system(size: 16, weight: .semibold)) }
                        .accessibilityLabel("Back")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(saving ? "Saving…" : "Save") { save() }.buttonStyle(.pc(.accent, compact: true)).disabled(!dirty || uploading || saving)
            }
        }
        .confirmationDialog("Discard changes?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Discard", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: { Text("Your edits haven't been saved.") }
        .onAppear(perform: fill)
        .onChange(of: photo) { _, item in if let item { uploadPhoto(item) } }
    }

    private func fill() {
        guard !loaded, let u else { return }
        name = u.name; username = u.username; bio = u.bio ?? ""; status = u.statusText ?? ""
        statusFollowers = u.statusVisibility == "followers"; location = u.location ?? ""; instagram = u.instagram ?? ""
        website = u.website ?? ""; dob = Fmt.day(u.dateOfBirth); tripsPrivate = u.tripsPrivate ?? false
        statesPrivate = u.statesPrivate ?? false; phonePublic = u.phonePublic ?? false; avatarUrl = u.avatarUrl
        emergencyName = u.emergencyName ?? ""; emergencyPhone = u.emergencyPhone ?? ""
        loaded = true
    }

    private func form(_ u: MeUser) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                let preview = UserLite(id: u.id, username: u.username, name: name.isEmpty ? u.name : name, avatarUrl: avatarUrl,
                                       isPhoneVerified: u.isPhoneVerified, isIdVerified: u.isIdVerified, isHost: u.isHost)
                let busy = uploading
                VStack(spacing: 8) {
                    PhotosPicker(selection: $photo, matching: .images, photoLibrary: .shared()) {
                        ZStack(alignment: .bottomTrailing) {
                            Avatar(user: preview, size: 96)
                                .overlay { if busy { Circle().fill(.black.opacity(0.4)); ProgressView().tint(.white) } }
                            Image(systemName: "camera.fill").font(.system(size: 13)).foregroundStyle(Pc.onInk)
                                .frame(width: 30, height: 30).background(Circle().fill(Pc.ink)).background(Circle().fill(Pc.paper).padding(-2))
                        }
                    }
                    .accessibilityLabel("Change photo")
                    Text(uploading ? "Uploading…" : "Change photo").pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink2)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                if let e = error, e.field == nil {
                    Text(e.message).pcFont(.small).foregroundStyle(Pc.red).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Pc.red.opacity(0.08))).padding(.horizontal, 16)
                }
                group("About you") {
                    field("Name", key: "name") { input("Your name", $name, limit: 80) }
                    field("Username", key: "username", help: u.usernameChangeAfter.map { "You can change it again on \(Fmt.longDate($0))." }
                          ?? "Letters, numbers and _. You can change it once every 40 days.") {
                        input("username", $username, limit: 30, icon: "at")
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .onChange(of: username) { _, v in
                                let f = String(v.filter { $0.isLetter || $0.isNumber || $0 == "_" }.prefix(30))
                                if f != v { username = f }
                            }
                            .disabled(u.usernameChangeAfter != nil)
                    }
                    field("Bio", key: "bio", help: "\(bio.count)/500") {
                        TextField("Where you've been, where you're headed, what you're like on a trip", text: $bio, axis: .vertical)
                            .lineLimit(3...8).padding(.horizontal, 14).padding(.vertical, 12).pcField()
                            .onChange(of: bio) { _, v in if v.count > 500 { bio = String(v.prefix(500)) } }
                    }
                    field("Status", key: "statusText", help: "Shows under your name for everyone, or just your followers.") {
                        input("Off to Spiti next week", $status, limit: 140)
                        PcSegmented(items: [(false, "Everyone"), (true, "Followers")], selection: $statusFollowers).padding(.top, 8)
                    }
                }
                group("Details") {
                    field("Location", key: "location") { input("City, state", $location, limit: 80, icon: "mappin") }
                    field("Instagram", key: "instagram", help: "Just the username, no link needed.") {
                        input("yourhandle", $instagram, limit: 60).textInputAutocapitalization(.never).autocorrectionDisabled()
                    }
                    field("Website", key: "website") {
                        input("https://…", $website, limit: 200).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    }
                    field("Date of birth", key: "dateOfBirth", help: "Not shown on your profile. Used for age-matched plans.") {
                        Button { pickDate.toggle() } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "calendar").foregroundStyle(Pc.ink2)
                                Text(dob.map { Fmt.longDate(Fmt.ymd($0)) } ?? "Add your birthday").pcFont(.body).foregroundStyle(dob == nil ? Pc.ink3 : Pc.ink)
                                Spacer()
                            }
                            .padding(.horizontal, 14).padding(.vertical, 14).pcField()
                        }
                        .buttonStyle(.plain)
                        if pickDate {
                            DatePicker("Date of birth", selection: Binding(get: { dob ?? Calendar.current.date(byAdding: .year, value: -25, to: Date())! }, set: { dob = $0 }),
                                       in: Calendar.current.date(byAdding: .year, value: -100, to: Date())!...Calendar.current.date(byAdding: .year, value: -18, to: Date())!,
                                       displayedComponents: .date)
                                .datePickerStyle(.graphical).tint(Pc.ink)
                        }
                    }
                }
                group("Emergency contact") {
                    Text("Told by SMS if you raise an SOS on a trip. Never shown on your profile.").pcFont(.small).foregroundStyle(Pc.ink2)
                    field("Name", key: "emergencyName") { input("Who should we tell?", $emergencyName, limit: 80) }
                    field("Phone", key: "emergencyPhone", help: "A 10-digit Indian mobile number.") {
                        input("98765 43210", $emergencyPhone, limit: 14, icon: "phone").keyboardType(.phonePad)
                    }
                }
                group("What others see") {
                    PcToggleRow(title: "Hide my trips", subtitle: "Your travel log stays off your profile.", isOn: $tripsPrivate)
                    PcToggleRow(title: "Hide states explored", subtitle: "The India map on your profile is hidden.", isOn: $statesPrivate)
                    if !(u.phone ?? "").isEmpty {
                        PcToggleRow(title: "Show my phone number", subtitle: "Off: people ask and you approve each one.", isOn: $phonePublic)
                    }
                }
                Color.clear.frame(height: 32)
            }
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func group<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Overline(text: title, color: Pc.ink3)
            content()
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
    }

    private func field<C: View>(_ label: String, key: String, help: String? = nil, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).pcFont(.small, weight: .semibold).foregroundStyle(Pc.ink)
            content()
            if let e = error, e.field == key { Text(e.message).pcFont(.small).foregroundStyle(Pc.red) }
            else if let help { Text(help).pcFont(.small).foregroundStyle(Pc.ink3) }
        }
    }

    private func input(_ placeholder: String, _ text: Binding<String>, limit: Int, icon: String? = nil) -> some View {
        HStack(spacing: 8) {
            if let icon { Image(systemName: icon).foregroundStyle(Pc.ink2) }
            TextField(placeholder, text: text)
                .onChange(of: text.wrappedValue) { _, v in if v.count > limit { text.wrappedValue = String(v.prefix(limit)) } }
        }
        .padding(.horizontal, 14).padding(.vertical, 12).pcField()
    }

    private func uploadPhoto(_ item: PhotosPickerItem) {
        uploading = true
        Task {
            defer { uploading = false; photo = nil }
            guard let raw = try? await item.loadTransferable(type: Data.self),
                  let jpeg = await Task.detached(priority: .userInitiated, operation: { try? ImageCompressor.compress(raw).data }).value else {
                app.showToast("Couldn't read that photo. Try another.")
                return
            }
            do { avatarUrl = try await app.api.upload(jpeg: jpeg, purpose: "avatar") { _ in }.url }
            catch APIError.offline { app.showToast("You're offline.") }
            catch { app.showToast(error.localizedDescription) }
        }
    }

    private func save() {
        if name.trimmingCharacters(in: .whitespaces).isEmpty { error = ("name", "Add your name"); return }
        saving = true
        error = nil
        Task {
            if let e = await session.saveProfileDetailed(patch) {
                error = e
            } else {
                Haptics.success()
                app.showToast("Profile saved")
                if let u = session.user?.username { await app.profiles.refresh(u) }
                dismiss()
            }
            saving = false
        }
    }
}

// MARK: - Invite friends

/// Your invite code and link (copy, WhatsApp, share), credits earned, and who joined with it.
struct ReferralsView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.openURL) private var openURL
    @State private var data: ReferralsResponse?
    @State private var failed = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let d = data { content(d) }
                else if failed {
                    EmptyState(symbol: "wifi.slash", title: "Couldn't load your invites", message: "Check your connection and try again.")
                    Button("Try again") { Task { await load() } }.buttonStyle(.pc(.outline, fullWidth: true)).padding(.horizontal, 16)
                } else {
                    VStack(spacing: 12) { SkeletonBlock(height: 150); SkeletonBlock(height: 70); SkeletonBlock(height: 70) }.padding(16)
                }
            }
        }
        .pcScreen()
        .pcNavigationBar("Invite friends")
        .task { await load() }
    }

    private func load() async {
        failed = false
        do { data = try await app.api.referrals() } catch { failed = true }
    }

    @ViewBuilder private func content(_ d: ReferralsResponse) -> some View {
        let message = d.link.map { "Join me on UnSOLO, India's solo travel community. Sign up with my code \(d.code ?? "") and get ₹200 off your first trip: \($0)" }
        VStack(spacing: 14) {
            Text("Give ₹200, get ₹200").pcFont(.title1).foregroundStyle(Pc.ink)
            Text("Friends get ₹200 off their first trip. You get ₹200 in credits when they travel.").pcFont(.small).foregroundStyle(Pc.ink2).multilineTextAlignment(.center)
            if let code = d.code {
                Button {
                    UIPasteboard.general.string = code
                    Haptics.success()
                    app.showToast("Code copied")
                } label: {
                    HStack(spacing: 10) {
                        Text(code).font(PcFont.rounded(24)).tracking(3).foregroundStyle(Pc.ink)
                        Text("Copy").pcFont(.small, weight: .bold).foregroundStyle(Pc.goldInk)
                    }
                    .padding(.horizontal, 18).padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Pc.paper))
                }
                .buttonStyle(.pcPress)
                .accessibilityLabel("Copy code \(code)")
                HStack(spacing: 10) {
                    Button {
                        let t = (message ?? "").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
                        if let url = URL(string: "https://wa.me/?text=\(t)") { openURL(url) }
                    } label: { Label("WhatsApp", systemImage: "message") }
                        .buttonStyle(.pc(.primary, fullWidth: true, compact: true))
                    if let message {
                        ShareLink(item: message) { Label("Share link", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.pc(.outline, fullWidth: true, compact: true))
                    }
                }
            } else {
                Text("Your code is on its way. Check back in a bit.").pcFont(.body).foregroundStyle(Pc.ink2)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 20).fill(Pc.goldBg))
        .padding(16)
        HStack(spacing: 10) {
            tile(Fmt.rupees(d.creditsPaise ?? 0), "Credits")
            tile("\(d.total ?? 0)", "Joined")
            tile("\(d.credited ?? 0)", "Travelled")
        }
        .padding(.horizontal, 16)
        SectionHeader(title: "People you invited").padding(.horizontal, 16).padding(.top, 8)
        if d.people.isEmpty {
            Text("No one yet. Your first invite is one message away.").pcFont(.body).foregroundStyle(Pc.ink2).padding(.horizontal, 16)
        }
        ForEach(Array(d.people.enumerated()), id: \.offset) { _, p in
            Button { if let u = p.username, !u.isEmpty { router.push(.profile(username: u)) } } label: {
                HStack(spacing: 12) {
                    Avatar(user: UserLite(id: p.username ?? UUID().uuidString, username: p.username ?? "", name: p.name ?? "", avatarUrl: p.avatarUrl,
                                          isPhoneVerified: false, isIdVerified: false, isHost: false), size: 40)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(p.name ?? "").pcFont(.bodyStrong).foregroundStyle(Pc.ink).lineLimit(1)
                        Text("@\(p.username ?? "")").pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                    Spacer()
                    PcTag(text: p.status == "credited" ? "Travelled" : "Joined", style: p.status == "credited" ? .host : .neutral)
                }
                .padding(.horizontal, 16).padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func tile(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(PcFont.rounded(20)).foregroundStyle(Pc.ink)
            Text(label).pcFont(.label).foregroundStyle(Pc.ink2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: 16).fill(Pc.raised))
    }
}

// MARK: - Offers

/// Live deals (same as unsolo.in/offers): promo codes to copy and combos that open the listings in the app.
struct OffersView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @State private var data: OffersResponse?
    @State private var failed = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                if let d = data {
                    let empty = d.sections.allSatisfy { $0.offers.isEmpty && $0.combos.isEmpty }
                    if d.sections.isEmpty || empty {
                        EmptyState(symbol: "bolt", title: "No live offers right now", message: "New deals show up here. Check back soon.")
                        Button("Explore trips") { router.select(.explore) }.buttonStyle(.pc(.outline, fullWidth: true)).padding(.horizontal, 16)
                    }
                    ForEach(d.sections.filter { !$0.offers.isEmpty || !$0.combos.isEmpty }) { s in section(s) }
                } else if failed {
                    EmptyState(symbol: "wifi.slash", title: "Couldn't load offers", message: "Check your connection and try again.")
                    Button("Try again") { Task { await load() } }.buttonStyle(.pc(.outline, fullWidth: true)).padding(.horizontal, 16)
                } else {
                    VStack(spacing: 12) { ForEach(0..<3, id: \.self) { _ in SkeletonBlock(height: 96) } }.padding(16)
                }
            }
            .padding(.bottom, 32)
        }
        .refreshable { await load() }
        .pcScreen()
        .pcNavigationBar("Offers")
        .task { await load() }
    }

    private func load() async {
        failed = false
        do { data = try await app.api.offers() } catch { if data == nil { failed = true } }
    }

    @ViewBuilder private func section(_ s: OfferSection) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if let b = s.badge { Overline(text: b, color: Pc.goldInk) }
            Text(s.title ?? "").pcFont(.title2).foregroundStyle(Pc.ink)
            if let sub = s.subtitle { Text(sub).pcFont(.small).foregroundStyle(Pc.ink2) }
        }
        .padding(.horizontal, 16).padding(.top, 14)
        ForEach(Array(s.offers.enumerated()), id: \.offset) { _, o in
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(o.label ?? "").pcFont(.bodyStrong, weight: .bold).foregroundStyle(Pc.ink)
                    Text(o.name ?? "").pcFont(.small).foregroundStyle(Pc.ink2)
                    if let v = o.validUntil { Text("Till \(Fmt.longDate(String(v.prefix(10))))").pcFont(.label).foregroundStyle(Pc.ink3) }
                }
                Spacer()
                if let code = o.promoCode {
                    Button {
                        UIPasteboard.general.string = code
                        Haptics.success()
                        app.showToast("\(code) copied. Use it at checkout.")
                    } label: {
                        VStack(spacing: 1) {
                            Text(code).pcFont(.num).foregroundStyle(Pc.ink)
                            Text("Tap to copy").font(.system(size: 10, weight: .semibold)).foregroundStyle(Pc.goldInk)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Pc.goldBg))
                    }
                    .buttonStyle(.pcPress)
                    .accessibilityLabel("Copy code \(code)")
                }
            }
            .padding(14)
            .pcPencilled()
            .padding(.horizontal, 16)
        }
        ForEach(Array(s.combos.enumerated()), id: \.offset) { _, c in
            VStack(alignment: .leading, spacing: 6) {
                Text(c.title ?? "").pcFont(.bodyStrong, weight: .bold).foregroundStyle(Pc.ink)
                if let sub = c.subtitle { Text(sub).pcFont(.small).foregroundStyle(Pc.ink2) }
                ForEach([c.primary, c.secondary].compactMap { $0 }.filter { !($0.path ?? "").isEmpty }, id: \.path) { l in
                    Button { openPath(l.path ?? "") } label: {
                        HStack {
                            Text(l.label ?? "Open").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                            Spacer()
                            Image(systemName: "arrow.right").foregroundStyle(Pc.ink2)
                        }
                        .padding(.vertical, 8)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(14)
            .pcPencilled()
            .padding(.horizontal, 16)
        }
    }

    /// Same-site paths open natively when the app knows them, else in Safari.
    private func openPath(_ path: String) {
        if let link = DeepLink.notificationRoute(path) { router.open(link) }
        else if DeepLink.isSameSitePath(path), let url = URL(string: path, relativeTo: AppInfo.webBaseURL) { router.safari = SafariItem(url: url.absoluteURL) }
    }
}
