/**
 * List price is what the traveler pays. Platform fee is taken from that amount (inclusive model);
 * host receives the remainder.
 */
export function splitInclusiveCommunityPayment(totalPaise: number, feePercent: number) {
  const pct = Math.min(100, Math.max(0, feePercent))
  const platformFeePaise = Math.round(totalPaise * (pct / 100))
  const hostPaise = totalPaise - platformFeePaise
  return { platformFeePaise, hostPaise }
}

/**
 * Discount-aware host earning split.
 *
 * Invariant: the host always earns `gross × (1 − fee%)`, regardless of promo codes,
 * referral credits, or wallet credits. All discounts come out of the platform's share.
 *
 * Example — ₹1000 list, 15% fee, ₹200 promo:
 *   hostPaise = 850, platformGrossPaise = 150, platformNetPaise = -50
 *   (platform eats the full promo; the ₹50 deficit is the platform's loss.)
 */
export function splitHostEarning(input: {
  grossPaise: number
  feePercent: number
  promoPaise?: number
  walletPaise?: number
}) {
  const pct = Math.min(100, Math.max(0, input.feePercent))
  const gross = Math.max(0, input.grossPaise)
  const promo = Math.max(0, input.promoPaise || 0)
  const wallet = Math.max(0, input.walletPaise || 0)

  const platformGrossPaise = Math.round(gross * (pct / 100))
  const hostPaise = gross - platformGrossPaise
  const platformNetPaise = platformGrossPaise - promo - wallet

  return {
    hostPaise,
    platformGrossPaise,
    platformNetPaise,
    promoPaise: promo,
    walletPaise: wallet,
  }
}
