import { describe, it, expect } from 'vitest'
import { recalcBookingTierTotals } from './package-pricing'

// Helper mirroring adminUpdateBookingPriceTier's package path: gross = unit × guests.
const pkgGross = (unitPaise: number, guests: number) => unitPaise * guests

describe('recalcBookingTierTotals', () => {
  it('packages: total = new gross − kept discount; balance/overpaid follow', () => {
    const r = recalcBookingTierTotals({ newGrossPaise: 300000, discountPaise: 30000, depositPaise: 170000 })
    expect(r.newGrossPaise).toBe(300000)
    expect(r.newTotalPaise).toBe(270000)
    expect(r.balanceDuePaise).toBe(100000)
    expect(r.overpaidPaise).toBe(0)
  })

  it('flags overpayment when the new total is below what was paid', () => {
    const r = recalcBookingTierTotals({ newGrossPaise: 70000, discountPaise: 30000, depositPaise: 170000 })
    expect(r.newTotalPaise).toBe(40000)
    expect(r.balanceDuePaise).toBe(0)
    expect(r.overpaidPaise).toBe(130000)
  })

  it('caps the kept discount at the new gross (never negative total)', () => {
    const r = recalcBookingTierTotals({ newGrossPaise: 40000, discountPaise: 50000, depositPaise: 0 })
    expect(r.discountKeptPaise).toBe(40000)
    expect(r.newTotalPaise).toBe(0)
  })
})

// Regression: the exact numbers from the reported inflated-price bug. With the
// direct package formula (unit × guests) there is no ratio inflation.
describe('tier change — package gross (no ratio inflation)', () => {
  it('1 guest, 9,600 → 8,500 ⇒ total ₹8,500 (was wrongly unchanged)', () => {
    const r = recalcBookingTierTotals({ newGrossPaise: pkgGross(850000, 1), discountPaise: 0, depositPaise: 200000 })
    expect(r.newTotalPaise).toBe(850000)
    expect(r.balanceDuePaise).toBe(650000)
  })

  it('1 guest, 9,600 → 10,100 ⇒ total ₹10,100 (was wrongly ₹11,407)', () => {
    const r = recalcBookingTierTotals({ newGrossPaise: pkgGross(1010000, 1), discountPaise: 0, depositPaise: 200000 })
    expect(r.newTotalPaise).toBe(1010000)
    expect(r.balanceDuePaise).toBe(810000)
  })

  it('2 guests, 9,600pp → 8,500pp ⇒ total ₹17,000', () => {
    const r = recalcBookingTierTotals({ newGrossPaise: pkgGross(850000, 2), discountPaise: 0, depositPaise: 0 })
    expect(r.newTotalPaise).toBe(1700000)
  })

  it('6 guests, 1-free-guest coupon, ₹10,100pp ⇒ gross 60,600, discount 10,100, total 50,500', () => {
    const gross = pkgGross(1010000, 6) // 6,060,000 paise
    const freeGuestDiscount = 1010000 // 1 free guest at the new per-person price
    const r = recalcBookingTierTotals({ newGrossPaise: gross, discountPaise: freeGuestDiscount, depositPaise: 200000 })
    expect(r.newGrossPaise).toBe(6060000)
    expect(r.discountKeptPaise).toBe(1010000)
    expect(r.newTotalPaise).toBe(5050000)
  })
})
