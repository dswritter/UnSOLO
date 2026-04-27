import { loadExploreListData } from '@/lib/explore/explorePageData'
import { ExploreClient } from '@/components/explore/ExploreClient'

type WanderSearchBasePath = '/' | '/wander'

export async function WanderExploreSection({
  sp,
  searchBasePath,
}: {
  sp: Record<string, string>
  searchBasePath: WanderSearchBasePath
}) {
  const exploreData = await loadExploreListData(sp)

  return (
    <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-10 py-6 md:py-9">
    <ExploreClient
      packages={exploreData.packages}
      serviceListings={exploreData.serviceListings}
      params={sp}
      resultCount={exploreData.resultCount}
      activeTab={exploreData.activeTab}
      searchFallback={exploreData.searchFallback}
      interestedPackageIds={exploreData.interestedPackageIds}
      maxPackagePrice={exploreData.maxPackagePrice}
      spotsBooked={exploreData.spotsBooked}
      interestCounts={exploreData.interestCounts}
      basePath={searchBasePath}
      pageVariant="wander"
    />
    </div>
  )
}
