import { describe, it, expect } from 'vitest'
import { perPersonFigures, allocateRefundAcrossPayments, computeGatewayFeeDeduction } from './refund-math'

describe('perPersonFigures', () => {
  it('splits a fully-paid booking evenly', () => {
    const f = perPersonFigures({ total_amount_paise: 500000, deposit_paise: 500000, guests: 5 }, 2)
    expect(f.perPersonValue).toBe(100000)
    expect(f.cancelledValue).toBe(200000)
    expect(f.collectedForCancelled).toBe(200000)
  })
  it('caps collectedForCancelled at what a token-only booking actually paid', () => {
    // 5 guests, ₹5000 total, only ₹1000 token collected → per-person collected = 200
    const f = perPersonFigures({ total_amount_paise: 500000, deposit_paise: 100000, guests: 5 }, 2)
    expect(f.collectedForCancelled).toBe(40000) // 2 × 200
    expect(f.cancelledValue).toBe(200000) // value still pro-rata of total
  })
  it('treats missing deposit as zero collected', () => {
    const f = perPersonFigures({ total_amount_paise: 500000, deposit_paise: null, guests: 5 }, 1)
    expect(f.collectedForCancelled).toBe(0)
  })
})

describe('allocateRefundAcrossPayments', () => {
  it('spreads a refund across token + balance captures', () => {
    const r = allocateRefundAcrossPayments([{ id: 'tok', amount: 100000 }, { id: 'bal', amount: 400000 }], 250000)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.allocations).toEqual([{ id: 'tok', amount: 100000 }, { id: 'bal', amount: 150000 }])
  })
  it('uses a single payment when it covers the refund', () => {
    const r = allocateRefundAcrossPayments([{ id: 'p1', amount: 500000 }], 120000)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.allocations).toEqual([{ id: 'p1', amount: 120000 }])
  })
  it('fails when the refund exceeds total captured', () => {
    const r = allocateRefundAcrossPayments([{ id: 'p1', amount: 100000 }], 150000)
    expect(r.ok).toBe(false)
  })
})

describe('computeGatewayFeeDeduction', () => {
  it('deducts the real fee proportionally on a full refund', () => {
    // paid 100000, fee 2000 → 100% refund deducts the whole 2000
    const r = computeGatewayFeeDeduction({
      payments: [{ id: 'p1', amount: 100000, fee: 2000 }],
      grossRefundPaise: 100000,
      deductEnabled: true,
    })
    expect(r.gatewayFeePaise).toBe(2000)
    expect(r.netRefundPaise).toBe(98000)
  })
  it('deducts proportionally on a partial refund', () => {
    // fee ratio 2% → 50% refund (50000) deducts 1000
    const r = computeGatewayFeeDeduction({
      payments: [{ id: 'p1', amount: 100000, fee: 2000 }],
      grossRefundPaise: 50000,
      deductEnabled: true,
    })
    expect(r.gatewayFeePaise).toBe(1000)
    expect(r.netRefundPaise).toBe(49000)
  })
  it('uses the fallback percent when a fee is unknown', () => {
    const r = computeGatewayFeeDeduction({
      payments: [{ id: 'p1', amount: 100000 }],
      grossRefundPaise: 100000,
      deductEnabled: true,
      fallbackPercent: 2,
    })
    expect(r.gatewayFeePaise).toBe(2000)
  })
  it('mixes a real-fee (UPI ₹0) and a fallback payment correctly', () => {
    // UPI captured 60000 fee 0; card captured 40000 fee unknown → fallback 2% = 800
    // totalFee 800, onlinePaid 100000, ratio 0.8% → full refund deducts 800
    const r = computeGatewayFeeDeduction({
      payments: [{ id: 'upi', amount: 60000, fee: 0 }, { id: 'card', amount: 40000 }],
      grossRefundPaise: 100000,
      deductEnabled: true,
      fallbackPercent: 2,
    })
    expect(r.totalFeePaise).toBe(800)
    expect(r.gatewayFeePaise).toBe(800)
    expect(r.netRefundPaise).toBe(99200)
  })
  it('deducts nothing when the toggle is off', () => {
    const r = computeGatewayFeeDeduction({
      payments: [{ id: 'p1', amount: 100000, fee: 2000 }],
      grossRefundPaise: 100000,
      deductEnabled: false,
    })
    expect(r.gatewayFeePaise).toBe(0)
    expect(r.netRefundPaise).toBe(100000)
  })
  it('never deducts more than the gross refund', () => {
    const r = computeGatewayFeeDeduction({
      payments: [{ id: 'p1', amount: 100000, fee: 100000 }],
      grossRefundPaise: 5000,
      deductEnabled: true,
    })
    expect(r.gatewayFeePaise).toBeLessThanOrEqual(5000)
    expect(r.netRefundPaise).toBeGreaterThanOrEqual(0)
  })
})
