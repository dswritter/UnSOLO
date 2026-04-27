export const revalidate = 300

import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { loadExploreListData } from '@/lib/explore/explorePageData'
import { ExploreClient } from '@/components/explore/ExploreClient'
import {
  getWanderStats,
  getWanderRatingHero,
  getWanderTripRow,
  getWanderActivityRow,
  getWanderRentalRow,
  getWanderServiceItemsForListings,
  getListedActivityFilterOptions,
  getWanderHeroImageUrl,
  getWanderTrustBadgeText,
} from '@/lib/wander/wanderQueries'
import { WanderHero } from '@/components/wander/WanderHero'
import { WanderSearchBar } from '@/components/wander/WanderSearchBar'
import { WanderStatsGrid } from '@/components/wander/WanderStatsGrid'
import { WanderListingSections } from '@/components/wander/WanderListingSections'
import { WanderRecentlyViewedStrip } from '@/components/wander/WanderRecentlyViewedStrip'
import { WanderStatusRail } from '@/components/wander/WanderStatusRail'
import { WanderSearchScroll } from '@/components/wander/WanderSearchScroll'

export default async function WanderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const isSearchMode = sp.search === '1'

  const [stats, rating, supabase, listedActivities, heroImageUrl, trustBadgeText] = await Promise.all([
    getWanderStats(),
    getWanderRatingHero(),
    createClient(),
    getListedActivityFilterOptions(),
    getWanderHeroImageUrl(),
    getWanderTrustBadgeText(),
  ])

  const { data: { user } } = await supabase.auth.getUser()
  let profileAvatar: string | null = null
  if (user) {
    const { data: p } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
    profileAvatar = p?.avatar_url ?? null
  }

  const exploreData = isSearchMode ? await loadExploreListData(sp) : null

  let tripPackages: Awaited<ReturnType<typeof getWanderTripRow>> | null = null
  let activities: Awaited<ReturnType<typeof getWanderServiceItemsForListings>> | null = null
  let rentals: Awaited<ReturnType<typeof getWanderServiceItemsForListings>> | null = null

  if (!isSearchMode) {
    const [tp, actListings, rentListings] = await Promise.all([
      getWanderTripRow(),
      getWanderActivityRow(),
      getWanderRentalRow(),
    ])
    tripPackages = tp
    const [a, r] = await Promise.all([
      getWanderServiceItemsForListings(actListings),
      getWanderServiceItemsForListings(rentListings),
    ])
    activities = a
    rentals = r
  }

  return (
    <div className="w-full">
      <Suspense fallback={null}>
        <WanderSearchScroll />
      </Suspense>
      <WanderHero
        rating={rating}
        stats={stats}
        heroImageUrl={heroImageUrl}
        trustBadgeText={trustBadgeText}
        belowHero={
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(20rem,30rem)] md:items-stretch md:gap-3">
            <div className="flex min-h-[5.25rem] min-w-0 items-center wander-frost-panel">
              {user ? (
                <WanderStatusRail avatarUrl={profileAvatar} />
              ) : (
                <div className="space-y-1">
                  <h3 className="text-sm font-bold">Traveler status</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Sign in to see recent stories from people you follow — unread first.
                  </p>
                  <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
                    Sign in
                  </Link>
                </div>
              )}
            </div>
            <div className="flex min-h-[5.25rem] w-full min-w-0 items-stretch lg:min-w-0">
              <WanderStatsGrid stats={stats} />
            </div>
          </div>
        }
      >
        <WanderSearchBar listedActivities={listedActivities} variant="wander" />
      </WanderHero>

      {isSearchMode && exploreData ? (
        <div id="wander-explore" className="border-t border-border/50 scroll-mt-4">
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
              basePath="/wander"
              pageVariant="wander"
            />
          </div>
        </div>
      ) : tripPackages && activities && rentals ? (
        <div className="border-t border-border/50">
          <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-10 py-6 md:py-9">
            {/* Same `rv_packages` localStorage as /explore; Wander-styled strip */}
            <WanderRecentlyViewedStrip />
            <WanderListingSections trips={tripPackages} activities={activities} rentals={rentals} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
