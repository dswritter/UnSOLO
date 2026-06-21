import { describe, it, expect } from 'vitest'
import { splitHostEarning, splitRefundPaise, splitInclusiveCommunityPayment } from './community-payment'

describe('splitInclusiveCommunityPayment', () => {
  it('takes the fee from the total (inclusive)', () => {
    expect(splitInclusiveCommunityPayment(100000, 15)).toEqual({ platformFeePaise: 15000, hostPaise: 85000 })
  })
  it('clamps fee percent to 0..100', () => {
    expect(splitInclusiveCommunityPayment(100000, -5).platformFeePaise).toBe(0)
    expect(splitInclusiveCommunityPayment(100000, 250).platformFeePaise).toBe(100000)
  })
})

describe('splitHostEarning', () => {
  it('host always earns gross × (1 − fee%), platform eats discounts', () => {
    // ₹1000 list, 15% fee, ₹200 promo → host 850, platformGross 150, platformNet −50
    const r = splitHostEarning({ grossPaise: 100000, feePercent: 15, promoPaise: 20000 })
    expect(r.hostPaise).toBe(85000)
    expect(r.platformGrossPaise).toBe(15000)
    expect(r.platformNetPaise).toBe(-5000)
  })
  it('subtracts both promo and wallet from the platform net only', () => {
    const r = splitHostEarning({ grossPaise: 100000, feePercent: 20, promoPaise: 5000, walletPaise: 3000 })
    expect(r.hostPaise).toBe(80000)
    expect(r.platformGrossPaise).toBe(20000)
    expect(r.platformNetPaise).toBe(12000)
  })
  it('never lets the host share depend on discounts', () => {
    const noDiscount = splitHostEarning({ grossPaise: 50000, feePercent: 10 })
    const withDiscount = splitHostEarning({ grossPaise: 50000, feePercent: 10, promoPaise: 9999, walletPaise: 1234 })
    expect(noDiscount.hostPaise).toBe(withDiscount.hostPaise)
  })
})

describe('splitRefundPaise', () => {
  it('refunds the tier % of each side', () => {
    const r = splitRefundPaise({ hostPaise: 85000, platformPaise: 15000, tierPercent: 50 })
    expect(r.hostRefundPaise).toBe(42500)
    expect(r.platformRefundPaise).toBe(7500)
    expect(r.totalRefundPaise).toBe(50000)
  })
  it('claws back from the host unpaid balance first', () => {
    // host refund 42500, only 30000 of host still unpaid → 30000 clawed, 12500 platform write-off
    const r = splitRefundPaise({ hostPaise: 85000, platformPaise: 15000, tierPercent: 50, alreadyReleasedPaise: 55000 })
    expect(r.hostClawbackPaise).toBe(30000)
    expect(r.platformWriteOffPaise).toBe(12500)
  })
  it('writes off the whole host refund when the host was already fully paid', () => {
    const r = splitRefundPaise({ hostPaise: 85000, platformPaise: 15000, tierPercent: 100, alreadyReleasedPaise: 85000 })
    expect(r.hostClawbackPaise).toBe(0)
    expect(r.platformWriteOffPaise).toBe(85000)
  })
  it('0% tier refunds nothing', () => {
    const r = splitRefundPaise({ hostPaise: 85000, platformPaise: 15000, tierPercent: 0 })
    expect(r.totalRefundPaise).toBe(0)
  })
})
