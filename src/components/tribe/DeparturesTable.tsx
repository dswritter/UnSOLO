import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { loadUpcomingTrips } from '@/lib/tribe/trips'
import { shouldUseDemo } from '@/lib/tribe/demo'
import { DEMO_TRIPS } from '@/lib/tribe/demo-trips'
import type { TripLite } from '@/lib/tribe/models'
import { TripListRow, TripRingCard } from '@/components/explore/fc/TripCards'

/**
 * Public and cookie-free (aggregate counts, no faces), so it is cached like the listing rows below.
 * Uncached it ran three database round trips on every home load before "Leaving soon" could paint.
 * Errors are not cached: they throw out of the cached function and fall back below.
 */
const cachedDepartures = unstable_cache(
  async (limit: number) => (await loadUpcomingTrips({ db: createPublicClient(), service: createServiceRoleClient, user: null }, { limit })).items,
  ['explore-departures-v1'],
  { revalidate: 60, tags: ['explore-departures'] },
)

export async function loadExploreDepartures(limit = 20): Promise<TripLite[]> {
  try {
    return await cachedDepartures(limit)
  } catch (e) {
    if (shouldUseDemo(e)) return DEMO_TRIPS.slice(0, limit)
    return []
  }
}

/**
 * Explore: "Leaving soon" photo-first ring cards (mobile pager / desktop grid) and "This month" list
 * with mini arcs. Cookie-free so the home page stays cacheable; seat counts come from aggregate
 * booking totals only (no faces). Renders nothing when there are no departures.
 */
/** md: 3 cols → 6 cards, lg: 4 → 8, xl: 5 → 10, 2xl: 6 → 12. */
function gridShow(i: number) {
  if (i < 6) return undefined
  if (i < 8) return 'md:hidden lg:flex'
  if (i < 10) return 'md:hidden xl:flex'
  return 'md:hidden 2xl:flex'
}

export async function DeparturesTable({ aside }: { aside?: React.ReactNode } = {}) {
  const items = await loadExploreDepartures()
  if (items.length === 0) return null
  // Up to 12 cards: rows of 2/3/4/5/6 by width, with the extras hidden so every row is full.
  const soon = items.slice(0, 12)
  const later = items.slice(12)
  const list = later.length >= 4 ? later : items.slice(Math.max(0, items.length - 5))
  return (
    <>
      <section aria-labelledby="leaving-soon-h" className="mx-auto w-full max-w-[1440px] mt-4 md:mt-6 md:px-6 lg:px-10">
        <div className="pc-section-h px-4 pb-3 md:px-0">
          <h2 id="leaving-soon-h" className="md:text-[22px]">Leaving soon</h2>
          <Link href="/?search=1&tab=trips#wander-explore">See all</Link>
        </div>
        <div className="fc-pager md:hidden">
          {soon.slice(0, 8).map((t, i) => <TripRingCard key={t.id} trip={t} priority={i === 0} />)}
        </div>
        <div className="hidden gap-4 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {soon.map((t, i) => <TripRingCard key={t.id} trip={t} priority={i < 4} className={gridShow(i)} />)}
        </div>
      </section>
      <section aria-labelledby="this-month-h" className="mx-auto w-full max-w-[1440px] mt-7 grid gap-6 px-4 md:mt-9 md:px-6 lg:grid-cols-[1.55fr_1fr] lg:px-10">
        <div className="min-w-0">
          <div className="pc-section-h mb-1">
            <h2 id="this-month-h">Next few weeks</h2>
            <Link href="/?search=1&tab=trips#wander-explore">All departures</Link>
          </div>
          <div className="md:rounded-[20px] md:border md:border-border md:bg-card md:px-4 md:py-1">
            {list.map((t) => <TripListRow key={t.id} trip={t} />)}
          </div>
        </div>
        {aside && <div className="hidden min-w-0 lg:block">{aside}</div>}
      </section>
    </>
  )
}
