import Link from 'next/link'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
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

export async function WanderHeroSection({
  activeTab,
  searchBasePath,
}: {
  activeTab: 'trips' | 'stays' | 'activities' | 'rentals' | null
  searchBasePath: '/'
}) {
  const [stats, rating, auth, listedActivities, heroImageUrl, trustBadgeText, heroCopy] =
    await Promise.all([
      getWanderStats(),
      getWanderRatingHero(),
      getRequestAuth(),
      getListedActivityFilterOptions(),
      getWanderHeroImageUrl(),
      getWanderTrustBadgeText(),
      getWanderHeroCopy(),
    ])

  const { user } = auth
  // Request-cached — shares its result with WanderListingRowsServer's call
  // instead of firing a second profile query for the same signed-in user.
  const profile = user ? await getRequestProfile(user.id) : null
  const profileAvatar = profile?.avatar_url ?? null
  const mobileHeroUser =
    user && profile
      ? {
          id: user.id,
          username: profile.username,
          full_name: profile.full_name ?? null,
          avatar_url: profile.avatar_url ?? null,
          is_host: !!profile.is_host,
          role: profile.role ?? null,
        }
      : null

  return (
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
                    <Link
                      href="/login?redirectTo=/"
                      className="text-sm font-semibold text-primary hover:underline"
                    >
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
          <WanderSearchBar
            listedActivities={listedActivities}
            variant="wander"
            wanderSearchBasePath={searchBasePath}
          />
        </WanderHero>
      </div>
    </>
  )
}

export function WanderHeroSkeleton() {
  return (
    <>
      {/* Mobile hero skeleton */}
      <div className="md:hidden h-[100svh] w-full animate-pulse bg-zinc-900" />
      {/* Desktop hero skeleton */}
      <div className="hidden md:block h-[min(92svh,860px)] w-full animate-pulse bg-zinc-900" />
    </>
  )
}
