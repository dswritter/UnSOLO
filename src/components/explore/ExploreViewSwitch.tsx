'use client'

import { useState, type ReactNode } from 'react'
import { List, Map as MapIcon } from 'lucide-react'
import { ExploreMapView } from './ExploreMapView'

type Category = 'all' | 'trips' | 'stays' | 'activities' | 'rentals'

/**
 * List / Map toggle for Explore. The list (server-rendered children) stays mounted while the map
 * is shown, so switching back is instant. `?view=map` keeps the choice in the link.
 */
export function ExploreViewSwitch({ children, initialView = 'list', category = 'all' }: { children: ReactNode; initialView?: 'list' | 'map'; category?: Category }) {
  const [view, setView] = useState<'list' | 'map'>(initialView)

  function choose(next: 'list' | 'map') {
    setView(next)
    try {
      const url = new URL(window.location.href)
      if (next === 'map') url.searchParams.set('view', 'map')
      else url.searchParams.delete('view')
      window.history.replaceState(window.history.state, '', url.toString())
    } catch { /* ignore */ }
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1440px] justify-end px-4 pt-3 md:px-6 lg:px-10">
        <div role="group" aria-label="View as" className="inline-flex rounded-full border border-border bg-card p-1">
          {([['list', 'List', List], ['map', 'Map', MapIcon]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => choose(id)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors ${view === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4" aria-hidden />{label}
            </button>
          ))}
        </div>
      </div>
      {view === 'map' ? (
        <div className="mx-auto mt-3 w-full max-w-[1440px] px-4 md:px-6 lg:px-10">
          <ExploreMapView key={category} initialCategory={category} />
        </div>
      ) : null}
      <div hidden={view === 'map'}>{children}</div>
    </>
  )
}
