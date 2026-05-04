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
import { WanderMobileHeroSearch } from '@/components/wander/WanderMobileHeroSearch'
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
  let mobileHeroUser: {
    id: string
    username: string
    full_name: string | null
    avatar_url: string | null
  } | null = null
  if (user) {
    const { data: p } = await supabase.from('profiles').select('avatar_url, username, full_name').eq('id', user.id).single()
    profileAvatar = p?.avatar_url ?? null
    mobileHeroUser = p ? {
      id: user.id,
      username: p.username,
      full_name: p.full_name ?? null,
      avatar_url: p.avatar_url ?? null,
    } : null
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
      <div className="md:hidden">
        <WanderMobileHeroSearch
          initialTab={activeTab}
          heroImageUrl={heroImageUrl}
          heroCopy={heroCopy}
          stats={stats}
          userProfile={mobileHeroUser}
          listedActivities={listedActivities}
          wanderSearchBasePath={searchBasePath}
        />
        <div className="border-b border-border/50 px-4 py-4">
          <div className="space-y-4">
            <div className="wander-frost-panel">
              {user ? (
                <WanderStatusRail avatarUrl={profileAvatar} />
              ) : (
                <div className="space-y-1">
                  <h3 className="text-sm font-bold">Traveler status</h3>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Sign in to see recent stories from people you follow — unread first.
                  </p>
                  <Link href="/login?redirectTo=/" className="text-sm font-semibold text-primary hover:underline">
                    Sign in
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden md:block">
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
                    <Link href="/login?redirectTo=/" className="text-sm font-semibold text-primary hover:underline">
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
      </div>

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
            <div className="mb-6 grid gap-3 md:hidden">
              <div className="rounded-2xl border border-white/14 bg-white/[0.05] p-4 shadow-[0_14px_44px_rgba(0,0,0,0.2)] backdrop-blur-[42px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/90">Keep planning</p>
                <h3 className="mt-1 text-lg font-black text-white">Check deals and meet other travellers</h3>
                <p className="mt-1 text-sm text-white/62">
                  Save on bundles, or jump into communities while you shape the plan.
                </p>
                <div className="mt-4 flex gap-2">
                  <Link href="/offers" className="inline-flex flex-1 items-center justify-center rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
                    View Offers
                  </Link>
                  <Link href="/community" className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/14 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white">
                    Meet Travellers
                  </Link>
                </div>
              </div>
            </div>
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
