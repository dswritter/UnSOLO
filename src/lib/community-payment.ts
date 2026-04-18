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
