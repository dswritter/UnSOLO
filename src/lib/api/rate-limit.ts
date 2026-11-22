import { ApiError } from './http'
import type { ApiContext } from './context'

/** Per-account limits from docs/revamp/product-spec.md §4. New = account < 7 days old. */
export const LIMITS = {
  post: { windowSec: 86_400, newMax: 3, max: 10 },
  comment: { windowSec: 3_600, newMax: 20, max: 60 },
  vote: { windowSec: 3_600, newMax: 120, max: 300 },
  join: { windowSec: 86_400, newMax: 10, max: 30 },
  report: { windowSec: 86_400, newMax: 20, max: 50 },
  upload: { windowSec: 3_600, newMax: 30, max: 120 },
  message: { windowSec: 60, newMax: 20, max: 40 },
  events: { windowSec: 60, newMax: 30, max: 60 },
  otp: { windowSec: 3_600, newMax: 5, max: 5 },
} as const

export async function enforceRateLimit(ctx: ApiContext, kind: keyof typeof LIMITS, subject?: string) {
  const cfg = LIMITS[kind]
  const who = subject ?? ctx.user?.id
  if (!who) return
  const createdAt = ctx.user?.created_at ? new Date(ctx.user.created_at).getTime() : Date.now()
  const isNew = Date.now() - createdAt < 7 * 86_400_000
  const max = isNew ? cfg.newMax : cfg.max
  try {
    const { data, error } = await ctx.service().rpc('hit_rate_limit', {
      p_key: `${kind}:${who}`,
      p_window_seconds: cfg.windowSec,
      p_max: max,
    })
    if (error) throw error
    if (data === false) {
      throw new ApiError('rate_limited', isNew
        ? 'New accounts have a lower limit for a few days. Try again later.'
        : 'You are doing that too often. Try again later.', { retryAfter: Math.min(cfg.windowSec, 3600) })
    }
  } catch (e) {
    if (e instanceof ApiError) throw e
    // Fail open on limiter infrastructure errors (e.g. migration not yet applied) — log only.
    console.warn('[rate-limit] limiter unavailable', (e as Error)?.message)
  }
}
