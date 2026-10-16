'use client'

import { useEffect, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react'
import { StatusStoriesBar } from '@/components/status/StatusStoriesBar'
import { useAuth } from '@/components/layout/AuthProvider'

type BarProps = ComponentProps<typeof StatusStoriesBar>
type Snapshot = { userId: string; bar?: BarProps; rank: number | null }

const KEY = 'unsolo:home-community:v1'

let cachedRaw: string | null | undefined
let cachedValue: Snapshot | null = null

function read(): Snapshot | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      cachedValue = raw ? (JSON.parse(raw) as Snapshot) : null
    } catch {
      cachedValue = null
    }
  }
  return cachedValue
}

function write(patch: Partial<Snapshot> & { userId: string }) {
  try {
    const prev = read()
    const base = prev && prev.userId === patch.userId ? prev : null
    const next = { rank: null, ...base, ...patch } as Snapshot
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage full or blocked — the live rail still renders */
  }
}

const noopSubscribe = () => () => {}

function useSnapshot(): Snapshot | null {
  const { userId, loading } = useAuth()
  const snap = useSyncExternalStore(noopSubscribe, read, () => null)
  if (!snap) return null
  if (!loading && snap.userId !== userId) return null
  return snap
}

export function StatusRailLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-row flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-4">
      <div className="w-[9.75rem] shrink-0 sm:w-[10.75rem]">
        <h3 className="text-sm font-bold leading-tight text-foreground">Traveler status</h3>
        <p className="mt-0.5 text-xs font-semibold leading-snug text-muted-foreground sm:text-[13px]">
          See what your
          <br />
          connections are up to.
        </p>
      </div>
      <div className="min-h-[3.5rem] min-w-0 flex-1 flex items-center pr-1 sm:pr-2">{children}</div>
    </div>
  )
}

/** Saves the latest rail so the next page load can paint it before the server answers. */
export function StatusRailCacheWriter({ bar }: { bar: BarProps }) {
  const json = JSON.stringify(bar)
  useEffect(() => {
    write({ userId: bar.currentUserId, bar: JSON.parse(json) as BarProps })
  }, [bar.currentUserId, json])
  return null
}

export function RankCacheWriter({ userId, rank }: { userId: string; rank: number | null }) {
  useEffect(() => {
    write({ userId, rank })
  }, [userId, rank])
  return null
}

/** Suspense fallback: last-known rail (own avatar, + button, stories), or empty rings on a first visit. */
export function CachedStatusRail() {
  const snap = useSnapshot()
  return (
    <StatusRailLayout>
      {snap?.bar ? (
        <StatusStoriesBar {...snap.bar} />
      ) : (
        <div className="flex gap-3" aria-label="Loading traveller stories">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-12 w-12 rounded-full border-2 border-border bg-foreground/[0.04]" />
          ))}
        </div>
      )}
    </StatusRailLayout>
  )
}

export function CachedRankLabel() {
  const snap = useSnapshot()
  return snap?.rank ? <>Leaderboard: you&apos;re #{snap.rank}</> : <>Leaderboard</>
}
