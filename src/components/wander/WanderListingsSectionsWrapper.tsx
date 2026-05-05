'use client'

import { useSearchParams } from 'next/navigation'
import { WanderListingSections } from '@/components/wander/WanderListingSections'
import type { Package, ServiceListing } from '@/types'

type ActivityWithItems = ServiceListing & {
  items: Array<{ id: string; name: string; price_paise: number; images: string[]; unit: string | null }>
}
type RentalWithItems = ActivityWithItems

/**
 * Thin client wrapper so the active-tab ordering of WanderListingSections
 * is derived from the URL on the client. This makes tab clicks feel instant —
 * sections reorder immediately without waiting for a server re-render.
 */
export function WanderListingsSectionsWrapper({
  trips,
  tripInterestCounts,
  interestedPackageIds,
  stays,
  activities,
  rentals,
  interludeSlot,
}: {
  trips: Package[]
  tripInterestCounts?: Record<string, number>
  interestedPackageIds?: string[]
  stays: ActivityWithItems[]
  activities: ActivityWithItems[]
  rentals: RentalWithItems[]
  interludeSlot?: React.ReactNode
}) {
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab')
  const activeTab: 'trips' | 'stays' | 'activities' | 'rentals' | null =
    urlTab === 'trips' || urlTab === 'stays' || urlTab === 'activities' || urlTab === 'rentals'
      ? urlTab
      : null

  return (
    <WanderListingSections
      trips={trips}
      tripInterestCounts={tripInterestCounts}
      interestedPackageIds={interestedPackageIds}
      stays={stays}
      activities={activities}
      rentals={rentals}
      activeTab={activeTab}
      interludeSlot={interludeSlot}
    />
  )
}
