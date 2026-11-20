import Link from 'next/link'
import { getRequestAuth } from '@/lib/auth/request-session'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { loadPosts, loadTripOccupancy, loadViewer } from '@/lib/tribe/load'
import { nextDeparture, placeSlug, type Seat } from '@/lib/tribe/models'
import { countPlanning } from '@/lib/tribe/trips'
import { SeatRow } from './SeatRow'
import { StoryCard } from './PostCard'
import { dateRange } from './format'

/**
 * Trip page additions (Passenger Chart): who's going on the next departure as a seat row,
 * "From people who went" stories, and a bridge to Tribe plans for the same place.
 * Fails closed (renders nothing) if the Tribe tables or the database aren't available.
 */
export async function TripTribeSection({ packageId, departureDates, maxGroupSize, hostId, placeName }: {
  packageId: string
  departureDates: string[] | null
  maxGroupSize: number | null
  hostId: string | null
  placeName: string | null
}) {
  try {
    const { supabase, user } = await getRequestAuth()
    const next = nextDeparture(departureDates)
    const total = maxGroupSize ?? 12
    const [occ, storyIds, planning] = await Promise.all([
      loadTripOccupancy(createServiceRoleClient(), [{ id: packageId, nextDeparture: next }], !!user),
      supabase.from('posts').select('id').eq('trip_package_id', packageId).eq('kind', 'story').eq('status', 'live')
        .eq('show_on_trip_page', true).order('created_at', { ascending: false }).limit(4).then((r) => (r.data ?? []).map((x) => x.id as string)),
      countPlanning(supabase, placeSlug(placeName)),
    ])
    const o = occ.get(packageId)
    const seats: Seat[] = []
    if (hostId) seats.push({ state: 'host', user: null })
    for (const f of o?.faces ?? []) seats.push({ state: f.id === user?.id ? 'you' : 'member', user: f })
    for (let i = (o?.faces.length ?? 0); i < (o?.booked ?? 0); i++) seats.push({ state: 'member', user: null })
    while (seats.length < total + (hostId ? 1 : 0)) seats.push({ state: 'open', user: null })
    const viewer = await loadViewer(supabase, user?.id)
    const stories = await loadPosts(supabase, storyIds, viewer)
    const left = Math.max(total - (o?.booked ?? 0), 0)
    return (
      <>
        {next && (
          <section aria-label="Who's going" className="pc-printed p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg">Who&apos;s going · {dateRange(next, null)}</h2>
              <span className="pc-mono text-sm">{left} of {total} seats left</span>
            </div>
            <SeatRow seats={seats} size="sm" />
            {!user && (o?.booked ?? 0) > 0 && <p className="mt-2 text-xs text-muted-foreground"><Link href="/login" className="pc-link">Sign in</Link> to see who&apos;s going.</p>}
          </section>
        )}
        {planning >= 3 && placeName && (
          <Link href={`/tribe?place=${encodeURIComponent(placeSlug(placeName) ?? '')}`} className="pc-pencilled flex items-center justify-between gap-3 p-4 hover:bg-accent/40">
            <span><span className="block font-semibold">{planning} people are planning {placeName}</span><span className="text-sm text-muted-foreground">Community plans · not bookings</span></span>
            <span className="pc-link text-sm">See plans →</span>
          </Link>
        )}
        {stories.length > 0 && (
          <section aria-label="From people who went">
            <h2 className="mb-3 text-xl">From people who went</h2>
            <div className="grid gap-4 md:grid-cols-2">{stories.map((s) => <StoryCard key={s.id} post={{ ...s, trip: null }} signedIn={!!user} />)}</div>
          </section>
        )}
      </>
    )
  } catch {
    return null
  }
}
