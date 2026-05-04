'use client'

import { ArrowUpDown, CalendarDays, KeyRound, Search, SlidersHorizontal } from 'lucide-react'
import type { ServiceListingType } from '@/types'

interface MobileExploreActionBarProps {
  activeTab: 'trips' | ServiceListingType
  onSearchClick: () => void
  onFilterClick: () => void
}

export function MobileExploreActionBar({
  activeTab,
  onSearchClick,
  onFilterClick,
}: MobileExploreActionBarProps) {
  const contextLabel =
    activeTab === 'trips'
      ? 'Month'
      : activeTab === 'stays'
        ? 'Dates'
        : activeTab === 'rentals'
          ? 'Budget'
          : activeTab === 'activities'
            ? 'Type'
            : 'Filters'

  return (
    <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 px-4 md:hidden">
      <div className="flex items-center overflow-hidden rounded-2xl border border-white/12 bg-zinc-950/94 shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <button
          onClick={onFilterClick}
          className="flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white"
          aria-label="Open filters"
        >
          <SlidersHorizontal className="h-4.5 w-4.5" />
          <span>Filters</span>
        </button>

        <div className="h-8 w-px bg-white/12" />
        <button
          onClick={onSearchClick}
          className="flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white"
          aria-label="Open search"
        >
          <Search className="h-4.5 w-4.5" />
          <span>Search</span>
        </button>

        <div className="h-8 w-px bg-white/12" />
        <button
          onClick={onFilterClick}
          className="flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white"
          aria-label={`Open ${contextLabel.toLowerCase()} filters`}
        >
          {activeTab === 'trips' || activeTab === 'stays' ? (
            <CalendarDays className="h-4.5 w-4.5" />
          ) : activeTab === 'rentals' ? (
            <KeyRound className="h-4.5 w-4.5" />
          ) : (
            <ArrowUpDown className="h-4.5 w-4.5" />
          )}
          <span>{contextLabel}</span>
        </button>
      </div>
    </div>
  )
}
