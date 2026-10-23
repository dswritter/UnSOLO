import type { AuthHeroMetrics } from '@/lib/wander/wanderQueries'

export const AUTH_METRICS_STORAGE_KEY = 'unsolo:auth-metrics:v1'
export const AUTH_METRICS_SESSION_KEY = 'unsolo:auth-metrics:session'
export const AUTH_METRICS_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type CachedAuthMetrics = { savedAt: number; metrics: AuthHeroMetrics }

function isMetrics(v: unknown): v is AuthHeroMetrics {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>
  return ['travellers', 'hosts', 'reviewCount', 'happyPercent'].every(k => typeof m[k] === 'number')
    && (m.rating === null || typeof m.rating === 'number')
}

export function readCachedAuthMetrics(storage: Pick<Storage, 'getItem'>): CachedAuthMetrics | null {
  try {
    const parsed = JSON.parse(storage.getItem(AUTH_METRICS_STORAGE_KEY) ?? 'null') as Partial<CachedAuthMetrics> | null
    return parsed && typeof parsed.savedAt === 'number' && isMetrics(parsed.metrics)
      ? { savedAt: parsed.savedAt, metrics: parsed.metrics }
      : null
  } catch {
    return null
  }
}

/**
 * Reuse the browser copy within a tab session; refresh on a reload, on a newly
 * opened tab/browser session, or once the copy is a day old.
 */
export function needsAuthMetricsRefresh({ cached, now, sessionSeen, reload }: {
  cached: CachedAuthMetrics | null
  now: number
  sessionSeen: boolean
  reload: boolean
}) {
  return !cached || reload || !sessionSeen || now - cached.savedAt >= AUTH_METRICS_MAX_AGE_MS
}

export function parseAuthMetrics(v: unknown): AuthHeroMetrics | null {
  return isMetrics(v) ? v : null
}
