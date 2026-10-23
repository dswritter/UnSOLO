import { describe, expect, it } from 'vitest'
import { planDepositSettlement } from './rental-deposit'

describe('rental deposit settlement', () => {
  it('refunds the full deposit when nothing is kept', () => {
    expect(planDepositSettlement(200000, 0, '')).toEqual({ refundPaise: 200000, retainPaise: 0, status: 'refunded' })
  })
  it('keeps part of the deposit with a reason', () => {
    expect(planDepositSettlement(200000, 40000, 'Late return 2 hrs'))
      .toEqual({ refundPaise: 160000, retainPaise: 40000, status: 'partially_refunded' })
    expect(planDepositSettlement(200000, 200000, 'Damage')).toMatchObject({ refundPaise: 0, status: 'retained' })
  })
  it('validates the amount and requires a reason', () => {
    expect(planDepositSettlement(200000, 40000, ' ')).toEqual({ error: 'Add a reason for keeping part of the deposit' })
    expect(planDepositSettlement(200000, 250000, 'x')).toEqual({ error: 'Retained amount cannot exceed the deposit' })
    expect(planDepositSettlement(200000, -1, 'x')).toEqual({ error: 'Retained amount cannot be negative' })
    expect(planDepositSettlement(0, 0, '')).toEqual({ error: 'No security deposit is held on this booking' })
  })
})
