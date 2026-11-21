import SwiftUI

/// Explore's single Tribe bridge: "Plans looking for people". Leads with an invite card to post a plan,
/// followed by open community plans (from the Tribe plan feed and suggestions).
struct PlansLookingRow: View {
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router
    @Environment(SessionStore.self) private var session

    private var plans: [Post] {
        var seen = Set<String>()
        let fromFeed = app.tribe.items(for: "plan").compactMap { item -> Post? in
            if case .post(let p) = item { return p } else { return nil }
        }
        let fromSuggestions = app.explore.suggestions.compactMap(\.post).map { app.tribe.posts[$0.id] ?? $0 }
        return (fromFeed + fromSuggestions).filter { p in
            p.kind == .plan && !p.isLocal && p.status == .live && p.openSpots > 0 && p.viewer?.isAuthor != true
                && seen.insert(p.id).inserted
        }
    }

    var body: some View {
        let list = plans
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Plans looking for people").padding(.horizontal, 18)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 12) {
                    PlanInviteCard(planning: list.count, faces: Array(list.map(\.author).prefix(3)))
                    ForEach(list) { p in
                        Button { router.push(.post(id: p.id)) } label: { ExplorePlanCard(post: p) }
                            .buttonStyle(.pcPress)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}

/// "Going somewhere? Post a plan." The whole card opens the plan composer; the
/// "N planning in Tribe →" line is its own tap target to the Tribe tab. Dashed border, press scale, no other motion.
struct PlanInviteCard: View {
    let planning: Int
    let faces: [UserLite]
    @Environment(AppModel.self) private var app
    @Environment(Router.self) private var router

    private func compose() { app.requireVerified("Sign in to post a plan") { router.openCompose(.plan) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: compose) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "plus").font(.system(size: 16.5, weight: .heavy)).foregroundStyle(Pc.raised)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(Pc.ink))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Going somewhere? Post a plan.").font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(Pc.ink)
                            .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        Text("Travellers heading your way ask to join. No booking, no money.")
                            .font(.system(size: 12)).foregroundStyle(Pc.ink2).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.pcPress)
            .accessibilityLabel("Post a plan. Travellers heading your way ask to join. No booking, no money.")
            Button { router.select(.tribe) } label: {
                HStack(spacing: 6) {
                    if !faces.isEmpty { FaceStack(users: Array(faces.prefix(3)), size: 19) }
                    Text("\(planning) planning in Tribe →").font(.system(size: 12.5, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(1)
                }
                .frame(minHeight: PcTokens.touch)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pcPress)
            .padding(.leading, 50)
            .accessibilityLabel("\(planning) plans in the Tribe")
        }
        .padding(14)
        .frame(width: 280, alignment: .leading)
        .frame(minHeight: 140, alignment: .top)
        .pcPencilled()
        .contentShape(Pc.shape())
        .onTapGesture(perform: compose)
    }
}

/// Compact open-plan card for the Explore row: plan ring, title, dates, caption.
struct ExplorePlanCard: View {
    let post: Post
    var body: some View {
        let counts = SeatCounts(plan: post)
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                SeatRing(seats: RingSeats.plan(post), size: 60, plan: true, womenOnly: post.audience == .women, dots: .none, centre: .user(post.author))
                VStack(alignment: .leading, spacing: 4) {
                    if post.audience == .women { PcTag(text: "Women only", style: .women) }
                    Text(post.displayTitle).font(.system(size: 14, weight: .bold)).foregroundStyle(Pc.ink).lineLimit(2).multilineTextAlignment(.leading)
                    Text("\(Fmt.range(post.startsOn, post.endsOn)) · \(post.place?.name.components(separatedBy: ",").first ?? "")")
                        .pcFont(.small).foregroundStyle(Pc.ink2).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 6) {
                Avatar(user: post.author, size: 19)
                Text(post.author.firstName).font(.system(size: 12, weight: .semibold)).foregroundStyle(Pc.ink2).lineLimit(1)
                Spacer(minLength: 4)
                SeatCaption(counts: counts, noun: "spots", font: .system(size: 12.5, weight: .semibold))
            }
        }
        .padding(12)
        .frame(width: 240, alignment: .leading)
        .frame(minHeight: 140, alignment: .top)
        .pcPencilled()
        .accessibilityElement(children: .combine)
    }
}
