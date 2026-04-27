export const revalidate = 300 // 5 minutes

import { Suspense } from 'react'
import { ExploreClient } from '@/components/explore/ExploreClient'
import { loadExploreListData, type ServiceListingWithItems } from '@/lib/explore/explorePageData'
import ExploreLoading from './loading'

export type { ServiceListingWithItems }

async function ExploreResults({ params }: { params: Record<string, string> }) {
  const data = await loadExploreListData(params)
  return (
    <ExploreClient
      packages={data.packages}
      serviceListings={data.serviceListings}
      params={params}
      resultCount={data.resultCount}
      activeTab={data.activeTab}
      searchFallback={data.searchFallback}
      interestedPackageIds={data.interestedPackageIds}
      maxPackagePrice={data.maxPackagePrice}
      spotsBooked={data.spotsBooked}
      interestCounts={data.interestCounts}
    />
  )
}

async function ExploreSuspended({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  return <ExploreResults params={params} />
}

export default function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  return (
    <Suspense fallback={<ExploreLoading />}>
      <ExploreSuspended searchParams={searchParams} />
    </Suspense>
  )
}
