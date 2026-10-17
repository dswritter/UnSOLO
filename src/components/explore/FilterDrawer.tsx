'use client'

import { useRef, useSyncExternalStore } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import type { ServiceListingType } from '@/types'
import { ExploreFilterFields, useExploreFilterNav } from './ExploreSidebar'

const noopSubscribe = () => () => {}

interface FilterDrawerProps {
  isOpen: boolean
  onClose: () => void
  params: Record<string, string>
  activeTab: 'trips' | ServiceListingType
  resultCount: number
  /** True while results are re-filtering against the server. */
  isLoading?: boolean
  maxPackagePrice?: number
  basePath?: string
  /** Keep `search=1` on homepage search URLs */
  preserveWanderSearch?: boolean
}

export function FilterDrawer({
  isOpen,
  onClose,
  params,
  activeTab,
  resultCount,
  isLoading = false,
  basePath = '/',
}: FilterDrawerProps) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const drawerTrapRef = useRef<HTMLDivElement>(null)
  useFocusTrap(isOpen && mounted, drawerTrapRef)
  const { navigate, clearAll, activeCount } = useExploreFilterNav(params, basePath)

  if (!mounted || !isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={onClose} />

      <div
        ref={drawerTrapRef}
        className="absolute inset-y-0 left-0 z-50 flex w-80 max-w-[88vw] flex-col overflow-hidden bg-background shadow-lg animate-in slide-in-from-left-full duration-200 ease-out"
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="text-base font-bold">Filters</h2>
          {activeCount > 0 ? (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground">{activeCount}</span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1 transition-colors hover:bg-secondary"
            aria-label="Close filters"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <ExploreFilterFields params={params} activeTab={activeTab} navigate={navigate} />
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 border-t border-border p-3">
          <button
            type="button"
            onClick={clearAll}
            disabled={activeCount === 0}
            className="h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-primary-foreground"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isLoading ? 'Show results' : `Show ${resultCount} results`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
