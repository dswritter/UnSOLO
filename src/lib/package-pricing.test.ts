import { describe, it, expect } from 'vitest'
import { recalcBookingTierTotals } from './package-pricing'

describe('recalcBookingTierTotals', () => {
  it('upgrades the tier and keeps the offer (fixed rupee amount) intact', () => {
    // 2 guests, old tier ₹1000pp → gross 2000; ₹300 offer → total 1700; paid 1700.
    // New tier ₹1500pp → gross 3000, offer still 300 → total 2700, balance 1000.
    const r = recalcBookingTierTotals({
      oldGrossPaise: 200000,
      discountPaise: 30000,
      oldUnitPaise: 100000,
      newUnitPaise: 150000,
      depositPaise: 170000,
    })
    expect(r.newGrossPaise).toBe(300000)
    expect(r.discountKeptPaise).toBe(30000)
    expect(r.newTotalPaise).toBe(270000)
    expect(r.balanceDuePaise).toBe(100000)
    expect(r.overpaidPaise).toBe(0)
  })

  it('downgrades below what was paid → flags an overpayment, no negative balance', () => {
    // gross 200000 paid in full (total 170000 after 30000 offer, paid 170000).
    // New cheaper tier ₹500pp → gross 100000, offer 30000 → total 70000.
    // Paid 170000 → overpaid 100000, balance 0.
    const r = recalcBookingTierTotals({
      oldGrossPaise: 200000,
      discountPaise: 30000,
      oldUnitPaise: 100000,
      newUnitPaise: 50000,
      depositPaise: 170000,
    })
    expect(r.newGrossPaise).toBe(100000)
    expect(r.newTotalPaise).toBe(70000)
    expect(r.balanceDuePaise).toBe(0)
    expect(r.overpaidPaise).toBe(100000)
  })

  it('preserves a multi-night/quantity structure via the price ratio', () => {
    // Stay: ₹2000/night × 3 nights = gross 600000, no discount, nothing paid.
    // Switch to ₹2500/night tier → gross 750000 (ratio 1.25 keeps the 3 nights).
    const r = recalcBookingTierTotals({
      oldGrossPaise: 600000,
      discountPaise: 0,
      oldUnitPaise: 200000,
      newUnitPaise: 250000,
      depositPaise: 0,
    })
    expect(r.newGrossPaise).toBe(750000)
    expect(r.newTotalPaise).toBe(750000)
  })

  it('caps the kept discount at the new gross (never negative total)', () => {
    const r = recalcBookingTierTotals({
      oldGrossPaise: 200000,
      discountPaise: 50000,
      oldUnitPaise: 100000,
      newUnitPaise: 20000, // new gross 40000 < 50000 discount
      depositPaise: 0,
    })
    expect(r.newGrossPaise).toBe(40000)
    expect(r.discountKeptPaise).toBe(40000)
    expect(r.newTotalPaise).toBe(0)
  })
})
