import type { SupabaseClient } from '@supabase/supabase-js'
import { hasVerifiedEmail } from '@/lib/auth/phone-login'
import {
  PACKAGE_LITE,
  POST_SELECT,
  PROFILE_LITE,
  toMedia,
  toTripLite,
  toUserLite,
  type Comment,
  type Membership,
  type Post,
  type ReactionKind,
  type Seat,
  type TripLite,
  type UserLite,
} from './models'

type Row = Record<string, unknown>

export type Viewer = {
  id: string; gender: string | null; isIdVerified: boolean; isPhoneVerified: boolean
  /** A confirmed real email or a verified phone: enough to post, comment, vote and join plans. */
  isContactVerified: boolean
} | null

type ViewerUser = { id: string; email?: string | null; email_confirmed_at?: string | null }

export async function loadViewer(db: SupabaseClient, who: string | ViewerUser | null | undefined): Promise<Viewer> {
  if (!who) return null
  const userId = typeof who === 'string' ? who : who.id
  const emailOk = typeof who === 'string' ? false : hasVerifiedEmail(who)
  // Gender lives in profile_private (owner-only RLS): readable here because the viewer is the owner.
  const [{ data }, { data: priv }] = await Promise.all([
    db.from('profiles').select('id, is_id_verified, is_phone_verified, is_email_verified').eq('id', userId).maybeSingle(),
    db.from('profile_private').select('gender').eq('user_id', userId).maybeSingle(),
  ])
  const gender = (priv?.gender as string | null) ?? null
  if (!data) return { id: userId, gender, isIdVerified: false, isPhoneVerified: false, isContactVerified: emailOk }
  const phone = data.is_phone_verified === true
  return {
    id: userId,
    gender,
    isIdVerified: data.is_id_verified === true,
    isPhoneVerified: phone,
    isContactVerified: emailOk || phone || data.is_email_verified === true,
  }
}

/**
 * Loads full contract Posts for `ids` (order preserved) with a fixed number of queries:
 * posts+author+media, plan seats, trips, viewer reactions/saves/memberships, poll votes.
 */
export async function loadPosts(db: SupabaseClient, ids: string[], viewer: Viewer): Promise<Post[]> {
  if (ids.length === 0) return []
  const { data: rows, error } = await db.from('posts').select(POST_SELECT).in('id', ids)
  if (error) throw error
  const posts = (rows ?? []) as Row[]
  const planIds = posts.filter((p) => p.kind === 'plan').map((p) => String(p.id))
  const tripIds = [...new Set(posts.map((p) => p.trip_package_id).filter(Boolean) as string[])]
  const askIds = posts.filter((p) => p.kind === 'ask' && p.poll_options).map((p) => String(p.id))

  const [membersRes, tripsRes, myReactRes, mySavedRes, pollRes, privRes] = await Promise.all([
    planIds.length
      ? db
          .from('plan_members')
          .select(`post_id, user_id, role, state, created_at, profile:profiles!plan_members_user_id_fkey(${PROFILE_LITE})`)
          .in('post_id', planIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as Row[] }),
    tripIds.length ? db.from('packages').select(PACKAGE_LITE).in('id', tripIds) : Promise.resolve({ data: [] as Row[] }),
    viewer
      ? db.from('post_reactions').select('post_id, kind').eq('user_id', viewer.id).in('post_id', ids)
      : Promise.resolve({ data: [] as Row[] }),
    viewer
      ? db.from('saved_posts').select('post_id').eq('user_id', viewer.id).in('post_id', ids)
      : Promise.resolve({ data: [] as Row[] }),
    askIds.length
      ? db.from('post_comments').select('post_id, author_id, poll_choice').in('post_id', askIds).not('poll_choice', 'is', null).eq('status', 'live')
      : Promise.resolve({ data: [] as Row[] }),
    // Meeting points: RLS returns rows only for the organiser and approved members.
    viewer && planIds.length
      ? db.from('plan_private').select('post_id, meeting_point').in('post_id', planIds)
      : Promise.resolve({ data: [] as Row[] }),
  ])
  const meetingPoints = new Map(((privRes.data ?? []) as Row[]).map((r) => [String(r.post_id), (r.meeting_point as string | null) ?? null]))

  const membersByPost = new Map<string, Row[]>()
  for (const m of (membersRes.data ?? []) as Row[]) {
    const k = String(m.post_id)
    membersByPost.set(k, [...(membersByPost.get(k) ?? []), m])
  }
  const trips = new Map<string, TripLite>()
  for (const t of (tripsRes.data ?? []) as Row[]) trips.set(String(t.id), toTripLite(t))
  const myReactions = new Map<string, ReactionKind[]>()
  for (const r of (myReactRes.data ?? []) as Row[]) {
    const k = String(r.post_id)
    myReactions.set(k, [...(myReactions.get(k) ?? []), r.kind as ReactionKind])
  }
  const saved = new Set(((mySavedRes.data ?? []) as Row[]).map((r) => String(r.post_id)))
  const votes = new Map<string, Map<string, number>>()
  const myVote = new Map<string, string>()
  for (const v of (pollRes.data ?? []) as Row[]) {
    const k = String(v.post_id)
    const m = votes.get(k) ?? new Map<string, number>()
    m.set(String(v.poll_choice), (m.get(String(v.poll_choice)) ?? 0) + 1)
    votes.set(k, m)
    if (viewer && v.author_id === viewer.id) myVote.set(k, String(v.poll_choice))
  }

  const byId = new Map<string, Post>()
  for (const p of posts) {
    const id = String(p.id)
    const author = toUserLite(p.author as Row)
    const members = membersByPost.get(id) ?? []
    const isAuthor = viewer?.id === p.author_id
    const mine = viewer ? members.find((m) => m.user_id === viewer.id) : undefined
    const membership = (mine?.role === 'organiser' ? 'approved' : (mine?.state as Membership | undefined)) ?? null
    const seats = p.kind === 'plan' ? buildSeats(members, Number(p.spots_total ?? 0), viewer?.id ?? null) : []
    const rc = (p.reaction_counts as Row | null) ?? {}
    const pollOptions = Array.isArray(p.poll_options) ? (p.poll_options as Row[]) : null
    const memberCount = Number(p.member_count ?? 1)
    const spots = p.spots_total == null ? null : Number(p.spots_total)
    const { canJoin, reason } = joinability(p, viewer, membership, memberCount, spots)
    byId.set(id, {
      id,
      kind: p.kind as Post['kind'],
      author,
      title: (p.title as string | null) ?? null,
      body: String(p.body ?? ''),
      place: p.place_name
        ? { name: String(p.place_name), slug: (p.place_slug as string | null) ?? null, lat: (p.lat as number | null) ?? null, lng: (p.lng as number | null) ?? null }
        : null,
      startsOn: (p.starts_on as string | null) ?? null,
      endsOn: (p.ends_on as string | null) ?? null,
      spotsTotal: spots,
      memberCount,
      audience: (p.audience as Post['audience']) ?? 'anyone',
      estCostText: (p.est_cost_text as string | null) ?? null,
      media: ((p.media as Row[] | null) ?? [])
        .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
        .map(toMedia),
      trip: p.trip_package_id ? trips.get(String(p.trip_package_id)) ?? null : null,
      poll: pollOptions
        ? {
            options: pollOptions.map((o) => ({
              id: String(o.id),
              label: String(o.label),
              votes: votes.get(id)?.get(String(o.id)) ?? 0,
            })),
            myChoice: myVote.get(id) ?? null,
          }
        : null,
      reactions: {
        wantToGo: Number(rc.want_to_go ?? 0),
        helpful: Number(rc.helpful ?? 0),
        love: Number(rc.love ?? 0),
      },
      myReactions: myReactions.get(id) ?? [],
      commentCount: Number(p.comment_count ?? 0),
      status: p.status as Post['status'],
      seats,
      createdAt: String(p.created_at),
      updatedAt: String(p.updated_at),
      // The exact meeting point is only for the organiser and approved members (spec §4).
      meetingPoint: isAuthor || membership === 'approved' ? meetingPoints.get(id) ?? null : null,
      viewer: { isAuthor, membership, saved: saved.has(id), canJoin, joinBlockedReason: reason },
    })
  }
  return ids.map((id) => byId.get(id)).filter(Boolean) as Post[]
}

/** Organiser first, then approved members (you highlighted), your pending request, then open seats. */
export function buildSeats(members: Row[], spotsTotal: number, viewerId: string | null): Seat[] {
  const seats: Seat[] = []
  const organiser = members.find((m) => m.role === 'organiser')
  if (organiser) seats.push({ state: organiser.user_id === viewerId ? 'you' : 'organiser', user: toUserLite(organiser.profile as Row) })
  for (const m of members) {
    if (m.role === 'organiser' || m.state !== 'approved') continue
    seats.push({ state: m.user_id === viewerId ? 'you' : 'member', user: toUserLite(m.profile as Row) })
  }
  const mine = viewerId ? members.find((m) => m.user_id === viewerId && m.state === 'requested') : undefined
  if (mine && seats.length < spotsTotal) seats.push({ state: 'requested', user: toUserLite(mine.profile as Row) })
  while (seats.length < spotsTotal) seats.push({ state: 'open', user: null })
  return seats.slice(0, Math.max(spotsTotal, seats.length))
}

function joinability(
  p: Row,
  viewer: Viewer,
  membership: Membership,
  memberCount: number,
  spots: number | null,
): { canJoin: boolean; reason: Post['viewer']['joinBlockedReason'] } {
  if (p.kind !== 'plan') return { canJoin: false, reason: null }
  if (p.status !== 'live' || p.converted_package_id) return { canJoin: false, reason: 'closed' }
  if (viewer?.id === p.author_id) return { canJoin: false, reason: 'own_plan' }
  if (membership === 'approved' || membership === 'requested') return { canJoin: false, reason: null }
  if (membership === 'declined') return { canJoin: false, reason: 'closed' }
  if (spots != null && memberCount >= spots) return { canJoin: false, reason: 'full' }
  if (p.audience === 'women' && viewer && (viewer.gender !== 'woman' || !viewer.isIdVerified)) {
    return { canJoin: false, reason: 'women_only' }
  }
  if (p.audience === 'verified' && viewer && !viewer.isIdVerified) return { canJoin: false, reason: 'verified_only' }
  if (viewer && !viewer.isContactVerified) return { canJoin: false, reason: 'phone_required' }
  return { canJoin: true, reason: null }
}

/** Top-level comments with one level of replies, oldest first. */
export async function loadComments(db: SupabaseClient, postId: string, limit = 100): Promise<Comment[]> {
  const { data, error } = await db
    .from('post_comments')
    .select(`id, post_id, parent_id, body, poll_choice, created_at, author:profiles!post_comments_author_id_fkey(${PROFILE_LITE})`)
    .eq('post_id', postId)
    .eq('status', 'live')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  const all = ((data ?? []) as Row[]).map((c) => ({
    id: String(c.id),
    postId: String(c.post_id),
    parentId: (c.parent_id as string | null) ?? null,
    author: toUserLite(c.author as Row),
    body: String(c.body),
    pollChoice: (c.poll_choice as string | null) ?? null,
    createdAt: String(c.created_at),
    replies: [] as Comment[],
  }))
  const top = all.filter((c) => !c.parentId)
  const byId = new Map(top.map((c) => [c.id, c]))
  for (const c of all) if (c.parentId) byId.get(c.parentId)?.replies.push(c)
  return top
}

/**
 * Seats booked per (package, next departure) — bookings are private under RLS, so this
 * aggregates with the service role and returns only counts (+ opt-in faces).
 */
export async function loadTripOccupancy(
  service: SupabaseClient,
  trips: { id: string; nextDeparture: string | null }[],
  withFaces: boolean,
): Promise<Map<string, { booked: number; faces: UserLite[] }>> {
  const out = new Map<string, { booked: number; faces: UserLite[] }>()
  const wanted = trips.filter((t) => t.nextDeparture)
  if (wanted.length === 0) return out
  const { data } = await service
    .from('bookings')
    .select(`package_id, travel_date, guests, user:profiles!bookings_user_id_fkey(${PROFILE_LITE}, trips_private)`)
    .in('package_id', wanted.map((t) => t.id))
    .in('travel_date', [...new Set(wanted.map((t) => t.nextDeparture!))])
    .in('status', ['pending', 'confirmed', 'completed'])
  const dateFor = new Map(wanted.map((t) => [t.id, t.nextDeparture]))
  for (const b of (data ?? []) as Row[]) {
    const pid = String(b.package_id)
    if (dateFor.get(pid) !== b.travel_date) continue
    const cur = out.get(pid) ?? { booked: 0, faces: [] }
    cur.booked += Number(b.guests ?? 1)
    const u = b.user as Row | null
    if (withFaces && u && u.trips_private !== true && cur.faces.length < 12 && !cur.faces.some((f) => f.id === u.id)) {
      cur.faces.push(toUserLite(u))
    }
    out.set(pid, cur)
  }
  return out
}
