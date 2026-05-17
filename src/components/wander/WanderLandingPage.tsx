import Link from 'next/link'
import { Suspense } from 'react'
import { getRequestAuth } from '@/lib/auth/request-session'
import { WanderExploreSection } from '@/components/wander/WanderExploreSection'
import { WanderExploreSkeleton } from '@/components/wander/WanderExploreSkeleton'
import {
  getWanderStats,
  getWanderRatingHero,
  getListedActivityFilterOptions,
  getWanderHeroImageUrl,
  getWanderTrustBadgeText,
  getWanderHeroCopy,
} from '@/lib/wander/wanderQueries'
import { WanderHero } from '@/components/wander/WanderHero'
import { WanderMobileHeroCoordinator } from '@/components/wander/WanderMobileHeroCoordinator'
import { WanderSearchBar } from '@/components/wander/WanderSearchBar'
import { WanderStatsGrid } from '@/components/wander/WanderStatsGrid'
import { WanderStatusRail } from '@/components/wander/WanderStatusRail'
import { WanderSearchScroll } from '@/components/wander/WanderSearchScroll'
import {
  WanderListingRowsServer,
  WanderListingRowsSkeleton,
} from '@/components/wander/WanderListingRowsServer'

export async function WanderLandingPage({
  searchParams,
  searchBasePath = '/',
}: {
  searchParams: Promise<Record<string, string>>
  /** Always `/` — kept for call-site clarity. */
  searchBasePath?: '/'
}) {
  const sp = await searchParams
  // Allow null when no ?tab= is present in the URL — mobile landing shows
  // the rows but no tab highlighted on first visit; clicking a pill picks one.
  const activeTab: 'trips' | 'stays' | 'activities' | 'rentals' | null =
    sp.tab === 'stays' || sp.tab === 'activities' || sp.tab === 'rentals' || sp.tab === 'trips'
      ? sp.tab
      : null
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
    is_host: boolean
    role: string | null
  } | null = null
  if (user) {
    const { data: p } = await supabase.from('profiles').select('avatar_url, username, full_name, is_host, role').eq('id', user.id).single()
    profileAvatar = p?.avatar_url ?? null
    mobileHeroUser = p ? {
      id: user.id,
      username: p.username,
      full_name: p.full_name ?? null,
      avatar_url: p.avatar_url ?? null,
      is_host: !!p.is_host,
      role: p.role ?? null,
    } : null
  }

  return (
    <div className="w-full">
      <Suspense fallback={null}>
        <WanderSearchScroll />
      </Suspense>
      {!isSearchMode && (
        <>
          <WanderMobileHeroCoordinator
            initialTab={activeTab}
            heroImageUrl={heroImageUrl}
            heroCopy={heroCopy}
            stats={stats}
            userProfile={mobileHeroUser}
            listedActivities={listedActivities}
            wanderSearchBasePath={searchBasePath}
          />
        </>
      )}

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
      ) : (
        <Suspense fallback={<WanderListingRowsSkeleton />}>
          <WanderListingRowsServer profileAvatar={profileAvatar} userId={user?.id ?? null} />
        </Suspense>
      )}
    </div>
  )
}
