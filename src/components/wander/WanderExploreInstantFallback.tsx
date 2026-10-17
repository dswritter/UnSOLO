'use client'

import { useSyncExternalStore } from 'react'
import { ExploreClient } from '@/components/explore/ExploreClient'
import { readListingPreview } from '@/lib/explore/listing-preview-cache'
import { exploreTabFromParams } from '@/lib/explore/optimistic-filter'
import type { Package } from '@/types'
import type { ServiceListingWithItems } from '@/lib/explore/explorePageData'

type Snapshot = {
  packages: Package[]
  serviceListings: ServiceListingWithItems[]
  spotsBooked: Record<string, number>
  interestCounts: Record<string, number>
}

const EMPTY: Snapshot = { packages: [], serviceListings: [], spotsBooked: {}, interestCounts: {} }
let cached: { trips: unknown; rentals: unknown; activities: unknown; stays: unknown; value: Snapshot } | null = null

function readSnapshot(): Snapshot {
  const trips = readListingPreview('trips')
  const rentals = readListingPreview('rentals')
  const activities = readListingPreview('activities')
  const stays = readListingPreview('stays')
  if (cached && cached.trips === trips && cached.rentals === rentals && cached.activities === activities && cached.stays === stays) {
    return cached.value
  }
  const value: Snapshot = {
    packages: trips?.packages ?? [],
    serviceListings: [rentals, activities, stays].flatMap(preview => preview?.listings ?? []),
    spotsBooked: trips?.spotsBooked ?? {},
    interestCounts: trips?.interestCounts ?? {},
  }
  cached = { trips, rentals, activities, stays, value }
  return value
}

const noopSubscribe = () => () => {}

/**
 * Streaming fallback for homepage search mode. Paints the real filter UI and any
 * listings already seen on the home rows that match the URL, instead of a
 * blank skeleton, while the server query runs.
 */
export function WanderExploreInstantFallback({ sp }: { sp: Record<string, string> }) {
  const snapshot = useSyncExternalStore(noopSubscribe, readSnapshot, () => EMPTY)
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 md:pt-5 lg:px-8">
      <ExploreClient
        provisional
        packages={snapshot.packages}
        serviceListings={snapshot.serviceListings}
        spotsBooked={snapshot.spotsBooked}
        interestCounts={snapshot.interestCounts}
        params={sp}
        resultCount={0}
        page={1}
        hasMore={false}
        activeTab={exploreTabFromParams(sp)}
        basePath="/"
        pageVariant="wander"
      />
    </div>
  )
}
