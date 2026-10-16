import { loadExploreListData } from '@/lib/explore/explorePageData'
import { ExploreClient } from '@/components/explore/ExploreClient'

export async function WanderExploreSection({
  sp,
  searchBasePath = '/',
}: {
  sp: Record<string, string>
  searchBasePath?: '/'
}) {
  const exploreData = await loadExploreListData(sp)

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 md:pt-5 lg:px-8">
    <ExploreClient
      packages={exploreData.packages}
      serviceListings={exploreData.serviceListings}
      params={sp}
      resultCount={exploreData.resultCount}
      page={exploreData.page}
      hasMore={exploreData.hasMore}
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
