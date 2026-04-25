export const revalidate = 300 // 5 minutes

import { ExploreClient } from '@/components/explore/ExploreClient'
import { loadExploreListData, type ServiceListingWithItems } from '@/lib/explore/explorePageData'

export type { ServiceListingWithItems }

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams
  const data = await loadExploreListData(params)

  return (
    <ExploreClient
      packages={data.packages}
      serviceListings={data.serviceListings}
      params={params}
      resultCount={data.resultCount}
      activeTab={data.activeTab}
      interestedPackageIds={data.interestedPackageIds}
      maxPackagePrice={data.maxPackagePrice}
      spotsBooked={data.spotsBooked}
      interestCounts={data.interestCounts}
    />
  )
}
