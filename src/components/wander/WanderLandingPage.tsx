import { Suspense } from 'react'
import { WanderExploreSection } from '@/components/wander/WanderExploreSection'
import { WanderExploreInstantFallback } from '@/components/wander/WanderExploreInstantFallback'
import { WanderSearchScroll } from '@/components/wander/WanderSearchScroll'
import { ExploreHeader } from '@/components/explore/fc/ExploreHeader'
import {
  WanderListingRowsServer,
  WanderListingRowsSkeleton,
} from '@/components/wander/WanderListingRowsServer'
import { TribeBridgeRow } from '@/components/tribe/TribeBridgeRow'
import { DeparturesTable } from '@/components/tribe/DeparturesTable'

function LeavingSoonSkeleton() {
  return (
    <div className="mx-auto mt-6 max-w-[1280px] px-4 md:px-6" aria-hidden>
      <div className="pc-skel h-7 w-40" />
      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3"><div className="pc-skel h-[360px] rounded-[28px]" /><div className="pc-skel hidden h-[360px] rounded-[28px] md:block" /><div className="pc-skel hidden h-[360px] rounded-[28px] md:block" /></div>
    </div>
  )
}

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
          {/* No `key`: filter changes are transitions, so the current results stay
              mounted and re-filter client-side while the server responds. */}
          <Suspense fallback={<WanderExploreInstantFallback sp={sp} />}>
            <WanderExploreSection sp={sp} searchBasePath={searchBasePath} />
          </Suspense>
        </div>
      ) : (
        <>
          <Suspense fallback={<div className="h-40" />}>
            <ExploreHeader />
          </Suspense>
          {/* Trips (default): departures and plans lead. Another category: its listings lead instead. */}
          {!activeTab || activeTab === 'trips' ? (
            <>
              <Suspense fallback={<LeavingSoonSkeleton />}>
                <DeparturesTable aside={<TribeBridgeRow layout="aside" />} />
              </Suspense>
              <Suspense fallback={null}>
                <TribeBridgeRow />
              </Suspense>
            </>
          ) : null}
          <Suspense fallback={<WanderListingRowsSkeleton />}>
            <WanderListingRowsServer activeTab={activeTab} />
          </Suspense>
          {/* Room for the bottom search dock above the tab bar (mobile). */}
          <div className="h-24 md:hidden" aria-hidden />
        </>
      )}
    </div>
  )
}
