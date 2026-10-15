'use client'

import { useSyncExternalStore } from 'react'
import { WanderListingSections } from '@/components/wander/WanderListingSections'
import {
  readListingPreview,
  type ListingPreviewKind,
  type ServicePreview,
  type TripsPreview,
} from '@/lib/explore/listing-preview-cache'

const noopSubscribe = () => () => {}

type ActiveTab = ListingPreviewKind | null

/**
 * Row fallback while the server streams fresh data: paints the row from the
 * last session snapshot when available, else card-shaped placeholders.
 */
export function WanderRowFallback({ kind, title, activeTab }: { kind: ListingPreviewKind; title: string; activeTab: ActiveTab }) {
  const preview = useSyncExternalStore(noopSubscribe, () => readListingPreview(kind), () => null)

  if (preview) {
    if (kind === 'trips') {
      const trips = preview as TripsPreview
      return (
        <WanderListingSections onlySection="trips" trips={trips.packages} tripInterestCounts={trips.interestCounts}
          spotsBookedByTrip={trips.spotsBooked} stays={[]} activities={[]} rentals={[]} activeTab={activeTab} />
      )
    }
    const { listings } = preview as ServicePreview
    return (
      <WanderListingSections onlySection={kind} trips={[]} stays={kind === 'stays' ? listings : []}
        activities={kind === 'activities' ? listings : []} rentals={kind === 'rentals' ? listings : []} activeTab={activeTab} />
    )
  }

  return <WanderRowSkeleton title={title} />
}

export function WanderRowSkeleton({ title }: { title: string }) {
  return (
    <section aria-label={`Loading ${title}`} aria-busy="true">
      <div className="mb-4 h-7 w-48 animate-pulse rounded-md bg-white/10" />
      <div className="-mx-4 flex gap-3 overflow-hidden px-4 md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:px-0 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="basis-[78%] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:basis-[60%] md:basis-auto">
            <div className="aspect-[4/3] animate-pulse bg-white/[0.08]" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.07]" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.07]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
