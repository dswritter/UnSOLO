import Link from 'next/link'
import type { Package, ServiceListing } from '@/types'
import { ServiceListingCard } from '@/components/explore/ServiceListingCard'
import { WanderTripCard } from '@/components/wander/WanderTripCard'
import { ChevronRight } from 'lucide-react'

type ActivityWithItems = ServiceListing & {
  items: Array<{ id: string; name: string; price_paise: number; images: string[]; unit: string | null }>
}
type RentalWithItems = ActivityWithItems

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

export function WanderListingSections({
  trips,
  tripInterestCounts = {},
  interestedPackageIds = [],
  activities,
  rentals,
}: {
  trips: Package[]
  tripInterestCounts?: Record<string, number>
  interestedPackageIds?: string[]
  activities: ActivityWithItems[]
  rentals: RentalWithItems[]
}) {
  return (
    <div className="space-y-8 md:space-y-10">
      <section>
        <SectionHeader title="Popular trips" actionHref="/explore?tab=trips" actionLabel="View all trips" />
        {trips.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trips to show yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {trips.map(p => (
              <WanderTripCard
                key={p.id}
                pkg={p}
                interestCount={tripInterestCounts[p.id] ?? 0}
                interestedPackageIds={interestedPackageIds}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Popular activities" actionHref="/explore?tab=activities" />
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activities to show yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {activities.map(l => (
              <ServiceListingCard key={l.id} listing={l} items={l.items} showViewDetailsButton={false} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Frequently booked rentals" actionHref="/explore?tab=rentals" />
        {rentals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rentals to show yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {rentals.map(l => (
              <ServiceListingCard key={l.id} listing={l} items={l.items} showViewDetailsButton={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
