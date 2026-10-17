import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getLeaderboardRankByScore } from '@/lib/leaderboard-rank'
import { visitedPlaces } from '@/lib/profile/publicProfileSummary'

type Destination = { name: string; state: string } | null
type PackageRef = { title: string; slug: string; destination?: Destination } | null

export type ProfileBooking = { id: string; travel_date: string; status: string; package: PackageRef }
export type ProfileReview = { id: string; rating: number; body: string | null; package: { title: string; slug: string } | null }
export type HostedListing = { id: string; title: string; href: string; kind: string; place: string }

/**
 * Per-request loaders shared by the streamed profile sections. `cache` dedupes
 * calls across Suspense boundaries, so each query runs once per render.
 */
export const loadTravelActivity = cache(async (profileId: string) => {
  const supabase = await createClient()
  const { data, count } = await supabase
    .from('bookings')
    .select('id, travel_date, status, package:packages(title, slug, destination:destinations(name, state))', { count: 'exact' })
    .eq('user_id', profileId)
    .in('status', ['confirmed', 'completed'])
    .order('travel_date', { ascending: false })
    .limit(50)
  const bookings = (data ?? []) as unknown as ProfileBooking[]
  return {
    tripsCount: count ?? bookings.length,
    bookings,
    completed: bookings.filter(b => b.status === 'completed').slice(0, 10),
    states: visitedPlaces(bookings).states,
  }
})

export const loadLeaderboard = cache(async (profileId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('leaderboard_scores')
    .select('total_score, reviews_written, destinations_count')
    .eq('user_id', profileId)
    .maybeSingle()
  const score = typeof data?.total_score === 'number' ? data.total_score : 0
  const rank = score > 0 ? await getLeaderboardRankByScore(supabase, score) : null
  return {
    score,
    reviewsWritten: data?.reviews_written ?? 0,
    destinationsCount: data?.destinations_count ?? 0,
    rank,
  }
})

export const loadAchievementKeys = cache(async (profileId: string) => {
  const supabase = await createClient()
  const { data } = await supabase.from('user_achievements').select('achievement_key').eq('user_id', profileId)
  return (data ?? []).map(a => a.achievement_key as string)
})

export const loadReviews = cache(async (profileId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('reviews')
    .select('id, rating, body, package:packages(title, slug)')
    .eq('user_id', profileId)
    .order('created_at', { ascending: false })
    .limit(10)
  return (data ?? []) as unknown as ProfileReview[]
})

const SERVICE_KIND: Record<string, string> = { stays: 'Stay', activities: 'Activity', rentals: 'Rental', getting_around: 'Transport' }

function placeOf(dest: Destination) {
  return dest ? [dest.name, dest.state].filter(Boolean).join(', ') : ''
}

/** Public, live listings only — safe to show every visitor. */
export const loadHostedListings = cache(async (profileId: string): Promise<HostedListing[]> => {
  const supabase = await createClient()
  const [services, trips] = await Promise.all([
    supabase.from('service_listings').select('id, title, type, slug, destination:destinations(name, state)')
      .eq('host_id', profileId).eq('is_active', true)
      .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)').limit(6),
    supabase.from('packages').select('id, title, slug, destination:destinations(name, state)')
      .eq('host_id', profileId).eq('is_active', true).limit(6),
  ])
  return [
    ...((trips.data ?? []) as unknown as Array<{ id: string; title: string; slug: string; destination: Destination }>).map(p => ({
      id: p.id, title: p.title, href: `/packages/${p.slug}`, kind: 'Trip', place: placeOf(p.destination),
    })),
    ...((services.data ?? []) as unknown as Array<{ id: string; title: string; type: string; slug: string; destination: Destination }>).map(s => ({
      id: s.id, title: s.title, href: `/listings/${s.type}/${s.slug}`, kind: SERVICE_KIND[s.type] ?? 'Listing', place: placeOf(s.destination),
    })),
  ]
})

export const loadViewerPlaces = cache(async (viewerId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bookings')
    .select('package:packages(destination:destinations(name, state))')
    .eq('user_id', viewerId)
    .eq('status', 'completed')
  return (data ?? []) as unknown as Array<{ package: PackageRef }>
})
