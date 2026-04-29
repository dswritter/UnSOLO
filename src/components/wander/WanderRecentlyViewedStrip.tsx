'use client'

import { useEffect, useState } from 'react'
import { Mountain, X } from 'lucide-react'
import {
  readRecentlyViewedPackages,
  removeRecentlyViewedPackage,
  type RecentlyViewedPackage,
} from '@/lib/explore/recently-viewed-packages'

/**
 * Homepage “recently viewed packages” strip (`rv_packages`), shown above curated rows when not in search mode.
 */
export function WanderRecentlyViewedStrip() {
  const [items, setItems] = useState<RecentlyViewedPackage[]>([])

  useEffect(() => {
    setItems(readRecentlyViewedPackages())
  }, [])

  if (items.length === 0) return null

  return (
    <div className="mb-6 md:mb-8 rounded-2xl border border-white/15 bg-white/[0.06] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-md md:p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full border border-[#fcba03]/40 bg-[#fcba03]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#fcba03]">
          Recently viewed
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {items.map(rv => (
          <div key={rv.id} className="group/rv relative flex-shrink-0">
            <button
              type="button"
              onClick={() => window.open(`/packages/${rv.slug}`, '_blank', 'noopener,noreferrer')}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-[oklch(0.16_0.035_150)]/90 px-3 py-2 pr-7 text-left transition-colors hover:border-[#fcba03]/40"
            >
              {rv.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rv.image} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/5">
                  <Mountain className="h-4 w-4 text-white/40" />
                </div>
              )}
              <div>
                <p className="max-w-[120px] truncate text-xs font-semibold text-white">{rv.title}</p>
                <p className="max-w-[120px] truncate text-[10px] text-white/55">{rv.destName}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                removeRecentlyViewedPackage(rv.id)
                setItems(prev => prev.filter(p => p.id !== rv.id))
              }}
              className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-black/50 opacity-0 transition-opacity hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-400 group-hover/rv:opacity-100"
              aria-label="Remove from recently viewed"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
