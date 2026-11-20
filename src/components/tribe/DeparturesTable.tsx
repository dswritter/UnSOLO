import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public-client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { loadUpcomingTrips } from '@/lib/tribe/trips'
import { shouldUseDemo } from '@/lib/tribe/demo'
import { DEMO_TRIPS } from '@/lib/tribe/demo-trips'
import type { TripLite } from '@/lib/tribe/models'
import { TripListRow, TripRingCard } from '@/components/explore/fc/TripCards'

export async function loadExploreDepartures(limit = 14): Promise<TripLite[]> {
  try {
    return (await loadUpcomingTrips({ db: createPublicClient(), service: createServiceRoleClient, user: null }, { limit })).items
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
export async function DeparturesTable({ aside }: { aside?: React.ReactNode } = {}) {
  const items = await loadExploreDepartures()
  if (items.length === 0) return null
  const soon = items.slice(0, 6)
  const later = items.slice(6)
  const list = later.length >= 4 ? later : items.slice(Math.max(0, items.length - 5))
  return (
    <>
      <section aria-labelledby="leaving-soon-h" className="mx-auto mt-4 max-w-[1280px] md:mt-8 md:px-6">
        <div className="pc-section-h px-4 pb-3 md:px-0">
          <div>
            <h2 id="leaving-soon-h" className="md:text-[34px]">Leaving soon</h2>
            <p className="hidden text-[15px] text-muted-foreground md:block">Departures in the next few weeks, with seats still open.</p>
          </div>
          <Link href="/?search=1&tab=trips#wander-explore">See all</Link>
        </div>
        <div className="fc-pager md:hidden">
          {soon.map((t, i) => <TripRingCard key={t.id} trip={t} priority={i === 0} />)}
        </div>
        <div className="hidden gap-5 md:grid md:grid-cols-2 lg:grid-cols-3">
          {soon.map((t, i) => <TripRingCard key={t.id} trip={t} ringSize={100} priority={i < 3} />)}
        </div>
      </section>
      <section aria-labelledby="this-month-h" className="mx-auto mt-8 grid max-w-[1280px] gap-8 px-4 md:mt-12 md:px-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="min-w-0">
          <div className="pc-section-h mb-1">
            <h2 id="this-month-h">Next few weeks</h2>
            <Link href="/?search=1&tab=trips#wander-explore">All departures</Link>
          </div>
          <div className="md:rounded-[28px] md:border md:border-border md:bg-card md:px-5 md:py-1.5">
            {list.map((t) => <TripListRow key={t.id} trip={t} />)}
          </div>
        </div>
        {aside && <div className="hidden min-w-0 lg:block">{aside}</div>}
      </section>
    </>
  )
}
