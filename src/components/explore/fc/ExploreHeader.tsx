import { Suspense } from 'react'
import { getListedActivityFilterOptions } from '@/lib/wander/wanderQueries'
import { WanderSearchBar } from '@/components/wander/WanderSearchBar'
import { ExploreCategoryChips, ExploreMobileTopBar, ExploreSearchDock } from './ExploreMobileChrome'

/**
 * Full Circle Explore header. Mobile: slim top bar + category chips, search docked at the bottom
 * (thumb reach). Desktop: title, category chips and the full search panel.
 */
export async function ExploreHeader() {
  let listedActivities: string[] = []
  try { listedActivities = await getListedActivityFilterOptions() } catch { /* offline/local: no activity list */ }
  return (
    <>
      <div className="md:hidden">
        <ExploreMobileTopBar />
        <div className="px-4 pt-1">
          <h1 className="text-[30px] leading-[1.05]">Find your circle</h1>
          <p className="mt-1 text-[14.5px] text-muted-foreground">Small group trips. See who’s going before you book.</p>
          <Suspense fallback={<div className="h-11" />}><ExploreCategoryChips className="mt-4" /></Suspense>
        </div>
        <Suspense fallback={null}><ExploreSearchDock /></Suspense>
      </div>
      <div className="mx-auto w-full max-w-[1440px] hidden px-6 pt-10 md:block lg:px-10">
        <h1 className="pc-display text-[46px]">Find your circle</h1>
        <p className="mt-2 text-[17px] text-muted-foreground">Small group trips across India. See who’s going before you book.</p>
        <div className="fc-searchpanel mt-6">
          <WanderSearchBar listedActivities={listedActivities} variant="wander" layout="row" wanderSearchBasePath="/" className="max-w-none" />
        </div>
      </div>
    </>
  )
}
