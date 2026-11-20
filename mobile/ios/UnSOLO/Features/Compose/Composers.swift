import PhotosUI
import SwiftUI

// MARK: - Post type sheet

/// "What are you sharing?": Plan, Story, Question, Poll as 2×2 tiles.
struct PostTypeSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader(title: "What are you sharing?", subtitle: "Everything goes to the Tribe.")
                .padding(.top, 26)
            if !app.flags.tribePostingEnabled {
                Text("Posting is paused for a little while. You can still browse and reply.").pcFont(.small).foregroundStyle(Pc.red)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                tile(.plan, icon: "person.3.fill", title: "Plan", subtitle: "Find people for a trip you're planning")
                tile(.story, icon: "camera.fill", title: "Story", subtitle: "Photos from a trip, stays on your profile")
                tile(.ask, icon: "questionmark.bubble.fill", title: "Question", subtitle: "Ask travellers and hosts")
                tile(.poll, icon: "chart.bar.fill", title: "Poll", subtitle: "Let the Tribe vote")
            }
            HStack(alignment: .top, spacing: 10) {
                PcTag(text: "Host", style: .host)
                Text("Selling a trip, stay or rental? List it in **Hosting**. Promotional posts are removed from the Tribe.")
                    .pcFont(.small).foregroundStyle(Pc.ink2).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 4)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .background(Pc.raised.ignoresSafeArea())
        .onAppear { Task { await app.analytics.track("screen.view", screen: "compose") } }
    }

    private func tile(_ kind: ComposeKind, icon: String, title: String, subtitle: String) -> some View {
        Button { router.openCompose(kind) } label: {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: icon).font(.system(size: 19, weight: .bold)).foregroundStyle(Pc.accentInk)
                    .frame(width: 42, height: 42)
                    .background(Pc.tonal, in: Pc.shape(14))
                Text(title).font(.system(size: 16, weight: .bold)).foregroundStyle(Pc.ink).padding(.top, 2)
                Text(subtitle).font(.system(size: 13)).foregroundStyle(Pc.ink2).multilineTextAlignment(.leading)
                    .lineLimit(2, reservesSpace: true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Pc.raised, in: Pc.shape(22))
            .overlay(Pc.shape(22).strokeBorder(Pc.rule, lineWidth: 1))
            .contentShape(Pc.shape(22))
        }
        .buttonStyle(.pcPress)
        .disabled(!app.flags.tribePostingEnabled)
        .accessibilityLabel("\(title): \(subtitle)")
    }
}

struct ComposerHost: View {
    let kind: ComposeKind
    var body: some View {
        switch kind {
        case .plan: PlanComposer()
        case .story: StoryComposer()
        case .ask: AskComposer(startsWithPoll: false)
        case .poll: AskComposer(startsWithPoll: true)
        }
    }
}

// MARK: - Shared composer chrome

/// Close (×) on the left, centred title, and **Publish in a bottom bar** that rides above the keyboard.
struct ComposerScaffold<Content: View, Leading: View>: View {
    let title: String
    let primary: String
    let canSubmit: Bool
    let onSubmit: () -> Void
    @ViewBuilder var leading: Leading
    @ViewBuilder var content: Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) { content }
                    .padding(.bottom, 20)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                BottomActionBar { leading } trailing: {
                    Button(primary, action: onSubmit).buttonStyle(.pcPrimary).disabled(!canSubmit)
                }
            }
            .pcScreen()
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Pc.paper, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark").fontWeight(.bold) }
                        .tint(Pc.ink)
                        .accessibilityLabel("Close")
                }
            }
        }
    }
}

struct PcTextField: View {
    let placeholder: String
    @Binding var text: String
    var style: PcTextStyle = .body
    var axis: Axis = .horizontal

    var body: some View {
        TextField(placeholder, text: $text, axis: axis)
            .pcFont(style)
            .foregroundStyle(Pc.ink)
            .lineLimit(axis == .vertical ? 3...10 : 1...1)
            .frame(minHeight: 28)
    }
}

/// PhotosPicker with local thumbnails. Raw data is handed to the upload pipeline on publish.
struct PhotosField: View {
    @Binding var photos: [Data]
    var max = 6
    var coverStyle = false
    @State private var items: [PhotosPickerItem] = []
    @State private var loading = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if coverStyle, let first = photos.first {
                HStack(spacing: 6) {
                    LocalThumb(data: first).frame(height: 170).overlay(alignment: .topLeading) {
                        PcTag(text: "Cover", style: .organiser).padding(8)
                    }
                    VStack(spacing: 6) {
                        if photos.count > 1 {
                            LocalThumb(data: photos[1]).overlay {
                                if photos.count > 2 { Text("+\(photos.count - 2) photos").pcFont(.bodyStrong).foregroundStyle(.white).shadow(radius: 2) }
                            }
                        }
                        picker
                    }
                    .frame(width: 140, height: 170)
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(photos.enumerated()), id: \.offset) { i, d in
                            LocalThumb(data: d).frame(width: 88, height: 88).overlay(alignment: .topTrailing) {
                                Button { photos.remove(at: i) } label: {
                                    Image(systemName: "xmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(.white)
                                        .frame(width: 24, height: 24).background(Circle().fill(PcTokens.light.scrim))
                                        .frame(width: 40, height: 40).contentShape(Rectangle())
                                }
                                .padding(4)
                                .accessibilityLabel("Remove photo \(i + 1)")
                            }
                        }
                        if photos.count < max { picker.frame(width: 88, height: 88) }
                    }
                }
            }
            if loading { ProgressView().tint(Pc.ink2) }
        }
        .onChange(of: items) { _, newItems in
            guard !newItems.isEmpty else { return }
            loading = true
            Task {
                for item in newItems {
                    if let data = try? await item.loadTransferable(type: Data.self), photos.count < max { photos.append(data) }
                }
                items = []
                loading = false
            }
        }
    }

    private var picker: some View {
        let title = photos.isEmpty ? "Add photos" : "Add"
        return PhotosPicker(selection: $items, maxSelectionCount: Swift.max(1, max - photos.count), matching: .images, photoLibrary: .shared()) {
            VStack(spacing: 4) {
                Image(systemName: "plus").font(.system(size: 17, weight: .bold))
                Text(title).font(.system(size: 13, weight: .bold))
            }
            .foregroundStyle(Pc.accentInk)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Pc.tonal, in: Pc.shape(Pc.imageRadius))
            .overlay(Pc.shape(Pc.imageRadius).strokeBorder(Pc.rule2, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Add photos")
    }
}

struct LocalThumb: View {
    let data: Data
    @State private var image: UIImage?
    var body: some View {
        ZStack {
            Rectangle().fill(Pc.rule)
            if let image { Image(uiImage: image).resizable().scaledToFill() }
        }
        .clipShape(Pc.shape(Pc.imageRadius))
        .task(id: data.count) {
            let d = data
            image = await Task.detached { ImagePipeline.downsample(data: d, maxPixel: 400).map(DecodedImage.init) }.value?.image
        }
    }
}

func moneyHint(_ text: String) -> Bool { DemoModeration.screen(text).prompts.contains("money") }

// MARK: - Plan composer

/// New plan: a live ring preview at the top (changes with "how many people", turns rose for women only),
/// then the fields; Publish sits in the bottom bar.
struct PlanComposer: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var place = ""
    @State private var start = Calendar.current.date(byAdding: .day, value: 14, to: Date()) ?? Date()
    @State private var end = Calendar.current.date(byAdding: .day, value: 16, to: Date()) ?? Date()
    @State private var spots = 5
    @State private var cost = ""
    @State private var womenOnly = false
    @State private var audience: Audience = .verified
    @State private var meeting = ""
    @State private var details = ""
    @State private var photos: [Data] = []

    private var finalAudience: Audience { womenOnly ? .women : audience }
    private var canSubmit: Bool {
        title.trimmingCharacters(in: .whitespaces).count >= 4 && !place.trimmingCharacters(in: .whitespaces).isEmpty &&
            details.trimmingCharacters(in: .whitespaces).count >= 10 && end >= start && womenOnlyAllowed
    }
    private var womenOnlyAllowed: Bool { !womenOnly || (session.me?.user.isIdVerified ?? false) }
    private var days: Int { max(1, (Calendar.current.dateComponents([.day], from: start, to: end).day ?? 0) + 1) }
    private var me: UserLite {
        session.user ?? UserLite(id: "me", username: "you", name: "You", avatarUrl: nil, isPhoneVerified: true, isIdVerified: false, isHost: false)
    }

    var body: some View {
        ComposerScaffold(title: "New plan", primary: "Publish", canSubmit: canSubmit, onSubmit: publish) {
            Text(finalAudience == .anyone ? "Visible to everyone" : "Visible to \(finalAudience.label.lowercased())").font(.system(size: 15, weight: .bold)).foregroundStyle(Pc.ink)
            Text("You can edit or cancel anytime").pcFont(.small).foregroundStyle(Pc.ink2)
        } content: {
            VStack(spacing: 6) {
                SeatRing(seats: [.taken(me)] + Array(repeating: .open, count: max(1, spots - 1)), size: 132, plan: true,
                         womenOnly: womenOnly, dots: .none, centre: .user(me),
                         accessibilityText: "Preview: you and \(spots - 1) open spots\(womenOnly ? ", women only" : "")")
                    .animation(.snappy(duration: PcTokens.motionStandard), value: spots)
                    .animation(.easeInOut(duration: PcTokens.motionStandard), value: womenOnly)
                (Text("Live preview · ").foregroundStyle(Pc.ink2) + Text("you + \(spots - 1) spot\(spots == 2 ? "" : "s")").fontWeight(.bold).foregroundStyle(womenOnly ? Pc.rose : Pc.ink))
                    .font(.system(size: 13, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 14)
            .padding(.bottom, 4)
            FormRow(label: "Title") { PcTextField(placeholder: "Spiti in mid-January, slow and cold", text: $title, style: .title3) }
            FormRow(label: "Where to?") {
                HStack { Image(systemName: "mappin").font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.accentInk); PcTextField(placeholder: "Spiti Valley", text: $place, style: .bodyStrong) }
            }
            FormRow(label: "When · \(days) day\(days == 1 ? "" : "s")") {
                HStack {
                    DatePicker("Starts", selection: $start, in: Date()..., displayedComponents: .date).labelsHidden()
                    Text("–").font(.system(size: 16, weight: .bold)).foregroundStyle(Pc.ink2)
                    DatePicker("Ends", selection: $end, in: start..., displayedComponents: .date).labelsHidden()
                    Spacer(minLength: 0)
                }
                .tint(Pc.accentInk)
            }
            FormRow(label: "People you're looking for") {
                HStack {
                    Text("\(spots - 1) more").font(.system(size: 16, weight: .bold)).foregroundStyle(Pc.ink)
                    Text("· \(spots) with you").pcFont(.small).foregroundStyle(Pc.ink2)
                    Spacer()
                    PcStepper(value: Binding(get: { spots - 1 }, set: { spots = $0 + 1 }), range: 1...11, label: "People you're looking for")
                }
            }
            FormRow(label: "Budget each", hint: moneyHint(cost) ? "Charging for this? List it as a hosted trip instead. Plans can't take payments." : "Split among yourselves. UnSOLO doesn't take payments for plans.") {
                PcTextField(placeholder: "~₹20,000", text: $cost, style: .bodyStrong)
            }
            VStack(alignment: .leading, spacing: 6) {
                PcToggleRow(title: "Women only", subtitle: "Only women can see and join · ID check", icon: "figure.stand.dress",
                            tint: Pc.rose, titleColor: Pc.rose, isOn: $womenOnly.animation())
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(womenOnly ? Pc.roseSoft : Pc.raised, in: Pc.shape(Pc.radius))
                    .overlay(Pc.shape(Pc.radius).strokeBorder(womenOnly ? Pc.rose.opacity(0.5) : Pc.rule, lineWidth: 1))
                if womenOnly && !womenOnlyAllowed {
                    Text("Women-only plans need you to be ID-verified first (Settings → Verification).").pcFont(.small).foregroundStyle(Pc.red).padding(.horizontal, 6)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 10)
            if !womenOnly {
                FormRow(label: "Who can join", hint: "Everyone needs to be 18+. Joining is always by request, with an intro.") {
                    FlowLayout(spacing: 8, lineSpacing: 0) {
                        ForEach([Audience.verified, .anyone], id: \.self) { a in
                            PcChip(text: a.label, selected: audience == a) { audience = a }
                        }
                    }
                }
            }
            FormRow(label: "About the plan") { PcTextField(placeholder: "How you'll get there, where you'll stay, who you're looking for", text: $details, axis: .vertical) }
            FormRow(label: "Meeting point", hint: "Stays hidden until you approve someone.") {
                PcTextField(placeholder: "Majnu ka Tilla, gate 2 · Thu 19:30", text: $meeting)
            }
            FormRow(label: "Photos (optional)") { PhotosField(photos: $photos) }
        }
    }

    private func publish() {
        let draft = ComposeDraft(kind: .plan, title: title.trimmingCharacters(in: .whitespaces), body: details.trimmingCharacters(in: .whitespacesAndNewlines),
                                 place: Place(name: place.trimmingCharacters(in: .whitespaces), slug: nil, lat: nil, lng: nil),
                                 startsOn: Fmt.ymd(start), endsOn: Fmt.ymd(end), spotsTotal: spots, audience: finalAudience,
                                 estCostText: cost.isEmpty ? nil : "Est. \(cost) each", meetingPoint: meeting.isEmpty ? nil : meeting, photos: photos)
        app.tribe.publish(draft)
        router.tab = .tribe
        router.popToRoot(.tribe)
        dismiss()
    }
}

// MARK: - Story composer

struct StoryComposer: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var photos: [Data] = []
    @State private var title = ""
    @State private var body_ = ""
    @State private var tripSlug: String?
    @State private var place = ""
    @State private var tagged: Set<String> = []
    @State private var showOnTripPage = true

    private var pastTrips: [TripLite] { app.trips.myTrips.past.map(\.trip) }
    private var trip: TripLite? { pastTrips.first { $0.slug == tripSlug } }
    private var canSubmit: Bool { title.trimmingCharacters(in: .whitespaces).count >= 4 && body_.trimmingCharacters(in: .whitespaces).count >= 10 }

    var body: some View {
        ComposerScaffold(title: "New story", primary: "Publish", canSubmit: canSubmit, onSubmit: publish) {
            Text("+20 points when you publish").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
            Text(tagged.isEmpty ? "Photos upload in the background" : "Tagged people are asked first").pcFont(.small).foregroundStyle(Pc.ink2)
        } content: {
            PhotosField(photos: $photos, coverStyle: true).padding(.horizontal, 20).padding(.top, 12)
            FormRow(label: "Title") { PcTextField(placeholder: "Rafting, Ganga aarti and 9 new friends", text: $title, style: .title3) }
            FormRow(label: "Which trip?", hint: "Picked from your past bookings. Not with UnSOLO? Tag a place instead.") {
                VStack(spacing: 8) {
                    ForEach(pastTrips) { t in
                        Button { tripSlug = tripSlug == t.slug ? nil : t.slug } label: {
                            HStack(spacing: 10) {
                                PcAsyncImage(media: t.image, targetSize: CGSize(width: 48, height: 48)).frame(width: 48, height: 48)
                                    .clipShape(Pc.shape(Pc.imageRadius))
                                VStack(alignment: .leading, spacing: 2) {
                                    Overline(text: "Hosted trip · you went")
                                    Text(t.title).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                                    Text(t.host?.name ?? "").pcFont(.small).foregroundStyle(Pc.ink2)
                                }
                                Spacer()
                                if tripSlug == t.slug { Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)) }
                            }
                            .padding(10)
                            .pcSelectable(tripSlug == t.slug)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(tripSlug == t.slug ? .isSelected : [])
                    }
                    if tripSlug == nil {
                        HStack { Image(systemName: "mappin"); PcTextField(placeholder: "Or tag a place", text: $place) }
                    }
                }
            }
            if let trip, !trip.goingFaces.isEmpty {
                FormRow(label: "Who went with you", hint: "\(tagged.count) asked. Faces show only for those who say yes; until then they're dashed.") {
                    FlowLayout(spacing: 6) {
                        ForEach(trip.goingFaces) { u in
                            Button {
                                if tagged.contains(u.id) { tagged.remove(u.id) } else { tagged.insert(u.id) }
                            } label: {
                                SeatCell(seat: Seat(state: tagged.contains(u.id) ? .requested : .open, user: u), size: 40)
                                    .overlay { if !tagged.contains(u.id) { Text(u.initials).pcFont(.code).foregroundStyle(Pc.ink2) } }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(u.name), \(tagged.contains(u.id) ? "tagged" : "not tagged")")
                        }
                    }
                }
            }
            FormRow(label: "Tell it") { PcTextField(placeholder: "Day 1 we were 10 strangers on a Volvo…", text: $body_, axis: .vertical) }
            if trip != nil {
                Toggle(isOn: $showOnTripPage) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Show on the trip page").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                        Text("Under “From people who went”").pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                }
                .tint(Pc.accentInk)
                .padding(16)
                .pcCard()
                .padding(.horizontal, 20)
                .padding(.top, 12)
            }
        }
        .onAppear {
            if tripSlug == nil { tripSlug = router.composerTripSlug ?? pastTrips.first?.slug }
            Task { await app.trips.refresh() }
        }
    }

    private func publish() {
        let tags = trip?.goingFaces.filter { tagged.contains($0.id) } ?? []
        let draft = ComposeDraft(kind: .story, title: title, body: body_,
                                 place: trip?.place ?? (place.isEmpty ? nil : Place(name: place, slug: nil, lat: nil, lng: nil)),
                                 tripPackageId: trip?.id, trip: trip, showOnTripPage: trip != nil ? showOnTripPage : nil, photos: photos, tagUsers: tags)
        app.tribe.publish(draft)
        router.tab = .tribe
        router.popToRoot(.tribe)
        dismiss()
    }
}

// MARK: - Ask composer (question / poll)

struct AskComposer: View {
    var startsWithPoll = false
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var question = ""
    @State private var place = ""
    @State private var details = ""
    @State private var hasPoll = false
    @State private var options = ["", ""]
    @FocusState private var focusedOption: Int?

    private var cleanOptions: [String] { options.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
    private var canSubmit: Bool {
        question.trimmingCharacters(in: .whitespaces).count >= 8 && (!hasPoll || (2...4).contains(cleanOptions.count))
    }

    var body: some View {
        ComposerScaffold(title: startsWithPoll ? "New poll" : "New question", primary: "Publish", canSubmit: canSubmit, onSubmit: publish) {
            Text(hasPoll ? "Open for 3 days" : "Most questions get a reply in ~3h").font(.system(size: 15, weight: .bold)).foregroundStyle(Pc.ink)
            Text(hasPoll ? "\(cleanOptions.count) of 2–4 options" : "Hosts answer with their HOST tag").pcFont(.small).foregroundStyle(Pc.ink2)
        } content: {
            FormRow(label: "Question") {
                PcTextField(placeholder: startsWithPoll ? "Pickup point for the 27 Nov Bir trip?" : "Kasol solo in early December: which stay is better for meeting people?",
                            text: $question, style: .title3, axis: .vertical)
            }
            if hasPoll {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(options.indices, id: \.self) { i in
                        HStack(spacing: 10) {
                            Text("\(i + 1)").font(.system(size: 13, weight: .heavy, design: .rounded)).foregroundStyle(Pc.accentInk)
                                .frame(width: 26, height: 26).background(Circle().fill(Pc.tonal))
                            TextField(i < 2 ? "Option \(i + 1)" : "Option \(i + 1) (optional)", text: $options[i])
                                .font(.system(size: 15, weight: .semibold))
                                .focused($focusedOption, equals: i)
                            if options.count > 2 {
                                Button { options.remove(at: i) } label: {
                                    Image(systemName: "minus.circle.fill").font(.system(size: 18)).foregroundStyle(Pc.ink3)
                                        .frame(width: 40, height: 40).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Remove option \(i + 1)")
                            }
                        }
                        .padding(.leading, 12)
                        .padding(.trailing, 4)
                        .frame(minHeight: 50)
                        .pcField(focused: focusedOption == i)
                    }
                    if options.count < 4 {
                        Button { options.append(""); focusedOption = options.count - 1 } label: {
                            Label("Add option", systemImage: "plus.circle.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.accentInk)
                                .frame(minHeight: PcTokens.touch)
                        }
                        .buttonStyle(.pcPress)
                        .padding(.leading, 6)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 10)
            }
            if !startsWithPoll {
                PcToggleRow(title: "Add a poll", subtitle: "2–4 options, open for 3 days", icon: "chart.bar.fill", isOn: $hasPoll.animation())
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .pcField()
                    .padding(.horizontal, 18)
                    .padding(.top, 10)
            }
            FormRow(label: "Place (optional)") {
                HStack { Image(systemName: "mappin").font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.accentInk); PcTextField(placeholder: "Kasol, Parvati Valley", text: $place, style: .bodyStrong) }
            }
            FormRow(label: "More detail (optional)") { PcTextField(placeholder: "Dates, budget, what you're after", text: $details, axis: .vertical) }
            Text("No links or prices in answers. Phone numbers are hidden automatically.").pcFont(.small).foregroundStyle(Pc.ink3)
                .padding(.horizontal, 24).padding(.vertical, 12)
        }
        .onAppear { if startsWithPoll { hasPoll = true } }
    }

    private func publish() {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        let draft = ComposeDraft(kind: .ask, title: q, body: details.isEmpty ? q : details,
                                 place: place.isEmpty ? nil : Place(name: place, slug: nil, lat: nil, lng: nil),
                                 poll: hasPoll ? cleanOptions : nil)
        app.tribe.publish(draft)
        router.tab = .tribe
        router.popToRoot(.tribe)
        dismiss()
    }
}

// MARK: - Held for review

/// Shown when the server holds a post ("Charging for this? List it as a hosted trip.") or rewrote it.
struct HeldPostSheet: View {
    let notice: ModerationNotice
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var text = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(notice.held ? "Charging for this?" : "We tidied your post").pcFont(.title1).foregroundStyle(Pc.ink).padding(.top, 24)
            if notice.prompts.contains("money") {
                Text("Your post mentions payments. Plans are split among yourselves and no money moves through the Tribe. If you're selling a trip, list it as a hosted trip. Until then, only you can see this post.")
                    .pcFont(.body).foregroundStyle(Pc.ink)
            }
            if notice.prompts.contains("contact_hidden") {
                Label("Phone numbers, UPI IDs and emails were replaced with “contact hidden”. Chat opens once people join.", systemImage: "eye.slash")
                    .pcFont(.small).foregroundStyle(Pc.ink)
            }
            if notice.prompts.contains("links_disabled") {
                Label("Outside links show as plain text.", systemImage: "link").pcFont(.small).foregroundStyle(Pc.ink)
            }
            if editing {
                TextEditor(text: $text).pcFont(.body).scrollContentBackground(.hidden).padding(8).frame(minHeight: 120).pcField(focused: true)
                Button("Save and re-check") {
                    app.tribe.editHeld(postId: notice.postId, body: text)
                    dismiss()
                }
                .buttonStyle(.pc(.primary, fullWidth: true))
            } else if notice.held {
                VStack(spacing: 8) {
                    Button("Edit post") {
                        text = app.tribe.post(notice.postId)?.body ?? ""
                        editing = true
                    }
                    .buttonStyle(.pc(.primary, fullWidth: true))
                    Button("It's not commercial") {
                        app.tribe.confirmNonCommercial(postId: notice.postId)
                        dismiss()
                    }
                    .buttonStyle(.pc(.outline, fullWidth: true))
                    Button("List it as a hosted trip") {
                        app.router.safari = SafariItem(url: AppInfo.webBaseURL.appendingPathComponent("host"))
                        dismiss()
                    }
                    .buttonStyle(.pcLink)
                }
            } else {
                Button("OK") { dismiss() }.buttonStyle(.pc(.primary, fullWidth: true))
            }
            Spacer()
        }
        .padding(.horizontal, 20)
        .pcScreen()
    }
}
