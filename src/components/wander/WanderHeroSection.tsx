import { Suspense } from 'react'
import {
  getListedActivityFilterOptions,
  getWanderHeroImageUrl,
  getWanderTrustBadgeText,
  getWanderHeroCopy,
} from '@/lib/wander/wanderQueries'
import { WanderHero } from '@/components/wander/WanderHero'
import { WanderMobileHeroCoordinator } from '@/components/wander/WanderMobileHeroCoordinator'
import { WanderSearchBar } from '@/components/wander/WanderSearchBar'
import { WanderStatusRail } from '@/components/wander/WanderStatusRail'
import { WanderMobileAccountSlotServer } from '@/components/wander/WanderMobileAccountSlotServer'
import {
  WanderHeroProofSkeleton,
  WanderHeroRatingProofServer,
  WanderHeroStatsServer,
  WanderMobileStatsServer,
  WanderMobileStatsSkeleton,
  WanderStatsGridSkeleton,
} from '@/components/wander/WanderHeroMetrics'

export async function WanderHeroSection({
  activeTab,
  searchBasePath,
}: {
  activeTab: 'trips' | 'stays' | 'activities' | 'rentals' | null
  searchBasePath: '/'
}) {
  const [listedActivities, heroImageUrl, trustBadgeText, heroCopy] = await Promise.all([
    getListedActivityFilterOptions(),
    getWanderHeroImageUrl(),
    getWanderTrustBadgeText(),
    getWanderHeroCopy(),
  ])
  const mobileStatsSlot = <Suspense fallback={<WanderMobileStatsSkeleton />}>
    <WanderMobileStatsServer heroCopy={heroCopy} />
  </Suspense>
  const ratingProof = <Suspense fallback={<WanderHeroProofSkeleton />}>
    <WanderHeroRatingProofServer />
  </Suspense>

  return (
    <>
      <WanderMobileHeroCoordinator
        initialTab={activeTab}
        heroImageUrl={heroImageUrl}
        heroCopy={heroCopy}
        statsSlot={mobileStatsSlot}
        accountSlot={<Suspense fallback={<div className="h-9 w-9 animate-pulse rounded-full bg-white/10" aria-label="Loading account" />}><WanderMobileAccountSlotServer /></Suspense>}
        listedActivities={listedActivities}
        wanderSearchBasePath={searchBasePath}
      />

      <div className="hidden md:block">
        <WanderHero
          heroImageUrl={heroImageUrl}
          trustBadgeText={trustBadgeText}
          heroCopy={heroCopy}
          proofCard={ratingProof}
          belowHero={
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(20rem,30rem)] md:items-stretch md:gap-3">
              <div className="flex min-h-[5.25rem] min-w-0 items-center wander-frost-panel">
                <Suspense fallback={<div className="h-full min-h-[5.25rem] w-full animate-pulse rounded-xl bg-white/[0.04]" aria-label="Loading traveler status" />}>
                  <WanderStatusRail />
                </Suspense>
              </div>
              <div className="flex min-h-[5.25rem] w-full min-w-0 items-stretch lg:min-w-0">
                  <Suspense fallback={<WanderStatsGridSkeleton />}>
                    <WanderHeroStatsServer />
                  </Suspense>
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
