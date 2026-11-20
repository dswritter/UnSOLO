import Link from 'next/link'
import { cache } from 'react'
import { Lock } from 'lucide-react'
import { getRequestAuth } from '@/lib/auth/request-session'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { loadPosts, loadTripOccupancy, loadViewer } from '@/lib/tribe/load'
import { nextDeparture, placeSlug, type UserLite } from '@/lib/tribe/models'
import { countPlanning } from '@/lib/tribe/trips'
import { SeatRing, ringCaption, spotsCenter, type RingSeg } from './SeatRing'
import { StoryCard } from './PostCard'
import { dateRange } from './format'

const occupancyFor = cache(async (packageId: string, next: string | null, signedIn: boolean) => {
  const occ = await loadTripOccupancy(createServiceRoleClient(), [{ id: packageId, nextDeparture: next }], signedIn)
  return occ.get(packageId) ?? null
})

/**
 * The trip's seat ring for the next departure: host badge on top, trip photo in the middle, taken
 * seats as arcs. Faces only for signed-in viewers (initials/photos come from loadTripOccupancy).
 * Fails closed (renders nothing) if the database isn't available.
 */
export async function TripCircle({ packageId, departureDates, maxGroupSize, host, photo, size = 220, className, heading }: {
  packageId: string
  departureDates: string[] | null
  maxGroupSize: number | null
  host: UserLite | null
  photo: string | null
  size?: number
  className?: string
  /** Rendered between the ring and the caption (mobile: trip title). */
  heading?: React.ReactNode
}) {
  const next = nextDeparture(departureDates)
  // Without a ring, still render the heading (mobile title) in normal flow.
  const bare = heading ? <div className="px-4 pt-5">{heading}</div> : null
  if (!next) return bare
  try {
    const { user } = await getRequestAuth()
    const total = Math.max(maxGroupSize ?? 12, 1)
    const o = await occupancyFor(packageId, next, !!user)
    const booked = Math.min(o?.booked ?? 0, total)
    // Photos only between co-travellers: anyone else sees initials (photos never leave the server).
    const coTraveller = !!user && (o?.faces ?? []).some((f) => f.id === user.id)
    const faces = (o?.faces ?? []).map((f) => (coTraveller ? f : { ...f, avatarUrl: null }))
    const segs: RingSeg[] = []
    for (const f of faces.slice(0, booked)) segs.push({ state: f.id === user?.id ? 'you' : 'taken', user: f })
    while (segs.length < booked) segs.push({ state: 'taken', user: null })
    while (segs.length < total) segs.push({ state: 'open' })
    const left = total - booked
    const names = faces.filter((f) => f.id !== user?.id).slice(0, 3).map((f) => f.name.split(' ')[0])
    return (
      <section aria-label="Who's going" className={className}>
        <div className="grid place-items-center">
          <div className="rounded-full bg-[color:var(--pc-paper)] p-1.5">
            <SeatRing segs={segs} size={size} photo={photo} badge={host ? { user: host, label: 'Host' } : null} showDots={!!user}
              center={spotsCenter(total, left, size * 0.22)} />
          </div>
        </div>
        {heading}
        <p className="fc-caption mt-2 text-center">
          {names.length > 0 ? <><strong>{names.join(', ')}{booked > names.length ? ` +${booked - names.length}` : ''} going</strong> · {dateRange(next, null)}</> : <>{ringCaption(total, booked)} · {dateRange(next, null)}</>}
        </p>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {user ? 'Faces show once you’re travelling together' : <span><Link href="/login" className="pc-link">Sign in</Link> to see who’s going</span>}
        </p>
      </section>
    )
  } catch {
    return bare
  }
}

/**
 * Trip page additions: "From people who went" stories and a bridge to Tribe plans for the same place.
 * Fails closed (renders nothing) if the Tribe tables or the database aren't available.
 */
export async function TripTribeSection({ packageId, placeName }: {
  packageId: string
  /** @deprecated seat ring moved to <TripCircle> */
  departureDates?: string[] | null
  /** @deprecated */
  maxGroupSize?: number | null
  /** @deprecated */
  hostId?: string | null
  placeName: string | null
}) {
  try {
    const { supabase, user } = await getRequestAuth()
    const [storyIds, planning] = await Promise.all([
      supabase.from('posts').select('id').eq('trip_package_id', packageId).eq('kind', 'story').eq('status', 'live')
        .eq('show_on_trip_page', true).order('created_at', { ascending: false }).limit(4).then((r) => (r.data ?? []).map((x) => x.id as string)),
      countPlanning(supabase, placeSlug(placeName)),
    ])
    const viewer = await loadViewer(supabase, user?.id)
    const stories = await loadPosts(supabase, storyIds, viewer)
    return (
      <>
        {planning >= 3 && placeName && (
          <Link href={`/tribe?place=${encodeURIComponent(placeSlug(placeName) ?? '')}`} className="pc-pencilled flex items-center justify-between gap-3 p-5 hover:bg-[color:var(--pc-pine-soft)]">
            <span><span className="block font-bold">{planning} people are planning {placeName}</span><span className="text-sm text-muted-foreground">Community plans · not bookings</span></span>
            <span className="pc-link text-sm">See plans</span>
          </Link>
        )}
        {stories.length > 0 && (
          <section aria-label="From people who went">
            <h2 className="mb-3 text-[22px]">From people who went</h2>
            <div className="grid gap-4 md:grid-cols-2">{stories.map((s) => <StoryCard key={s.id} post={{ ...s, trip: null }} signedIn={!!user} />)}</div>
          </section>
        )}
      </>
    )
  } catch {
    return null
  }
}
