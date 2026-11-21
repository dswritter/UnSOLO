import { Suspense } from 'react'
import { getListedActivityFilterOptions } from '@/lib/wander/wanderQueries'
import { WanderSearchBar } from '@/components/wander/WanderSearchBar'
import { ExploreCategoryChips, ExploreMobileTopBar, ExploreSearchDock } from './ExploreMobileChrome'

/**
 * Full Circle Explore header. Mobile: slim top bar + category chips, search docked at the bottom
 * (thumb reach). Desktop: the search panel alone. No visible title: the search and the photo-led
 * cards say what the page is; the heading stays for screen readers.
 */
export async function ExploreHeader() {
  let listedActivities: string[] = []
  try { listedActivities = await getListedActivityFilterOptions() } catch { /* offline/local: no activity list */ }
  return (
    <>
      <h1 className="sr-only">Find your circle: group trips, stays, rentals and activities</h1>
      <div className="md:hidden">
        <ExploreMobileTopBar />
        <div className="px-4 pt-1">
          <Suspense fallback={<div className="h-11" />}><ExploreCategoryChips /></Suspense>
        </div>
        <Suspense fallback={null}><ExploreSearchDock /></Suspense>
      </div>
      <div className="mx-auto w-full max-w-[1440px] hidden px-6 pt-4 md:block lg:px-10">
        <div className="fc-searchpanel">
          <WanderSearchBar listedActivities={listedActivities} variant="wander" layout="row" wanderSearchBasePath="/" className="max-w-none" />
        </div>
      </div>
    </>
  )
}
