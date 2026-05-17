import { Suspense } from 'react'
import { WanderExploreSection } from '@/components/wander/WanderExploreSection'
import { WanderExploreSkeleton } from '@/components/wander/WanderExploreSkeleton'
import { WanderSearchScroll } from '@/components/wander/WanderSearchScroll'
import { WanderHeroSection, WanderHeroSkeleton } from '@/components/wander/WanderHeroSection'
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
  const activeTab: 'trips' | 'stays' | 'activities' | 'rentals' | null =
    sp.tab === 'stays' || sp.tab === 'activities' || sp.tab === 'rentals' || sp.tab === 'trips'
      ? sp.tab
      : null
  const isSearchMode = sp.search === '1'

  return (
    <div className="w-full">
      <Suspense fallback={null}>
        <WanderSearchScroll />
      </Suspense>

      {isSearchMode ? (
        <div id="wander-explore" className="border-t border-border/50 scroll-mt-4">
          <Suspense fallback={<WanderExploreSkeleton />}>
            <WanderExploreSection sp={sp} searchBasePath={searchBasePath} />
          </Suspense>
        </div>
      ) : (
        <>
          <Suspense fallback={<WanderHeroSkeleton />}>
            <WanderHeroSection activeTab={activeTab} searchBasePath={searchBasePath} />
          </Suspense>
          <Suspense fallback={<WanderListingRowsSkeleton />}>
            <WanderListingRowsServer />
          </Suspense>
        </>
      )}
    </div>
  )
}
