import { describe, expect, it } from 'vitest'
import { computeReleasableHostEarning } from '@/lib/host-releasable'
import { defaultHostRefundTiers } from '@/lib/refund-tiers'

describe('computeReleasableHostEarning', () => {
  const tiers = defaultHostRefundTiers()

  it('releases everything unpaid once the trip is past the refund window', () => {
    expect(computeReleasableHostEarning({ hostPaise: 10000, releasedPaise: 2500, travelDateIso: '2000-01-01', tiers }))
      .toMatchObject({ unpaidPaise: 7500, safePaise: 7500, currentRefundPct: 0, inZeroRefundWindow: true })
  })

  it('withholds the refundable share before travel and never goes negative', () => {
    const far = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const result = computeReleasableHostEarning({ hostPaise: 10000, releasedPaise: 9999, travelDateIso: far, tiers })
    expect(result.currentRefundPct).toBeGreaterThan(0)
    expect(result.safePaise).toBe(0)
    expect(result.unpaidPaise).toBe(1)
  })
})
