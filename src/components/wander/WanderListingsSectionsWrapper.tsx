'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { WANDER_TAB_CHANGE_EVENT } from '@/components/wander/WanderMobileTabNav'
import type { ReactNode } from 'react'

/**
 * Thin client wrapper so the active-tab ordering of WanderListingSections
 * is derived from the URL on the client. This makes tab clicks feel instant —
 * sections reorder immediately without waiting for a server re-render.
 */
export function WanderListingsSectionsWrapper({
  trips,
  stays,
  activities,
  rentals,
  interludeSlot,
}: {
  trips: ReactNode
  stays: ReactNode
  activities: ReactNode
  rentals: ReactNode
  interludeSlot?: ReactNode
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
    if (confirmedTab === pendingTab && pendingTab !== null) {
      const reset = window.setTimeout(() => setPendingTab(null), 0)
      return () => window.clearTimeout(reset)
    }
  }, [confirmedTab, pendingTab])

  const activeTab = pendingTab ?? confirmedTab

  const slots = { trips, stays, activities, rentals }
  const sectionOrder = ['trips', 'rentals', 'stays', 'activities'] as const
  const orderedTypes = activeTab
    ? [activeTab, ...sectionOrder.filter(type => type !== activeTab)]
    : [...sectionOrder]

  return <div className="space-y-8 md:space-y-10">
    {orderedTypes.map((type, index) => <div key={type} className="contents">
      {slots[type]}
      {index === 1 && interludeSlot ? <div key={`interlude-${index}`}>{interludeSlot}</div> : null}
    </div>)}
  </div>
}
