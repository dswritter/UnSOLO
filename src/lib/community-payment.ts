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

/**
 * Pro-rata refund split between host and platform.
 *
 * Fair-split rule: on cancellation, both host and platform give up the tier %
 * of their own share. The traveler's refund is `hostPaise × pct + platformPaise × pct`.
 * Neither side subsidises the other's share.
 *
 * Claw-back order for already-released host advances:
 *   1. First, deduct hostRefund from the host's unpaid balance.
 *   2. If unpaid balance is insufficient, the platform absorbs the shortfall
 *      (host is not pursued for money already sitting in their bank account).
 *
 * Inputs:
 *   - hostPaise: booked host share
 *   - platformPaise: booked platform share (gross, before promo/wallet)
 *   - tierPercent: 0..100
 *   - alreadyReleasedPaise: how much of hostPaise has been paid out so far
 */
export function splitRefundPaise(input: {
  hostPaise: number
  platformPaise: number
  tierPercent: number
  alreadyReleasedPaise?: number
}) {
  const pct = Math.min(100, Math.max(0, input.tierPercent)) / 100
  const hostPaise = Math.max(0, Math.round(input.hostPaise))
  const platformPaise = Math.max(0, Math.round(input.platformPaise))
  const released = Math.max(0, Math.round(input.alreadyReleasedPaise || 0))

  const hostRefundPaise = Math.round(hostPaise * pct)
  const platformRefundPaise = Math.round(platformPaise * pct)
  const totalRefundPaise = hostRefundPaise + platformRefundPaise

  const hostUnreleased = Math.max(0, hostPaise - released)
  const hostClawbackPaise = Math.min(hostRefundPaise, hostUnreleased)
  const platformWriteOffPaise = Math.max(0, hostRefundPaise - hostClawbackPaise)

  return {
    totalRefundPaise,
    hostRefundPaise,
    platformRefundPaise,
    hostClawbackPaise,
    platformWriteOffPaise,
  }
}
