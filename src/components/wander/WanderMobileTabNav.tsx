'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Compass, Home, Key, Plane } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'trips' | 'rentals' | 'activities' | 'stays'

const TABS: { id: Tab; label: string; icon: typeof Plane }[] = [
  { id: 'trips', label: 'Trips', icon: Plane },
  { id: 'rentals', label: 'Rentals', icon: Key },
  { id: 'activities', label: 'Activities', icon: Compass },
  { id: 'stays', label: 'Stays', icon: Home },
]

/**
 * Mobile listing-tab strip — lifted out of WanderMobileHeroSearch on
 * purpose. Sticky needs a *tall* parent or it scrolls away as soon as the
 * parent ends; rendered here as a top-level child of the landing page, the
 * tab nav's parent spans the entire scroll height of the route, so the
 * sticky `top-0` actually persists all the way down.
 *
 * The component reads/writes `?tab=` on the URL — same source the hero
 * card and the explore listing rows already use, so picking a tab here
 * shuffles the rows below and updates the search-card prompt without any
 * extra prop wiring.
 */
export function WanderMobileTabNav() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab')
  const tab: Tab | null =
    urlTab === 'trips' || urlTab === 'rentals' || urlTab === 'activities' || urlTab === 'stays'
      ? urlTab
      : null

  const setBrowseTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  return (
    <div className="md:hidden sticky top-0 z-40 -mt-7 px-3">
      <div className="rounded-2xl border border-white/16 bg-white/[0.07] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
        <div className="grid grid-cols-4 gap-1 px-1.5 py-1.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setBrowseTab(id)}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors',
                tab === id ? 'text-primary' : 'text-white/80 hover:text-white',
              )}
            >
              <Icon className="h-5 w-5 shrink-0 stroke-[2]" />
              <span className="text-[11px] font-semibold leading-tight tracking-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
