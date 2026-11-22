import type { ApiContext } from '@/lib/api/context'
import { ApiError } from '@/lib/api/http'
import { getLeaderboardRankByScore } from '@/lib/leaderboard-rank'
import { badgeProgress, mutualPlaces, profileTierProgress, visitedPlaces } from '@/lib/profile/publicProfileSummary'
import { loadHostConnections, loadViewerRelation } from '@/app/(main)/profile/[username]/profileConnections'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { PACKAGE_LITE, PROFILE_LITE, toTripLite, toUserLite, type UserLite } from '@/lib/tribe/models'
import { LISTING_LITE, categoryForType, listingToTripLite } from '@/lib/tribe/listings'

type Row = Record<string, unknown>

/** "98******10": first two and last two digits of a phone number. */
export function maskPhone(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '')
  if (d.length < 6) return null
  const local = d.length > 10 ? d.slice(-10) : d
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 4, 2))}${local.slice(-2)}`
}

/** Status line: hidden from non-followers when the person set it to followers only. */
export function visibleStatus(text: unknown, visibility: unknown, own: boolean, following: boolean): string | null {
  const t = typeof text === 'string' && text.trim() ? text.trim() : null
  if (!t) return null
  return visibility === 'followers' && !own && !following ? null : t
}

const BOOKING_TRIP = 'id, travel_date, status, package:packages(title, slug, destination:destinations(name, state))'
const lite = (p: Row | null | undefined): UserLite | null => (p && p.id ? toUserLite(p) : null)

/**
 * Everything the web profile shows, for the apps (GET /users/{username}). Counts and lists that
 * read other people's bookings use the service role and return only public fields, as the web does.
 */
export async function loadAppProfile(ctx: ApiContext, username: string) {
  const { data: p } = await ctx.db.from('profiles')
    .select(`${PROFILE_LITE}, bio, location, status_text, status_visibility, instagram_url, website_url, travel_style, is_verified, created_at, trips_private, states_private, phone_number, phone_public`)
    .eq('username', username).maybeSingle()
  if (!p) throw new ApiError('not_found', 'No traveller with that name')
  const id = String(p.id)
  const viewerId = ctx.user?.id ?? null
  const own = viewerId === id
  const svc = ctx.service()

  const [followers, following, isFollowingR, followsYouR, ownBookings, claims, board, achievements, reviewsW, packages, services, postIds, phoneReq, viewerTrips] = await Promise.all([
    svc.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', id),
    svc.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', id),
    viewerId && !own ? svc.from('follows').select('id').eq('follower_id', viewerId).eq('following_id', id).maybeSingle() : Promise.resolve({ data: null }),
    viewerId && !own ? svc.from('follows').select('id').eq('follower_id', id).eq('following_id', viewerId).maybeSingle() : Promise.resolve({ data: null }),
    svc.from('bookings').select(BOOKING_TRIP).eq('user_id', id).in('status', ['confirmed', 'completed']).order('travel_date', { ascending: false }).limit(50),
    svc.from('trip_traveller_claims').select('booking_id').eq('claimant_id', id).eq('status', 'approved').limit(50),
    svc.from('leaderboard_scores').select('total_score, reviews_written, destinations_count').eq('user_id', id).maybeSingle(),
    svc.from('user_achievements').select('achievement_key').eq('user_id', id),
    svc.from('reviews').select('id, rating, body, created_at, package:packages(title, slug)').eq('user_id', id).order('created_at', { ascending: false }).limit(10),
    ctx.db.from('packages').select(PACKAGE_LITE).eq('host_id', id).eq('is_active', true).limit(10),
    svc.from('service_listings').select(LISTING_LITE).eq('host_id', id).eq('is_active', true)
      .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)').limit(10),
    ctx.db.from('posts').select('id').eq('author_id', id).in('status', ['live', 'past']).order('created_at', { ascending: false }).limit(30),
    viewerId && !own && p.phone_number && p.phone_public !== true
      ? svc.from('phone_requests').select('status').eq('requester_id', viewerId).eq('target_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
    viewerId && !own ? svc.from('bookings').select('package:packages(destination:destinations(name, state))').eq('user_id', viewerId).eq('status', 'completed').limit(100) : Promise.resolve({ data: [] }),
  ])

  // Trips: own bookings plus trips joined as an approved companion (claims).
  const own_ = (ownBookings.data ?? []) as Row[]
  const claimIds = ((claims.data ?? []) as Row[]).map((c) => String(c.booking_id)).filter((b) => !own_.some((o) => String(o.id) === b))
  const claimed = claimIds.length ? ((await svc.from('bookings').select(BOOKING_TRIP).in('id', claimIds).in('status', ['confirmed', 'completed'])).data ?? []) as Row[] : []
  const bookings = [...own_, ...claimed].sort((a, b) => String(b.travel_date ?? '').localeCompare(String(a.travel_date ?? '')))
  const places = visitedPlaces(bookings as never)
  const score = Number((board.data as Row | null)?.total_score ?? 0)
  const rank = score > 0 ? await getLeaderboardRankByScore(ctx.db, score) : null
  const tier = profileTierProgress(score)
  const badges = badgeProgress(((achievements.data ?? []) as Row[]).map((a) => String(a.achievement_key)))
  const tripsPrivate = p.trips_private === true && !own
  const statesPrivate = (p.states_private === true || p.trips_private === true) && !own
  const isFollowing = !!isFollowingR.data
  const listings = [
    ...((packages.data ?? []) as Row[]).map((r) => toTripLite(r)),
    ...((services.data ?? []) as Row[]).map((r) => listingToTripLite(r, categoryForType(r.type), null)),
  ]

  const [viewer, host, relation] = await Promise.all([
    loadViewer(ctx.db, ctx.user),
    loadHostConnections(id, own).catch(() => null),
    viewerId && !own ? loadViewerRelation(id, viewerId).catch(() => null) : Promise.resolve(null),
  ])
  const all = await loadPosts(ctx.db, ((postIds.data ?? []) as Row[]).map((x) => String(x.id)), viewer)
  const openPlan = all.find((x) => x.kind === 'plan' && x.status === 'live' && x.memberCount < (x.spotsTotal ?? 0)) ?? null

  // Phone: never sent unless public or the request was approved.
  const phoneStatus = (phoneReq.data as Row | null)?.status as string | undefined
  const phoneOpen = !!p.phone_number && (p.phone_public === true || phoneStatus === 'approved')
  const phone = own || !p.phone_number ? null : {
    number: phoneOpen ? String(p.phone_number) : null,
    masked: phoneOpen ? null : maskPhone(String(p.phone_number)),
    request: phoneStatus ?? null,
    canRequest: !!viewerId && !phoneOpen && phoneStatus !== 'pending',
  }

  const tripsCount = tripsPrivate ? null : bookings.length
  return {
    user: {
      ...toUserLite(p),
      bio: p.bio ?? null,
      homeCity: p.location ?? null,
      location: p.location ?? null,
      statusText: visibleStatus(p.status_text, p.status_visibility, own, isFollowing),
      instagramUrl: p.instagram_url ?? null,
      websiteUrl: p.website_url ?? null,
      travelStyle: Array.isArray(p.travel_style) ? (p.travel_style as string[]) : [],
      isVerified: p.is_verified === true,
      joinedAt: p.created_at ?? null,
      tripsCount,
      followers: followers.count ?? 0,
      following: following.count ?? 0,
    },
    stats: {
      trips: tripsCount,
      states: statesPrivate ? null : places.states.length || Number((board.data as Row | null)?.destinations_count ?? 0),
      reviews: Number((board.data as Row | null)?.reviews_written ?? 0),
      listings: listings.length,
      points: score,
      rank,
      tier: { name: tier.current.name, next: tier.next?.name ?? null, pointsToNext: tier.pointsToNext, percent: tier.percent },
    },
    followsYou: !!followsYouR.data,
    isFollowing,
    phone,
    travel: {
      states: statesPrivate ? null : places.states,
      trips: tripsPrivate ? [] : bookings.filter((b) => b.status === 'completed').slice(0, 10).map((b) => {
        const pk = b.package as Row | null
        return { title: String(pk?.title ?? 'Trip'), slug: pk?.slug ? String(pk.slug) : null, date: (b.travel_date as string | null) ?? null }
      }),
      mutualPlaces: viewerId && !own && !tripsPrivate ? mutualPlaces(bookings as never, (viewerTrips.data ?? []) as never) : [],
    },
    badges: {
      earned: badges.earned.map(({ key, name, description, icon }) => ({ key, name, description, icon })),
      next: badges.nextUp.map(({ key, name, description, icon }) => ({ key, name, description, icon })),
      total: badges.total,
    },
    listings,
    reviewsWritten: ((reviewsW.data ?? []) as Row[]).map((r) => {
      const pk = r.package as Row | null
      return { id: String(r.id), rating: Number(r.rating ?? 0), body: (r.body as string | null) ?? null, createdAt: String(r.created_at ?? ''), subject: pk?.title ? String(pk.title) : null, slug: pk?.slug ? String(pk.slug) : null }
    }),
    host: host ? {
      travellerCount: host.travellerCount,
      travellers: host.travellers.map((t) => toUserLite(t as Row)),
      reviews: host.reviews.map((r) => ({ id: r.id, rating: r.rating, body: r.body, createdAt: r.createdAt, subject: r.subject, reviewer: lite(r.reviewer as Row | null) })),
      reviewTotal: host.reviewTotal,
      reviewAverage: host.reviewAverage,
      // "Reached out to you": people who messaged this host directly (own profile only).
      reachedOut: own ? host.contacts.map((c) => toUserLite(c as Row)) : [],
    } : null,
    connections: relation ? {
      mutual: relation.mutual.map((m) => toUserLite(m as Row)),
      mutualCount: relation.mutualCount,
      rooms: relation.rooms.map((r) => ({ id: r.id, name: r.name })),
      shared: relation.shared.map((s) => ({ title: s.title, path: s.href, kind: s.kind, hostedByThem: s.hostedByProfile })),
    } : null,
    posts: all.filter((x) => x.id !== openPlan?.id),
    openPlan,
  }
}
