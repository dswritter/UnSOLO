'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { WanderListingSections } from '@/components/wander/WanderListingSections'
import { WANDER_TAB_CHANGE_EVENT } from '@/components/wander/WanderMobileTabNav'
import type { Package, ServiceListing } from '@/types'

type ActivityWithItems = ServiceListing & {
  items: Array<{ id: string; name: string; price_paise: number; images: string[]; unit: string | null }>
}
type RentalWithItems = ActivityWithItems

/**
 * Thin client wrapper so the active-tab ordering of WanderListingSections
 * is derived from the URL on the client. This makes tab clicks feel instant —
 * sections reorder immediately without waiting for a server re-render.
 */
export function WanderListingsSectionsWrapper({
  trips,
  tripInterestCounts,
  spotsBookedByTrip,
  interestedPackageIds,
  stays,
  activities,
  rentals,
  interludeSlot,
}: {
  trips: Package[]
  tripInterestCounts?: Record<string, number>
  spotsBookedByTrip?: Record<string, number>
  interestedPackageIds?: string[]
  stays: ActivityWithItems[]
  activities: ActivityWithItems[]
  rentals: RentalWithItems[]
  interludeSlot?: React.ReactNode
}) {
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab')
  const confirmedTab: 'trips' | 'stays' | 'activities' | 'rentals' | null =
    urlTab === 'trips' || urlTab === 'stays' || urlTab === 'activities' || urlTab === 'rentals'
      ? urlTab
      : null

  // Optimistic tab — updated immediately via DOM event so sections reorder
  // before the URL/server re-render catches up.
  const [pendingTab, setPendingTab] = useState<typeof confirmedTab>(null)
  useEffect(() => {
    function onTabChange(e: Event) {
      const next = (e as CustomEvent<string>).detail
      if (next === 'trips' || next === 'stays' || next === 'activities' || next === 'rentals') {
        setPendingTab(next)
      }
    }
    window.addEventListener(WANDER_TAB_CHANGE_EVENT, onTabChange)
    return () => window.removeEventListener(WANDER_TAB_CHANGE_EVENT, onTabChange)
  }, [])
  // Clear optimistic once URL catches up
  useEffect(() => {
    if (confirmedTab === pendingTab) setPendingTab(null)
  }, [confirmedTab, pendingTab])

  const activeTab = pendingTab ?? confirmedTab

  return (
    <WanderListingSections
      trips={trips}
      tripInterestCounts={tripInterestCounts}
      spotsBookedByTrip={spotsBookedByTrip}
      interestedPackageIds={interestedPackageIds}
      stays={stays}
      activities={activities}
      rentals={rentals}
      activeTab={activeTab}
      interludeSlot={interludeSlot}
    />
  )
}
