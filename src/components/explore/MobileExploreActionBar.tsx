'use client'

import { Search, SlidersHorizontal } from 'lucide-react'

interface MobileExploreActionBarProps {
  onSearchClick: () => void
  onFilterClick: () => void
}

export function MobileExploreActionBar({
  onSearchClick,
  onFilterClick,
}: MobileExploreActionBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 md:hidden bg-secondary border-t border-border flex items-center justify-between px-4 py-3 z-40 safe-bottom">
      {/* Search button */}
      <button
        onClick={onSearchClick}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-background text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors"
        aria-label="Open search"
      >
        <Search className="h-5 w-5" />
        <span className="text-sm font-medium">Search</span>
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-border mx-2" />

      {/* Filter button */}
      <button
        onClick={onFilterClick}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-background text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors"
        aria-label="Open filters"
      >
        <SlidersHorizontal className="h-5 w-5" />
        <span className="text-sm font-medium">Filters</span>
      </button>
    </div>
  )
}
