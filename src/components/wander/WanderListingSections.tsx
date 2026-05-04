import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Package, ServiceListing } from '@/types'
import { ServiceListingCard } from '@/components/explore/ServiceListingCard'
import { WanderTripCard } from '@/components/wander/WanderTripCard'
import { ChevronRight, ArrowRight } from 'lucide-react'
import { wanderSearchHref } from '@/lib/routing/wanderLandingPath'

type ActivityWithItems = ServiceListing & {
  items: Array<{ id: string; name: string; price_paise: number; images: string[]; unit: string | null }>
}
type RentalWithItems = ActivityWithItems

const MOBILE_MAX = 5

function SectionHeader({
  title,
  actionHref,
  actionLabel = 'View all',
}: {
  title: string
  actionHref: string
  actionLabel?: string
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <h2 className="text-xl md:text-2xl font-black tracking-tight">{title}</h2>
      <Link
        href={actionHref}
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline shrink-0"
      >
        {actionLabel} <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

/** Horizontally-scrolling row on mobile, grid on sm+. Pass each card pre-rendered. */
function ScrollRow({ children, viewAllHref, viewAllLabel }: { children: ReactNode[]; viewAllHref: string; viewAllLabel: string }) {
  // Mobile shows up to MOBILE_MAX cards in the scroll row, then a "View all" tile at the end.
  // Desktop falls back to the existing 4-up grid (no scroll).
  const mobileChildren = children.slice(0, MOBILE_MAX)
  const overflow = children.length > MOBILE_MAX
  return (
    <>
      {/* Mobile: horizontal scroll-snap row */}
      <div className="md:hidden">
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {mobileChildren.map((child, i) => (
            <div key={i} className="snap-start shrink-0 basis-[78%] sm:basis-[60%]">
              {child}
            </div>
          ))}
          {/* View all tile — always shown to make the scroll-end action obvious */}
          <Link
            href={viewAllHref}
            className="snap-start shrink-0 basis-[58%] sm:basis-[40%] flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-8 text-center transition-colors hover:bg-primary/10"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <ArrowRight className="h-5 w-5" />
            </span>
            <span className="text-sm font-bold text-primary">{viewAllLabel}</span>
            {overflow ? (
              <span className="text-[11px] text-muted-foreground">+{children.length - MOBILE_MAX} more</span>
            ) : null}
          </Link>
        </div>
      </div>

      {/* Desktop: 4-up grid (unchanged) */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {children}
      </div>
    </>
  )
}

export function WanderListingSections({
  trips,
  tripInterestCounts = {},
  interestedPackageIds = [],
  stays,
  activities,
  rentals,
  activeTab = 'trips',
}: {
  trips: Package[]
  tripInterestCounts?: Record<string, number>
  interestedPackageIds?: string[]
  stays: ActivityWithItems[]
  activities: ActivityWithItems[]
  rentals: RentalWithItems[]
  activeTab?: 'trips' | 'stays' | 'activities' | 'rentals'
}) {
  const sectionOrder = (['trips', 'stays', 'activities', 'rentals'] as const)
  const orderedTypes = [activeTab, ...sectionOrder.filter(type => type !== activeTab)]
  const tripSupportCopy = activeTab === 'trips'

  const tripsHref = wanderSearchHref({ tab: 'trips' })
  const staysHref = wanderSearchHref({ tab: 'stays' })
  const activitiesHref = wanderSearchHref({ tab: 'activities' })
  const rentalsHref = wanderSearchHref({ tab: 'rentals' })

  const sections = {
    trips: (
      <section key="trips">
        <SectionHeader title="Popular trips" actionHref={tripsHref} actionLabel="View all trips" />
        {trips.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trips to show yet.</p>
        ) : (
          <ScrollRow viewAllHref={tripsHref} viewAllLabel="View all trips">
            {trips.map(p => (
              <WanderTripCard
                key={p.id}
                pkg={p}
                interestCount={tripInterestCounts[p.id] ?? 0}
                interestedPackageIds={interestedPackageIds}
              />
            ))}
          </ScrollRow>
        )}
      </section>
    ),
    stays: (
      <section key="stays">
        <SectionHeader
          title={tripSupportCopy ? 'Stays near these trips' : 'Popular stays'}
          actionHref={staysHref}
          actionLabel="View all stays"
        />
        {stays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stays to show yet.</p>
        ) : (
          <ScrollRow viewAllHref={staysHref} viewAllLabel="View all stays">
            {stays.map(l => (
              <ServiceListingCard key={l.id} listing={l} items={l.items} showViewDetailsButton={false} />
            ))}
          </ScrollRow>
        )}
      </section>
    ),
    activities: (
      <section key="activities">
        <SectionHeader
          title={tripSupportCopy ? 'Activities you can add' : 'Popular activities'}
          actionHref={activitiesHref}
        />
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activities to show yet.</p>
        ) : (
          <ScrollRow viewAllHref={activitiesHref} viewAllLabel="View all activities">
            {activities.map(l => (
              <ServiceListingCard key={l.id} listing={l} items={l.items} showViewDetailsButton={false} />
            ))}
          </ScrollRow>
        )}
      </section>
    ),
    rentals: (
      <section key="rentals">
        <SectionHeader
          title={tripSupportCopy ? 'Useful rentals in the area' : 'Frequently booked rentals'}
          actionHref={rentalsHref}
        />
        {rentals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rentals to show yet.</p>
        ) : (
          <ScrollRow viewAllHref={rentalsHref} viewAllLabel="View all rentals">
            {rentals.map(l => (
              <ServiceListingCard key={l.id} listing={l} items={l.items} showViewDetailsButton={false} />
            ))}
          </ScrollRow>
        )}
      </section>
    ),
  } satisfies Record<typeof sectionOrder[number], ReactNode>

  return (
    <div className="space-y-8 md:space-y-10">
      {orderedTypes.map(type => sections[type])}
    </div>
  )
}
