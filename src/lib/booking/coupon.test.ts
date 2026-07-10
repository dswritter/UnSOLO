import { describe, it, expect } from 'vitest'
import { couponDiscountForOffer, rederiveBookingDiscount } from './coupon'

// Minimal fake matching the chain `.from(...).select(...).eq(...).maybeSingle()`
// used by couponDiscountForOffer — enough to unit test the eligibility logic
// without a real Supabase client.
function fakeClient(offerRow: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: offerRow }),
        }),
      }),
    }),
  } as never
}

const FREE_1_OF_6 = {
  discount_kind: 'free_guests',
  discount_paise: null,
  discount_percent: null,
  discount_percent_cap_paise: null,
  free_guest_count: 1,
  free_guests_min_group: 6,
}

describe('couponDiscountForOffer', () => {
  it('returns 0 when there is no offer id', async () => {
    const d = await couponDiscountForOffer(fakeClient(null), null, { grossPaise: 100_00, unitPricePaise: 10_00, quantity: 10 })
    expect(d).toBe(0)
  })

  it('free_guests: applies when quantity meets the minimum group', async () => {
    const d = await couponDiscountForOffer(fakeClient(FREE_1_OF_6), 'offer-1', {
      grossPaise: 6 * 10_00, unitPricePaise: 10_00, quantity: 6,
    })
    expect(d).toBe(10_00) // 1 free guest at unit price
  })

  it('free_guests: drops to 0 once quantity falls below the minimum group (the bug this fixes)', async () => {
    const d = await couponDiscountForOffer(fakeClient(FREE_1_OF_6), 'offer-1', {
      grossPaise: 4 * 10_00, unitPricePaise: 10_00, quantity: 4,
    })
    expect(d).toBe(0)
  })
})

describe('rederiveBookingDiscount', () => {
  it('coupon becomes ineligible after headcount drops below min group — non-coupon portion is preserved', async () => {
    // Original: 6 guests, gross 60,00 (unit 10,00), discount = 10,00 coupon + 5,00 referral = 15,00.
    const newDiscount = await rederiveBookingDiscount(fakeClient(FREE_1_OF_6), {
      promoOfferId: 'offer-1',
      currentDiscountPaise: 15_00,
      oldGrossPaise: 60_00, oldQuantity: 6, oldUnitPricePaise: 10_00,
      newGrossPaise: 40_00, newQuantity: 4, newUnitPricePaise: 10_00,
    })
    // oldCoupon (at qty=6) = 10,00 -> nonCoupon = 15,00 - 10,00 = 5,00 (the referral).
    // newCoupon (at qty=4) = 0 (below min group of 6).
    // newDiscount = 0 + 5,00 = 5,00 — referral survives, coupon correctly drops.
    expect(newDiscount).toBe(5_00)
  })

  it('coupon stays eligible when headcount still meets the minimum', async () => {
    const newDiscount = await rederiveBookingDiscount(fakeClient(FREE_1_OF_6), {
      promoOfferId: 'offer-1',
      currentDiscountPaise: 10_00,
      oldGrossPaise: 70_00, oldQuantity: 7, oldUnitPricePaise: 10_00,
      newGrossPaise: 60_00, newQuantity: 6, newUnitPricePaise: 10_00,
    })
    expect(newDiscount).toBe(10_00)
  })

  it('no offer id: whole discount is treated as non-coupon and preserved', async () => {
    const newDiscount = await rederiveBookingDiscount(fakeClient(null), {
      promoOfferId: null,
      currentDiscountPaise: 5_00,
      oldGrossPaise: 60_00, oldQuantity: 6, oldUnitPricePaise: 10_00,
      newGrossPaise: 40_00, newQuantity: 4, newUnitPricePaise: 10_00,
    })
    expect(newDiscount).toBe(5_00)
  })
})
