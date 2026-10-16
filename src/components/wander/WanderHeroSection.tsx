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
import { WanderCommunityPanel } from '@/components/wander/WanderCommunityPanel'
import { WanderContinuePanel } from '@/components/wander/WanderContinuePanel'
import { wanderSearchHref } from '@/lib/routing/wanderLandingPath'
import { WanderMobileAccountSlotServer } from '@/components/wander/WanderMobileAccountSlotServer'
import {
  WanderHeroProofSkeleton,
  WanderHeroRatingProofServer,
  WanderHeroStatsServer,
  WanderMobileStatsServer,
  WanderMobileStatsSkeleton,
  WanderStatsGridSkeleton,
} from '@/components/wander/WanderHeroMetrics'

const QUICK_LINKS = [
  { label: 'Weekend getaways', href: wanderSearchHref({ tab: 'trips', minDays: '1', maxDays: '3' }) },
  { label: 'Beginner friendly', href: wanderSearchHref({ tab: 'trips', difficulty: 'easy' }) },
  { label: 'Under ₹10K', href: wanderSearchHref({ tab: 'trips', maxBudget: '10000' }) },
  { label: '8+ day journeys', href: wanderSearchHref({ tab: 'trips', minDays: '8' }) },
]

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
        accountSlot={<Suspense fallback={<div className="h-9 w-9 animate-pulse rounded-full bg-foreground/10" aria-label="Loading account" />}><WanderMobileAccountSlotServer /></Suspense>}
        listedActivities={listedActivities}
        wanderSearchBasePath={searchBasePath}
      />

      <div className="hidden md:block">
        <WanderHero
          heroImageUrl={heroImageUrl}
          trustBadgeText={trustBadgeText}
          heroCopy={heroCopy}
          proofCard={ratingProof}
          stats={
            <Suspense fallback={<WanderStatsGridSkeleton />}>
              <WanderHeroStatsServer />
            </Suspense>
          }
          quickLinks={QUICK_LINKS}
          belowHero={
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Suspense fallback={<div className="h-44 animate-pulse rounded-[1.25rem] bg-foreground/[0.05]" aria-label="Loading community" />}>
                <WanderCommunityPanel />
              </Suspense>
              <WanderContinuePanel />
            </div>
          }
        >
          <WanderSearchBar
            listedActivities={listedActivities}
            variant="wander"
            layout="panel"
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
      <div className="md:hidden h-[100svh] w-full animate-pulse bg-muted" />
      {/* Desktop hero skeleton */}
      <div className="hidden md:block h-[min(92svh,860px)] w-full animate-pulse bg-muted" />
    </>
  )
}
