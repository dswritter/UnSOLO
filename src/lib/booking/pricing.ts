/**
 * The single source of truth for a booking's money identity.
 *
 * Every mutation (tier change, coupon change, partial cancellation, …) derives a
 * gross for its own domain (unit × count, proportional rescale, etc.) and then
 * MUST route the final money derivation through here, so the invariant
 *   total = clamp(gross − discount)   ·   balance/overpay = total vs collected
 * is computed in exactly one place instead of being re-implemented per action.
 *
 * Pure and side-effect-free — unit-tested in pricing.test.ts.
 */

export type BookingTotals = {
  grossPaise: number
  discountPaise: number
  totalPaise: number
  balanceDuePaise: number
  overpaidPaise: number
}

export function computeBookingTotals(input: {
  /** Pre-discount gross (caller computes this for its domain). */
  grossPaise: number
  /** Total discount to keep (coupon + non-coupon). Clamped to gross. */
  discountPaise?: number
  /** Cash collected so far (deposit_paise). Drives balance vs overpayment. */
  collectedPaise?: number
}): BookingTotals {
  const grossPaise = Math.max(0, Math.round(input.grossPaise))
  const collected = Math.max(0, Math.round(input.collectedPaise ?? 0))
  const discountPaise = Math.max(0, Math.min(Math.round(input.discountPaise ?? 0), grossPaise))
  const totalPaise = Math.max(0, grossPaise - discountPaise)
  const balanceDuePaise = Math.max(0, totalPaise - collected)
  const overpaidPaise = Math.max(0, collected - totalPaise)
  return { grossPaise, discountPaise, totalPaise, balanceDuePaise, overpaidPaise }
}

/** Gross for a unit-priced booking: per-person / per-unit price × count. */
export function bookingGrossPaise(unitPricePaise: number, count: number): number {
  return Math.max(0, Math.round(unitPricePaise)) * Math.max(0, Math.round(count))
}
