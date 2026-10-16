import { currentRefundPercent, type RefundTier } from '@/lib/refund-tiers'

export type ReleasableHostEarning = {
  hostPaise: number
  releasedPaise: number
  unpaidPaise: number
  safePaise: number
  currentRefundPct: number
  inZeroRefundWindow: boolean
  travelDateIso: string | null
}

/** Safe advance = host share that can't be clawed back at today's refund percent. */
export function computeReleasableHostEarning(input: {
  hostPaise: number
  releasedPaise: number | null
  travelDateIso: string | null
  tiers: RefundTier[]
}): ReleasableHostEarning {
  const currentRefundPct = input.travelDateIso ? currentRefundPercent(input.travelDateIso, input.tiers) : 0
  const releasedPaise = input.releasedPaise || 0
  const safePaise = Math.floor(input.hostPaise * (1 - currentRefundPct / 100)) - releasedPaise
  return {
    hostPaise: input.hostPaise,
    releasedPaise,
    unpaidPaise: Math.max(0, input.hostPaise - releasedPaise),
    safePaise: Math.max(0, safePaise),
    currentRefundPct,
    inZeroRefundWindow: currentRefundPct <= 0,
    travelDateIso: input.travelDateIso,
  }
}
