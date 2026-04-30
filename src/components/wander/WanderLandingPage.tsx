import Link from 'next/link'
import { Suspense } from 'react'
import { getRequestAuth } from '@/lib/auth/request-session'
import { WanderExploreSection } from '@/components/wander/WanderExploreSection'
import { WanderExploreSkeleton } from '@/components/wander/WanderExploreSkeleton'
import {
  getWanderStats,
  getWanderRatingHero,
  getWanderTripRow,
  getWanderStayRow,
  getWanderActivityRow,
  getWanderRentalRow,
  getWanderServiceItemsForListings,
  getListedActivityFilterOptions,
  getWanderHeroImageUrl,
  getWanderTrustBadgeText,
  getWanderHeroCopy,
} from '@/lib/wander/wanderQueries'
import { WanderHero } from '@/components/wander/WanderHero'
import { WanderSearchBar } from '@/components/wander/WanderSearchBar'
import { WanderStatsGrid } from '@/components/wander/WanderStatsGrid'
import { WanderListingSections } from '@/components/wander/WanderListingSections'
import { WanderRecentlyViewedStrip } from '@/components/wander/WanderRecentlyViewedStrip'
import { WanderStatusRail } from '@/components/wander/WanderStatusRail'
import { WanderSearchScroll } from '@/components/wander/WanderSearchScroll'

export async function WanderLandingPage({
  searchParams,
  searchBasePath = '/',
}: {
  searchParams: Promise<Record<string, string>>
  /** Always `/` — kept for call-site clarity. */
  searchBasePath?: '/'
}) {
  const sp = await searchParams
  const activeTab =
    sp.tab === 'stays' || sp.tab === 'activities' || sp.tab === 'rentals' || sp.tab === 'trips'
      ? sp.tab
      : 'trips'
  const isSearchMode = sp.search === '1'

  const [stats, rating, auth, listedActivities, heroImageUrl, trustBadgeText, heroCopy] = await Promise.all([
    getWanderStats(),
    getWanderRatingHero(),
    getRequestAuth(),
    getListedActivityFilterOptions(),
    getWanderHeroImageUrl(),
    getWanderTrustBadgeText(),
    getWanderHeroCopy(),
  ])

  const { supabase, user } = auth
  let profileAvatar: string | null = null
  if (user) {
    const { data: p } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
    profileAvatar = p?.avatar_url ?? null
  }

  let tripRow: Awaited<ReturnType<typeof getWanderTripRow>> | null = null
  let stays: Awaited<ReturnType<typeof getWanderServiceItemsForListings>> | null = null
  let activities: Awaited<ReturnType<typeof getWanderServiceItemsForListings>> | null = null
  let rentals: Awaited<ReturnType<typeof getWanderServiceItemsForListings>> | null = null
  let landingInterestedPackageIds: string[] = []

  if (!isSearchMode) {
    const [tp, stayListings, actListings, rentListings] = await Promise.all([
      getWanderTripRow(),
      getWanderStayRow(),
      getWanderActivityRow(),
      getWanderRentalRow(),
    ])
    tripRow = tp
    const [s, a, r] = await Promise.all([
      getWanderServiceItemsForListings(stayListings),
      getWanderServiceItemsForListings(actListings),
      getWanderServiceItemsForListings(rentListings),
    ])
    stays = s
    activities = a
    rentals = r

    if (user && tripRow.packages.length > 0) {
      const { data: interests } = await supabase
        .from('package_interests')
        .select('package_id')
        .eq('user_id', user.id)
        .in(
          'package_id',
          tripRow.packages.map(p => p.id),
        )
      landingInterestedPackageIds = (interests || []).map(row => (row as { package_id: string }).package_id)
    }
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
        heroCopy={heroCopy}
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
        <WanderSearchBar listedActivities={listedActivities} variant="wander" wanderSearchBasePath={searchBasePath} />
      </WanderHero>

      {isSearchMode ? (
        <div id="wander-explore" className="border-t border-border/50 scroll-mt-4">
          <Suspense fallback={<WanderExploreSkeleton />}>
            <WanderExploreSection sp={sp} searchBasePath={searchBasePath} />
          </Suspense>
        </div>
      ) : tripRow && stays && activities && rentals ? (
        <div className="border-t border-border/50">
          <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-10 py-6 md:py-9">
            <WanderRecentlyViewedStrip />
            <WanderListingSections
              activeTab={activeTab}
              trips={tripRow.packages}
              tripInterestCounts={tripRow.interestCounts}
              interestedPackageIds={landingInterestedPackageIds}
              stays={stays}
              activities={activities}
              rentals={rentals}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
