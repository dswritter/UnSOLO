'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ArrowRight, Mountain } from 'lucide-react'
import {
  readRecentlyViewedPackages,
  type RecentlyViewedPackage,
} from '@/lib/explore/recently-viewed-packages'
import { storageThumbnailUrl } from '@/lib/images/storageThumbUrl'
import { wanderSearchHref } from '@/lib/routing/wanderLandingPath'

const EMPTY: RecentlyViewedPackage[] = []
let cachedRaw: string | null = null
let cachedItems: RecentlyViewedPackage[] = EMPTY

function snapshot(): RecentlyViewedPackage[] {
  const items = readRecentlyViewedPackages()
  const raw = JSON.stringify(items)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedItems = items
  }
  return cachedItems
}

const noopSubscribe = () => () => {}

/** Desktop home panel: the last few trips the visitor opened (`rv_packages`). */
export function WanderContinuePanel() {
  const items = useSyncExternalStore(noopSubscribe, snapshot, () => EMPTY).slice(0, 3)

  return (
    <div className="glass-card flex h-full flex-col gap-3 p-5">
      <h3 className="text-base font-black tracking-tight text-foreground">Pick up where you left off</h3>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-2 rounded-xl border border-dashed border-border p-4">
          <p className="text-sm text-muted-foreground">Trips you open will show up here so you can compare them later.</p>
          <Link
            href={wanderSearchHref({ tab: 'trips' })}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            Browse all trips <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((rv) => (
            <li key={rv.id}>
              <Link
                href={`/packages/${rv.slug}`}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/50 p-2 transition-colors hover:border-primary/60"
              >
                {rv.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={storageThumbnailUrl(rv.image) || rv.image} alt="" className="h-11 w-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg bg-foreground/5">
                    <Mountain className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">{rv.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{rv.destName}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
