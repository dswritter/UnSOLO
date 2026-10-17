import { cache } from 'react'
import { createServiceRoleClient } from '@/lib/supabase/server'
import {
  distinctIds, intersectIds, orderProfiles, summarizeReviews, type MiniProfile, type ReceivedReview,
} from '@/lib/profile/connections'

/**
 * Loaders for the profile "Connections" section. Bookings, chat membership and
 * trip claims are RLS-scoped to their owners, so these read with the service
 * role and only ever return public profile fields / listing titles.
 */

type Svc = ReturnType<typeof createServiceRoleClient>

const PROFILE_FIELDS = 'id, username, full_name, avatar_url'
const ACTIVE_BOOKING = ['confirmed', 'completed']

export type SharedPlace = { id: string; title: string; href: string; kind: 'trip' | 'listing'; hostedByProfile: boolean }
export type SharedRoom = { id: string; name: string; type: string }

async function profilesByIds(svc: Svc, ids: string[], extra = ''): Promise<Array<MiniProfile & { trips_private?: boolean | null }>> {
  if (!ids.length) return []
  const { data } = await svc.from('profiles').select(PROFILE_FIELDS + extra).in('id', ids)
  return orderProfiles(ids, (data ?? []) as unknown as Array<MiniProfile & { trips_private?: boolean | null }>)
}

/** Packages + service listings a user booked (or joined via an approved claim). */
async function travelledIds(svc: Svc, userId: string) {
  const [bookingsRes, claimsRes] = await Promise.all([
    svc.from('bookings').select('package_id, service_listing_id').eq('user_id', userId).in('status', ACTIVE_BOOKING).limit(200),
    svc.from('trip_traveller_claims').select('package_id').eq('claimant_id', userId).eq('status', 'approved').limit(100),
  ])
  const packages = new Set<string>()
  const services = new Set<string>()
  for (const b of bookingsRes.data ?? []) {
    if (b.package_id) packages.add(b.package_id as string)
    if (b.service_listing_id) services.add(b.service_listing_id as string)
  }
  for (const c of claimsRes.data ?? []) if (c.package_id) packages.add(c.package_id as string)
  return { packages, services }
}

const hostedIds = cache(async (profileId: string) => {
  const svc = createServiceRoleClient()
  const [pk, sv] = await Promise.all([
    svc.from('packages').select('id').eq('host_id', profileId).limit(200),
    svc.from('service_listings').select('id').eq('host_id', profileId).limit(200),
  ])
  return {
    packages: (pk.data ?? []).map(p => p.id as string),
    services: (sv.data ?? []).map(s => s.id as string),
  }
})

/** How the signed-in viewer relates to this profile. */
export const loadViewerRelation = cache(async (profileId: string, viewerId: string) => {
  const svc = createServiceRoleClient()
  const [viewerFollowing, profileFollowers, profileFollowing, viewerRooms, profileRooms, viewerTrips, profileTrips, hosted] =
    await Promise.all([
      svc.from('follows').select('following_id').eq('follower_id', viewerId).limit(1000),
      svc.from('follows').select('follower_id').eq('following_id', profileId).limit(1000),
      svc.from('follows').select('following_id').eq('follower_id', profileId).limit(1000),
      svc.from('chat_room_members').select('room_id').eq('user_id', viewerId).limit(500),
      svc.from('chat_room_members').select('room_id').eq('user_id', profileId).limit(500),
      travelledIds(svc, viewerId),
      travelledIds(svc, profileId),
      hostedIds(profileId),
    ])

  const network = [
    ...(profileFollowers.data ?? []).map(f => f.follower_id as string),
    ...(profileFollowing.data ?? []).map(f => f.following_id as string),
  ]
  const mutualIds = intersectIds((viewerFollowing.data ?? []).map(f => f.following_id as string), network, [viewerId, profileId])

  const roomIds = intersectIds(
    (viewerRooms.data ?? []).map(r => r.room_id as string),
    (profileRooms.data ?? []).map(r => r.room_id as string),
  )

  const hostedPackages = new Set(hosted.packages)
  const hostedServices = new Set(hosted.services)
  const sharedPackageIds = intersectIds(viewerTrips.packages, [...profileTrips.packages, ...hosted.packages])
  const sharedServiceIds = intersectIds(viewerTrips.services, [...profileTrips.services, ...hosted.services])

  const [mutual, rooms, packages, services] = await Promise.all([
    profilesByIds(svc, mutualIds.slice(0, 8)),
    roomIds.length
      ? svc.from('chat_rooms').select('id, name, type').in('id', roomIds).eq('is_active', true).neq('type', 'direct').limit(8)
      : Promise.resolve({ data: [] }),
    sharedPackageIds.length
      ? svc.from('packages').select('id, title, slug').in('id', sharedPackageIds).limit(8)
      : Promise.resolve({ data: [] }),
    sharedServiceIds.length
      ? svc.from('service_listings').select('id, title, type, slug').in('id', sharedServiceIds).limit(8)
      : Promise.resolve({ data: [] }),
  ])

  const shared: SharedPlace[] = [
    ...((packages.data ?? []) as Array<{ id: string; title: string; slug: string }>).map(p => ({
      id: p.id, title: p.title, href: `/packages/${p.slug}`, kind: 'trip' as const, hostedByProfile: hostedPackages.has(p.id),
    })),
    ...((services.data ?? []) as Array<{ id: string; title: string; type: string; slug: string }>).map(s => ({
      id: s.id, title: s.title, href: `/listings/${s.type}/${s.slug}`, kind: 'listing' as const, hostedByProfile: hostedServices.has(s.id),
    })),
  ]

  return {
    mutual,
    mutualCount: mutualIds.length,
    rooms: (rooms.data ?? []) as SharedRoom[],
    shared,
  }
})

/**
 * Host view: travellers who booked their trips/listings, people who messaged
 * them (owner only) and reviews received. Returns null for non-hosts.
 */
export const loadHostConnections = cache(async (profileId: string, isOwnProfile: boolean) => {
  const hosted = await hostedIds(profileId)
  if (!hosted.packages.length && !hosted.services.length) return null
  const svc = createServiceRoleClient()

  const [pkgBookings, svcBookings, claims, tripReviews, hostReviews, dmRooms] = await Promise.all([
    hosted.packages.length
      ? svc.from('bookings').select('user_id').in('package_id', hosted.packages).in('status', ACTIVE_BOOKING)
        .order('created_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [] }),
    hosted.services.length
      ? svc.from('bookings').select('user_id').in('service_listing_id', hosted.services).in('status', ACTIVE_BOOKING)
        .order('created_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [] }),
    hosted.packages.length
      ? svc.from('trip_traveller_claims').select('claimant_id').in('package_id', hosted.packages).eq('status', 'approved').limit(200)
      : Promise.resolve({ data: [] }),
    hosted.packages.length
      ? svc.from('reviews').select('id, rating, body, created_at, user_id, package:packages(title, slug)')
        .in('package_id', hosted.packages).eq('status', 'approved').order('created_at', { ascending: false }).limit(40)
      : Promise.resolve({ data: [] }),
    svc.from('host_reviews').select('id, rating, comment, created_at, reviewer_id').eq('host_id', profileId)
      .order('created_at', { ascending: false }).limit(40),
    isOwnProfile
      ? svc.from('chat_room_members').select('room_id').eq('user_id', profileId).limit(500)
      : Promise.resolve({ data: [] }),
  ])

  const travellerIds = distinctIds(
    [
      ...((pkgBookings.data ?? []) as Array<{ user_id: string }>).map(b => b.user_id),
      ...((svcBookings.data ?? []) as Array<{ user_id: string }>).map(b => b.user_id),
      ...((claims.data ?? []) as Array<{ claimant_id: string }>).map(c => c.claimant_id),
    ],
    [profileId],
  )

  let contactIds: string[] = []
  const memberRoomIds = ((dmRooms.data ?? []) as Array<{ room_id: string }>).map(r => r.room_id)
  if (memberRoomIds.length) {
    const { data: direct } = await svc.from('chat_rooms').select('id').in('id', memberRoomIds).eq('type', 'direct')
    const directIds = (direct ?? []).map(r => r.id as string)
    if (directIds.length) {
      const { data: others } = await svc.from('chat_room_members').select('user_id, joined_at')
        .in('room_id', directIds).neq('user_id', profileId).order('joined_at', { ascending: false }).limit(60)
      contactIds = distinctIds((others ?? []).map(o => o.user_id as string), [profileId, ...travellerIds])
    }
  }

  const reviews: ReceivedReview[] = [
    ...((tripReviews.data ?? []) as unknown as Array<{
      id: string; rating: number; body: string | null; created_at: string; user_id: string; package: { title: string; slug: string } | null
    }>).map(r => ({
      id: `r-${r.id}`, rating: r.rating, body: r.body, createdAt: r.created_at, reviewerId: r.user_id,
      subject: r.package?.title ?? null, href: r.package?.slug ? `/packages/${r.package.slug}` : null,
    })),
    ...((hostReviews.data ?? []) as Array<{ id: string; rating: number; comment: string | null; created_at: string; reviewer_id: string }>).map(r => ({
      id: `h-${r.id}`, rating: r.rating, body: r.comment, createdAt: r.created_at, reviewerId: r.reviewer_id,
      subject: 'As a host', href: null,
    })),
  ]
  const reviewSummary = summarizeReviews(reviews)

  // Travellers who keep their trips private are only listed to the host themself.
  const [travellerRows, contacts, reviewers] = await Promise.all([
    profilesByIds(svc, travellerIds.slice(0, 40), ', trips_private'),
    profilesByIds(svc, contactIds.slice(0, 12)),
    profilesByIds(svc, distinctIds(reviewSummary.items.map(r => r.reviewerId))),
  ])
  const visibleTravellers = isOwnProfile ? travellerRows : travellerRows.filter(p => !p.trips_private)

  return {
    travellers: visibleTravellers.slice(0, 12).map(p => ({ id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url })),
    travellerCount: travellerIds.length,
    contacts,
    reviews: reviewSummary.items.map(r => ({ ...r, reviewer: reviewers.find(p => p.id === r.reviewerId) ?? null })),
    reviewTotal: reviewSummary.total,
    reviewAverage: reviewSummary.average,
  }
})
