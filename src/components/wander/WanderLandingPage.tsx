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
import { ExploreViewSwitch } from '@/components/explore/ExploreViewSwitch'

function LeavingSoonSkeleton() {
  return (
    <div className="mx-auto mt-4 w-full max-w-[1440px] px-4 md:mt-8 md:px-6 lg:px-10" aria-hidden>
      <div className="pc-skel h-7 w-40" />
      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className={`pc-skel h-[380px] rounded-[28px] ${i === 0 ? '' : i === 1 ? 'hidden md:block' : i === 2 ? 'hidden lg:block' : 'hidden xl:block'}`} />)}</div>
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
          <ExploreViewSwitch initialView={sp.view === 'map' ? 'map' : 'list'} category={activeTab ?? 'all'}>
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
          </ExploreViewSwitch>
          {/* Room for the bottom search dock above the tab bar (mobile). */}
          <div className="h-24 md:hidden" aria-hidden />
        </>
      )}
    </div>
  )
}
