import PhotosUI
import SwiftUI

// MARK: - Post type sheet

struct PostTypeSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("What are you posting?").pcFont(.title1).foregroundStyle(Pc.ink).padding(.top, 24)
            if !app.flags.tribePostingEnabled {
                Text("Posting is paused for a little while. You can still browse and reply.").pcFont(.small).foregroundStyle(Pc.red)
            }
            option(.plan, icon: "person.2", title: "Plan a trip or meetup", subtitle: "People ask to join, and a group chat opens", dashed: true)
            option(.story, icon: "photo", title: "Share a story", subtitle: "Photos from a trip. Tag the trip and who went", dashed: false)
            option(.ask, icon: "questionmark.circle", title: "Ask the Tribe", subtitle: "A question, with an optional poll", dashed: false)
            HStack(alignment: .top, spacing: 10) {
                PcTag(text: "Host", style: .host)
                Text("Selling a trip, stay or rental? List it in **Hosting**. Tribe is for travellers, so promotional posts are removed.")
                    .pcFont(.small).foregroundStyle(Pc.ink)
            }
            .padding(12)
            .background(Pc.goldBg, in: Pc.shape(Pc.radius))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .pcScreen()
        .onAppear { Task { await app.analytics.track("screen.view", screen: "compose") } }
    }

    private func option(_ kind: ComposeKind, icon: String, title: String, subtitle: String, dashed: Bool) -> some View {
        Button { router.openCompose(kind) } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 18, weight: .medium)).foregroundStyle(Pc.ink)
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(dashed ? Color.clear : Pc.tonal))
                    .overlay { if dashed { Circle().strokeBorder(Pc.rule2, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])) } }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                    Text(subtitle).pcFont(.small).foregroundStyle(Pc.ink2).multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Pc.ink)
            }
            .padding(14)
            .frame(minHeight: 72)
            .pcCard()
        }
        .buttonStyle(.plain)
        .disabled(!app.flags.tribePostingEnabled)
    }
}

struct ComposerHost: View {
    let kind: ComposeKind
    var body: some View {
        switch kind {
        case .plan: PlanComposer()
        case .story: StoryComposer()
        case .ask: AskComposer()
        }
    }
}

// MARK: - Shared composer chrome

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
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.tint(Pc.ink) } }
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
                                    Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Pc.onInk)
                                        .frame(width: 22, height: 22).background(Circle().fill(Pc.ink))
                                }
                                .padding(4)
                                .accessibilityLabel("Remove photo \(i + 1)")
                            }
                        }
                        if photos.count < max { picker.frame(width: 88, height: 88) }
                    }
                }
            }
            if loading { ProgressView().tint(Pc.ink) }
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
                Image(systemName: "plus").font(.system(size: 16))
                Text(title).font(.footnote)
            }
            .foregroundStyle(Pc.ink2)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(Pc.shape(Pc.radius).strokeBorder(Pc.rule2, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
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

struct PlanComposer: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var place = ""
    @State private var start = Calendar.current.date(byAdding: .day, value: 14, to: Date()) ?? Date()
    @State private var end = Calendar.current.date(byAdding: .day, value: 16, to: Date()) ?? Date()
    @State private var spots = 4
    @State private var cost = ""
    @State private var audience: Audience = .verified
    @State private var meeting = ""
    @State private var details = ""
    @State private var photos: [Data] = []

    private var canSubmit: Bool {
        title.trimmingCharacters(in: .whitespaces).count >= 4 && !place.trimmingCharacters(in: .whitespaces).isEmpty &&
            details.trimmingCharacters(in: .whitespaces).count >= 10 && end >= start && womenOnlyAllowed
    }
    private var womenOnlyAllowed: Bool { audience != .women || (session.me?.user.isIdVerified ?? false) }

    var body: some View {
        ComposerScaffold(title: "New plan", primary: "Publish plan", canSubmit: canSubmit, onSubmit: publish) {
            Text(audience == .anyone ? "Visible to everyone" : "Visible to \(audience.label.lowercased())").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
            Text("You can edit or cancel anytime").pcFont(.small).foregroundStyle(Pc.ink2)
        } content: {
            FormRow(label: "Title") { PcTextField(placeholder: "Tosh & Kalga weekend", text: $title, style: .title3) }
            FormRow(label: "Where") {
                HStack { Image(systemName: "mappin").foregroundStyle(Pc.ink); PcTextField(placeholder: "Tosh, Parvati Valley", text: $place, style: .bodyStrong) }
            }
            FormRow(label: "When") {
                HStack {
                    Image(systemName: "calendar").foregroundStyle(Pc.ink)
                    DatePicker("Starts", selection: $start, in: Date()..., displayedComponents: .date).labelsHidden()
                    Text("–").pcFont(.num)
                    DatePicker("Ends", selection: $end, in: start..., displayedComponents: .date).labelsHidden()
                }
                .tint(Pc.ink)
            }
            FormRow(label: "Group size") {
                HStack {
                    Text("\(spots) people").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                    Text("including you").pcFont(.small).foregroundStyle(Pc.ink2)
                    Spacer()
                    Stepper("Group size", value: $spots, in: 2...12).labelsHidden()
                }
            }
            FormRow(label: "Rough cost each", hint: moneyHint(cost) ? "Charging for this? List it as a hosted trip instead. Plans can't take payments." : "Split among yourselves. UnSOLO doesn't take payments for plans.") {
                PcTextField(placeholder: "₹4,500, split among yourselves", text: $cost, style: .num)
            }
            FormRow(label: "Who can join", hint: audience == .women && !womenOnlyAllowed ? "Women-only plans need you to be ID-verified first (Settings → Verification)." : "Women-only plans need everyone verified, joiners too. 18+ only.") {
                FlowLayout {
                    ForEach([Audience.verified, .women, .anyone], id: \.self) { a in
                        PcChip(text: a.label, selected: audience == a) { audience = a }
                    }
                }
            }
            FormRow(label: "About the plan") { PcTextField(placeholder: "How you'll get there, where you'll stay, who you're looking for", text: $details, axis: .vertical) }
            FormRow(label: "Meeting point", hint: "Stays hidden until you approve someone.") {
                PcTextField(placeholder: "Majnu ka Tilla, gate 2 · Thu 19:30", text: $meeting)
            }
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("I approve each request").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                    Text("Joining is always by request, with an intro").pcFont(.small).foregroundStyle(Pc.ink2)
                }
                Spacer()
                Toggle("Approve each request", isOn: .constant(true)).labelsHidden().disabled(true).tint(Pc.ink)
            }
            .padding(16)
            .pcCard()
            .padding(.horizontal, 20)
            .padding(.top, 12)
            FormRow(label: "Photos (optional)") { PhotosField(photos: $photos) }
            VStack(alignment: .leading, spacing: 8) {
                Overline(text: "Preview in the feed")
                PlanCard(post: previewPost).allowsHitTesting(false)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 18)
        }
    }

    private var previewPost: Post {
        let me = session.user ?? UserLite(id: "me", username: "you", name: "You", avatarUrl: nil, isPhoneVerified: true, isIdVerified: false, isHost: false)
        var seats = [Seat(state: .you, user: me)]
        for _ in 1..<spots { seats.append(Seat(state: .open, user: nil)) }
        return Post(id: "preview", kind: .plan, author: me, title: title.isEmpty ? "Your plan title" : title, body: details.isEmpty ? "A line about the plan." : details,
                    place: Place(name: place.isEmpty ? "Somewhere" : place, slug: nil, lat: nil, lng: nil),
                    startsOn: Fmt.ymd(start), endsOn: Fmt.ymd(end), spotsTotal: spots, memberCount: 1, audience: audience,
                    estCostText: cost.isEmpty ? nil : "Est. \(cost) each", media: [], trip: nil, poll: nil, reactions: .zero, myReactions: [],
                    commentCount: 0, status: .live, seats: seats, createdAt: Date(), updatedAt: Date(),
                    viewer: Viewer(isAuthor: true, membership: .approved, saved: false, canJoin: false, joinBlockedReason: .ownPlan), meetingPoint: nil)
    }

    private func publish() {
        let draft = ComposeDraft(kind: .plan, title: title.trimmingCharacters(in: .whitespaces), body: details.trimmingCharacters(in: .whitespacesAndNewlines),
                                 place: Place(name: place.trimmingCharacters(in: .whitespaces), slug: nil, lat: nil, lng: nil),
                                 startsOn: Fmt.ymd(start), endsOn: Fmt.ymd(end), spotsTotal: spots, audience: audience,
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
                .tint(Pc.ink)
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

// MARK: - Ask composer

struct AskComposer: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var question = ""
    @State private var place = ""
    @State private var details = ""
    @State private var hasPoll = false
    @State private var options = ["", ""]

    private var cleanOptions: [String] { options.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
    private var canSubmit: Bool {
        question.trimmingCharacters(in: .whitespaces).count >= 8 && (!hasPoll || (2...4).contains(cleanOptions.count))
    }

    var body: some View {
        ComposerScaffold(title: "Ask the Tribe", primary: "Post", canSubmit: canSubmit, onSubmit: publish) {
            Text("Most asks get a reply in ~3h").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
            Text("The best answer is pinned to the top").pcFont(.small).foregroundStyle(Pc.ink2)
        } content: {
            FormRow(label: "Your question") { PcTextField(placeholder: "Kasol solo in early December: which stay is better for meeting people?", text: $question, style: .title2, axis: .vertical) }
            FormRow(label: "Place") { HStack { Image(systemName: "mappin"); PcTextField(placeholder: "Kasol, Parvati Valley", text: $place, style: .bodyStrong) } }
            FormRow(label: "More detail (optional)") { PcTextField(placeholder: "Dates, budget, what you're after", text: $details, axis: .vertical) }
            VStack(alignment: .leading, spacing: 10) {
                Toggle(isOn: $hasPoll.animation()) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Add a poll").pcFont(.bodyStrong).foregroundStyle(Pc.ink)
                        Text("2–4 options, open for 3 days").pcFont(.small).foregroundStyle(Pc.ink2)
                    }
                }
                .tint(Pc.ink)
                if hasPoll {
                    ForEach(options.indices, id: \.self) { i in
                        HStack(spacing: 12) {
                            Text("\(i + 1)").pcFont(.code, weight: .regular).foregroundStyle(Pc.ink2)
                            TextField("Option \(i + 1)", text: $options[i]).pcFont(.bodyStrong)
                            if options.count > 2 {
                                Button { options.remove(at: i) } label: { Image(systemName: "minus.circle") }.buttonStyle(.plain)
                                    .accessibilityLabel("Remove option \(i + 1)")
                            }
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: PcTokens.touch + 4)
                        .pcField(focused: !options[i].isEmpty)
                    }
                    if options.count < 4 {
                        Button { options.append("") } label: {
                            HStack { Image(systemName: "plus"); Text("Add option") }
                                .pcFont(.body).foregroundStyle(Pc.ink2)
                                .padding(.horizontal, 12)
                                .frame(maxWidth: .infinity, minHeight: PcTokens.touch, alignment: .leading)
                                .overlay(Pc.shape(Pc.radius).strokeBorder(Pc.rule2, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
            .pcCard()
            .padding(.horizontal, 20)
            .padding(.top, 12)
            Text("No links or prices in answers. Phone numbers are hidden automatically.").pcFont(.small).foregroundStyle(Pc.ink2)
                .padding(.horizontal, 24).padding(.vertical, 12)
        }
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
