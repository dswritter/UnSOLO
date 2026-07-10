import { describe, it, expect } from 'vitest'
import { summarizeLedger } from './ledger'

describe('summarizeLedger', () => {
  it('sums all payments', () => {
    const s = summarizeLedger([{ amount_paise: 10_00 }, { amount_paise: 40_00 }], [])
    expect(s.collectedPaise).toBe(50_00)
    expect(s.refundedPaise).toBe(0)
    expect(s.netCollectedPaise).toBe(50_00)
  })

  it('only counts COMPLETED refunds', () => {
    const s = summarizeLedger(
      [{ amount_paise: 100_00 }],
      [
        { amount_paise: 20_00, status: 'completed' },
        { amount_paise: 30_00, status: 'processing' }, // not yet counted
        { amount_paise: 5_00, status: 'failed' },
      ],
    )
    expect(s.collectedPaise).toBe(100_00)
    expect(s.refundedPaise).toBe(20_00)
    expect(s.netCollectedPaise).toBe(80_00)
  })

  it('handles empty ledgers', () => {
    expect(summarizeLedger([], [])).toEqual({ collectedPaise: 0, refundedPaise: 0, netCollectedPaise: 0 })
  })

  it('tolerates missing amounts', () => {
    const s = summarizeLedger(
      [{ amount_paise: undefined as unknown as number }, { amount_paise: 25_00 }],
      [{ amount_paise: undefined as unknown as number, status: 'completed' }],
    )
    expect(s.collectedPaise).toBe(25_00)
    expect(s.refundedPaise).toBe(0)
  })
})
