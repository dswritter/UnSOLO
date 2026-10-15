'use client'

import { useSyncExternalStore } from 'react'
import { ExploreClient } from '@/components/explore/ExploreClient'
import { WanderExploreSkeleton } from '@/components/wander/WanderExploreSkeleton'
import {
  previewKindForParams,
  readListingPreview,
  type ServicePreview,
  type TripsPreview,
} from '@/lib/explore/listing-preview-cache'

const noopSubscribe = () => () => {}
/**
 * "View all" fallback: paints the listings the home row already showed while the
 * full (paginated) result set streams from the server.
 */
export function WanderExploreFallback({ sp }: { sp: Record<string, string> }) {
  const kind = previewKindForParams(sp)
  const preview = useSyncExternalStore(noopSubscribe, () => (kind ? readListingPreview(kind) : null), () => null)

  if (!kind || !preview) return <WanderExploreSkeleton />

  const trips = kind === 'trips' ? (preview as TripsPreview) : null
  const listings = kind === 'trips' ? [] : (preview as ServicePreview).listings
  const count = trips ? trips.packages.length : listings.length
  if (count === 0) return <WanderExploreSkeleton />

  return (
    <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-10 py-6 md:py-9">
      <ExploreClient
        packages={trips?.packages ?? []}
        serviceListings={listings}
        params={sp}
        resultCount={count}
        page={1}
        hasMore={false}
        activeTab={kind}
        spotsBooked={trips?.spotsBooked ?? {}}
        interestCounts={trips?.interestCounts ?? {}}
        basePath="/"
        pageVariant="wander"
        previewPending
      />
    </div>
  )
}
