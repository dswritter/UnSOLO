import type { SupabaseClient } from '@supabase/supabase-js'
import { computeDiscountPaise, specFromRow, type PromoAmountContext } from '@/lib/checkout-promos'

/** Look up a discount offer and compute what it's currently worth for `amount` (0 if missing/ineligible). */
export async function couponDiscountForOffer(
  svc: SupabaseClient,
  offerId: string | null | undefined,
  amount: PromoAmountContext,
): Promise<number> {
  if (!offerId) return 0
  const { data: offer } = await svc
    .from('discount_offers')
    .select('discount_kind, discount_paise, discount_percent, discount_percent_cap_paise, free_guest_count, free_guests_min_group')
    .eq('id', offerId)
    .maybeSingle()
  if (!offer) return 0
  return computeDiscountPaise(specFromRow(offer as never), amount)
}

/**
 * Re-derive a booking's discount when its gross/quantity changes (tier change,
 * partial cancellation, manual recompute). Isolates the coupon-attributable
 * portion of the CURRENT discount (at the old gross/quantity) so a non-coupon
 * discount (e.g. referral) is preserved as-is, then re-computes the coupon at
 * the NEW gross/quantity — so an eligibility-gated coupon (e.g. "1 free of 6")
 * correctly drops to 0 once the party no longer qualifies, instead of just
 * being scaled down proportionally.
 *
 * Mirrors the inline pattern already used by adminSetBookingCoupon /
 * adminUpdateBookingPriceTier in actions/booking.ts — pulled out here so
 * partial-cancellation (and the manual recompute action) share the exact same
 * logic instead of a fourth reimplementation.
 */
export async function rederiveBookingDiscount(
  svc: SupabaseClient,
  input: {
    promoOfferId: string | null | undefined
    currentDiscountPaise: number
    oldGrossPaise: number
    oldQuantity: number
    oldUnitPricePaise: number
    newGrossPaise: number
    newQuantity: number
    newUnitPricePaise: number
  },
): Promise<number> {
  const oldCoupon = await couponDiscountForOffer(svc, input.promoOfferId, {
    grossPaise: input.oldGrossPaise, unitPricePaise: input.oldUnitPricePaise, quantity: input.oldQuantity,
  })
  const nonCoupon = Math.max(0, (input.currentDiscountPaise || 0) - oldCoupon)
  const newCoupon = await couponDiscountForOffer(svc, input.promoOfferId, {
    grossPaise: input.newGrossPaise, unitPricePaise: input.newUnitPricePaise, quantity: input.newQuantity,
  })
  return newCoupon + nonCoupon
}
