import { describe, it, expect } from 'vitest'
import { computeBookingTotals, bookingGrossPaise } from './pricing'

describe('computeBookingTotals', () => {
  it('total = gross − discount, no deposit', () => {
    expect(computeBookingTotals({ grossPaise: 100_00, discountPaise: 20_00 })).toEqual({
      grossPaise: 100_00,
      discountPaise: 20_00,
      totalPaise: 80_00,
      balanceDuePaise: 80_00,
      overpaidPaise: 0,
    })
  })

  it('no discount defaults to 0', () => {
    const t = computeBookingTotals({ grossPaise: 50_00 })
    expect(t.discountPaise).toBe(0)
    expect(t.totalPaise).toBe(50_00)
  })

  it('clamps discount to gross (never negative total)', () => {
    const t = computeBookingTotals({ grossPaise: 30_00, discountPaise: 50_00 })
    expect(t.discountPaise).toBe(30_00)
    expect(t.totalPaise).toBe(0)
  })

  it('derives balance when partly collected', () => {
    const t = computeBookingTotals({ grossPaise: 100_00, discountPaise: 10_00, collectedPaise: 40_00 })
    expect(t.totalPaise).toBe(90_00)
    expect(t.balanceDuePaise).toBe(50_00)
    expect(t.overpaidPaise).toBe(0)
  })

  it('derives overpayment when collected exceeds the new total', () => {
    // e.g. a tier downgrade / partial cancel after full payment
    const t = computeBookingTotals({ grossPaise: 60_00, discountPaise: 0, collectedPaise: 100_00 })
    expect(t.totalPaise).toBe(60_00)
    expect(t.balanceDuePaise).toBe(0)
    expect(t.overpaidPaise).toBe(40_00)
  })

  it('fully paid → zero balance, zero overpay', () => {
    const t = computeBookingTotals({ grossPaise: 100_00, discountPaise: 0, collectedPaise: 100_00 })
    expect(t.balanceDuePaise).toBe(0)
    expect(t.overpaidPaise).toBe(0)
  })

  it('rounds fractional paise and floors negatives at 0', () => {
    const t = computeBookingTotals({ grossPaise: 99.6, discountPaise: -5, collectedPaise: -10 })
    expect(t.grossPaise).toBe(100)
    expect(t.discountPaise).toBe(0)
    expect(t.totalPaise).toBe(100)
    expect(t.balanceDuePaise).toBe(100)
  })
})

describe('bookingGrossPaise', () => {
  it('unit × count', () => {
    expect(bookingGrossPaise(2500, 4)).toBe(10_000)
  })
  it('floors negatives and rounds', () => {
    expect(bookingGrossPaise(-100, 3)).toBe(0)
    expect(bookingGrossPaise(100.4, 2)).toBe(200)
  })
})
