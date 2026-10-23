'use client'

import { useEffect, useState } from 'react'
import { Users, Star, Compass, Smile, type LucideIcon } from 'lucide-react'
import type { AuthHeroMetrics } from '@/lib/wander/wanderQueries'
import {
  AUTH_METRICS_SESSION_KEY,
  AUTH_METRICS_STORAGE_KEY,
  needsAuthMetricsRefresh,
  parseAuthMetrics,
  readCachedAuthMetrics,
} from '@/lib/auth-metrics-cache'
import { cn } from '@/lib/utils'

type Metric = { id: string; value: string; label: string; icon: LucideIcon }

const FETCH_TIMEOUT_MS = 8000

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M+`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K+`
  return `${n}+`
}

/** Hides unavailable or zero values rather than advertising placeholder numbers. */
export function authMetricItems(m: AuthHeroMetrics): Metric[] {
  const items: Metric[] = []
  if (m.travellers > 0) items.push({ id: 'travellers', value: compact(m.travellers), label: 'Travellers', icon: Users })
  if (m.hosts > 0) items.push({ id: 'hosts', value: compact(m.hosts), label: 'Hosts', icon: Compass })
  if (m.rating !== null && m.reviewCount > 0) {
    items.push({ id: 'rating', value: m.rating.toFixed(1), label: `${m.reviewCount} reviews`, icon: Star })
  }
  if (m.happyPercent > 0) items.push({ id: 'happy', value: `${m.happyPercent}%`, label: 'Happy', icon: Smile })
  return items
}

const ROW = 'flex w-full items-stretch divide-x divide-foreground/10 rounded-2xl border border-foreground/10 bg-card/45 backdrop-blur-md'

export function AuthMetricsRow({ items, className }: { items: Metric[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <ul aria-label="Unsolo community" className={cn(ROW, className)}>
      {items.map(({ id, value, label, icon: Icon }) => (
        <li key={id} className="flex min-w-0 flex-1 flex-col items-center justify-center px-1 py-2 text-center lg:py-3">
          <span className="flex items-center gap-1 text-[15px] font-extrabold leading-none tabular-nums text-foreground lg:text-xl">
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary lg:h-4 lg:w-4" aria-hidden strokeWidth={2.25} />
            {value}
          </span>
          <span className="mt-1 truncate text-[10px] font-medium uppercase tracking-wide text-foreground/60 lg:text-[11px]">
            {label}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function AuthMetricsSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn(ROW, 'h-[50px] lg:h-[66px]', className)}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex flex-1 flex-col items-center justify-center gap-1.5">
          <div className="h-3 w-10 animate-pulse rounded bg-foreground/15" />
          <div className="h-2 w-12 animate-pulse rounded bg-foreground/10" />
        </div>
      ))}
    </div>
  )
}

function isReloadNavigation() {
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined
  return nav?.type === 'reload'
}

type State = { status: 'loading' } | { status: 'ready'; metrics: AuthHeroMetrics } | { status: 'unavailable' }

/** Shows the browser-cached copy instantly and only refetches when it is due. */
export function AuthMetrics({ className }: { className?: string }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cached = null
    let sessionSeen = false
    try {
      cached = readCachedAuthMetrics(localStorage)
      sessionSeen = sessionStorage.getItem(AUTH_METRICS_SESSION_KEY) === '1'
    } catch { /* storage blocked: fall back to network */ }
    // Hydrating from browser storage is an external-system sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setState({ status: 'ready', metrics: cached.metrics })
    if (!needsAuthMetricsRefresh({ cached, now: Date.now(), sessionSeen, reload: isReloadNavigation() })) return

    let disposed = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    fetch('/api/auth-metrics', { signal: controller.signal })
      .then(res => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        const metrics = parseAuthMetrics(body)
        if (!metrics) throw new Error('Invalid metrics response')
        try {
          localStorage.setItem(AUTH_METRICS_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), metrics }))
          sessionStorage.setItem(AUTH_METRICS_SESSION_KEY, '1')
        } catch { /* storage full or blocked */ }
        if (!disposed) setState({ status: 'ready', metrics })
      })
      .catch(() => {
        // Keep showing an older copy; otherwise drop the row rather than spin forever.
        if (!disposed && !cached) setState({ status: 'unavailable' })
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      disposed = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  if (state.status === 'loading') return <AuthMetricsSkeleton className={className} />
  if (state.status === 'unavailable') return null
  return <AuthMetricsRow items={authMetricItems(state.metrics)} className={className} />
}
