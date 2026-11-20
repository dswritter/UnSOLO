import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @State private var confirmSignOut = false
    @State private var locationDenied = false

    static let interestOptions = ["Treks", "Mountains", "Beaches", "Backpacking", "Hostels", "Food", "Photography", "Spiritual",
                                  "Wildlife", "Road trips", "Festivals", "Weekend getaways", "Snow", "Rafting"]
    static let genders: [(String?, String)] = [(nil, "Not set"), ("woman", "Woman"), ("man", "Man"), ("nonbinary", "Non-binary"), ("prefer_not", "Prefer not to say")]

    private var prefs: Preferences { session.preferences }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Settings").pcFont(.display).foregroundStyle(Pc.ink).padding(.horizontal, 20).padding(.top, 4)
                group("Start the app on") {
                    PcSegmented(items: LandingTab.allCases.map { ($0, $0.label) }, selection: Binding(
                        get: { prefs.landingTab },
                        set: { tab in
                            app.landing.landingTab = tab
                            session.updatePreferences(PreferencesPatch(landingTab: tab)) { $0.landingTab = tab }
                        }))
                    Text("Opens on this tab next time, without waiting for the network.").pcFont(.small).foregroundStyle(Pc.ink2)
                }
                group("Notifications") {
                    notifyToggle("Plans", "Join requests, approvals, host offers", \.plans)
                    notifyToggle("Replies", "Comments and answers on your posts", \.replies)
                    notifyToggle("Messages", "Trip chats, plan chats and DMs", \.messages)
                    notifyToggle("Trips", "Departures, payments, pickup times", \.trips)
                    notifyToggle("Tags", "When someone tags you in a story", \.tags)
                    notifyToggle("Offers and news", "Occasional deals from UnSOLO", \.marketing)
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Quiet hours").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                            Text("Messages and trip updates still come through").pcFont(.small).foregroundStyle(Pc.ink2)
                        }
                        Spacer()
                        DatePicker("From", selection: quietBinding(\.from), displayedComponents: .hourAndMinute).labelsHidden()
                        Text("–")
                        DatePicker("To", selection: quietBinding(\.to), displayedComponents: .hourAndMinute).labelsHidden()
                    }
                    .tint(Pc.pine)
                    #if DEBUG
                    Button("Send a test notification") {
                        PushManager.shared.requestPermissionIfNeeded { token in app.registerDevice(token) }
                        let id = DebugLaunch.ids?.posts["tosh"] ?? ""
                        PushManager.shared.scheduleLocalTest(title: "Kabir wants to join Tosh & Kalga weekend", body: "3 trips, verified · long-press to approve",
                                                             link: "/tribe/p/\(id)", category: .joinRequest,
                                                             extra: ["type": "tribe_join_request", "postId": id,
                                                                     "actorId": DebugLaunch.ids?.users?["kabir"] ?? ""])
                        app.showToast("Test notification in 3 s. Lock the screen or go home to see it.")
                    }
                    .buttonStyle(.pcLink)
                    #endif
                }
                group("Suggestions") {
                    Toggle(isOn: Binding(get: { prefs.suggestByLocation }, set: { setLocation($0) })) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Suggest things near me").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                            Text("Uses approximate location (rounded to ~1 km), only while you use the app.").pcFont(.small).foregroundStyle(Pc.ink2)
                        }
                    }
                    .tint(Pc.pine)
                    if locationDenied {
                        Text("Location is off for UnSOLO. Turn it on in the Settings app to use this.").pcFont(.small).foregroundStyle(Pc.red)
                    }
                }
                group("About you") {
                    HStack {
                        Text("Gender").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                        Spacer()
                        Picker("Gender", selection: Binding(get: { session.me?.user.gender }, set: { setGender($0) })) {
                            ForEach(Self.genders, id: \.1) { Text($0.1).tag($0.0) }
                        }
                        .tint(Pc.pine)
                    }
                    Text("Optional. Needed to join women-only plans. Never shown on your profile.").pcFont(.small).foregroundStyle(Pc.ink2)
                    Toggle(isOn: Binding(get: { prefs.suggestByGender }, set: { v in session.updatePreferences(PreferencesPatch(suggestByGender: v)) { $0.suggestByGender = v } })) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Suggest by gender").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                            Text("For example, show women-only plans first.").pcFont(.small).foregroundStyle(Pc.ink2)
                        }
                    }
                    .tint(Pc.pine)
                    .disabled(session.me?.user.gender == nil || session.me?.user.gender == "prefer_not")
                    Text("Interests").pcFont(.bodyStrong).foregroundStyle(Pc.ink).padding(.top, 6)
                    FlowLayout(spacing: 8) {
                        ForEach(Self.interestOptions, id: \.self) { i in
                            PcChip(text: i, selected: prefs.interests.contains(i)) { toggleInterest(i) }
                        }
                    }
                }
                group("Data") {
                    Toggle(isOn: Binding(get: { prefs.dataSaver }, set: { v in session.updatePreferences(PreferencesPatch(dataSaver: v)) { $0.dataSaver = v } })) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Data saver").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                            Text("Load low-resolution photos only").pcFont(.small).foregroundStyle(Pc.ink2)
                        }
                    }
                    .tint(Pc.pine)
                    Button("Clear image cache") { Task { await ImagePipeline.shared.clearAll(); app.showToast("Image cache cleared") } }
                        .buttonStyle(.pcLink)
                }
                group("Account") {
                    if session.isSignedIn, let me = session.me {
                        infoRow("Email", me.user.email ?? "—")
                        HStack {
                            infoRow("Phone", me.user.phone.map(maskPhone) ?? "Not added")
                            if !me.user.isPhoneVerified {
                                Button("Verify") { router.phoneSheet = true }.buttonStyle(.pc(.outline, compact: true))
                            } else {
                                PcTag(text: "Verified", style: .paid)
                            }
                        }
                        infoRow("ID verification", me.user.isIdVerified ? "Verified" : "Not yet · needed for women-only plans and groups of 5+")
                        Button("Sign out") { confirmSignOut = true }.buttonStyle(.pc(.outline, fullWidth: true)).padding(.top, 6)
                    } else {
                        Button("Sign in") { router.authSheet = true }.buttonStyle(.pc(.primary, fullWidth: true))
                    }
                }
                group("About") {
                    infoRow("Version", "\(AppInfo.version) (\(AppInfo.build))")
                    if app.isDemo { infoRow("Data", app.fellBackToDemo ? "Demo (server unreachable)" : "Demo mode") }
                    if app.pendingOutbox > 0 { infoRow("Waiting to send", "\(app.pendingOutbox)") }
                    Button("Privacy policy") { router.safari = SafariItem(url: AppInfo.webBaseURL.appendingPathComponent("privacy")) }.buttonStyle(.pcLink)
                    Button("Grievance officer and support") { router.safari = SafariItem(url: AppInfo.webBaseURL.appendingPathComponent("contact")) }.buttonStyle(.pcLink)
                }
                Color.clear.frame(height: 32)
            }
        }
        .pcScreen()
        .pcNavigationBar()
        .confirmationDialog("Sign out of UnSOLO?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await session.signOut(); router.popToRoot(router.tab) } }
        } message: { Text("This device stops getting notifications. Saved data for your account is removed.") }
    }

    private func group<C: View>(_ title: String, @ViewBuilder content: () -> C) -> some View {
        CardSection(title: title) { content() }
    }

    private func notifyToggle(_ title: String, _ subtitle: String, _ key: WritableKeyPath<NotifyChannel, Bool>) -> some View {
        Toggle(isOn: Binding(get: { prefs.notify.push[keyPath: key] }, set: { v in
            var notify = prefs.notify
            notify.push[keyPath: key] = v
            session.updatePreferences(PreferencesPatch(notify: notify)) { $0.notify = notify }
        })) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                Text(subtitle).pcFont(.small).foregroundStyle(Pc.ink2)
            }
        }
        .tint(Pc.pine)
    }

    private func quietBinding(_ key: WritableKeyPath<QuietHours, String>) -> Binding<Date> {
        Binding(get: {
            let hhmm = prefs.notify.quietHours?[keyPath: key] ?? (key == \QuietHours.from ? "22:00" : "07:00")
            let parts = hhmm.split(separator: ":").compactMap { Int($0) }
            return Fmt.calendar.date(bySettingHour: parts.first ?? 22, minute: parts.count > 1 ? parts[1] : 0, second: 0, of: Date()) ?? Date()
        }, set: { date in
            var notify = prefs.notify
            var q = notify.quietHours ?? QuietHours(from: "22:00", to: "07:00")
            q[keyPath: key] = Fmt.time(date)
            notify.quietHours = q
            session.updatePreferences(PreferencesPatch(notify: notify)) { $0.notify = notify }
        })
    }

    private func setLocation(_ on: Bool) {
        session.updatePreferences(PreferencesPatch(suggestByLocation: on)) { $0.suggestByLocation = on }
        guard on else { return }
        Task {
            let loc = await LocationService.shared.currentRounded()
            locationDenied = loc == nil && !LocationService.shared.isAuthorized
            if loc != nil { await app.explore.refreshSuggestions() }
        }
    }

    private func setGender(_ g: String?) {
        session.updateMe(PatchMeBody(gender: g ?? "prefer_not")) { $0.gender = g }
        if g == nil || g == "prefer_not" { session.updatePreferences(PreferencesPatch(suggestByGender: false)) { $0.suggestByGender = false } }
    }

    private func toggleInterest(_ i: String) {
        var list = prefs.interests
        if let idx = list.firstIndex(of: i) { list.remove(at: idx) } else { list.append(i) }
        session.updatePreferences(PreferencesPatch(interests: list)) { $0.interests = list }
    }

    private func infoRow(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).pcFont(.small).foregroundStyle(Pc.ink2)
            Text(value).pcFont(.body).foregroundStyle(Pc.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func maskPhone(_ p: String) -> String {
        guard p.count > 4 else { return p }
        return String(p.prefix(3)) + String(repeating: "•", count: max(0, p.count - 7)) + String(p.suffix(4))
    }
}

// MARK: - Landing preference prompt

struct LandingPromptSheet: View {
    let tab: LandingTab
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("You open \(tab.label) most").pcFont(.title1).foregroundStyle(Pc.ink).padding(.top, 24)
            Text("Start the app on \(tab.label)? You can change this any time in Settings.").pcFont(.body).foregroundStyle(Pc.ink2)
            Spacer(minLength: 0)
            Button("Start on \(tab.label)") { app.acceptLanding(tab) }.buttonStyle(.pc(.primary, fullWidth: true))
            Button("Keep \(app.landing.landingTab.label)") { app.dismissLanding() }.buttonStyle(.pc(.outline, fullWidth: true))
        }
        .padding(16)
        .pcScreen()
        .interactiveDismissDisabled(false)
        .onDisappear { if app.router.landingPrompt != nil { app.dismissLanding() } }
    }
}
