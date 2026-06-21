/**
 * Pure, side-effect-free refund arithmetic. No Supabase, no network, no 'use server'
 * — so it can be unit-tested directly and reused by the server actions.
 *
 * All amounts are integer paise.
 */

export type CapturedPayment = {
  /** Razorpay payment id. */
  id: string
  /** Amount captured by this payment, in paise. */
  amount: number
  /** Razorpay's all-in fee on this payment (incl. GST), in paise, if known. */
  fee?: number
}

/**
 * Per-person figures for cancelling `count` travellers from a booking.
 * `collectedForCancelled` is capped at what was actually collected, so a
 * token-only booking never refunds more than was paid.
 */
export function perPersonFigures(
  booking: { total_amount_paise: number; deposit_paise?: number | null; guests: number },
  count: number,
) {
  const total = booking.total_amount_paise || 0
  const collected = booking.deposit_paise || 0
  const guests = Math.max(1, booking.guests || 1)
  const perPersonValue = Math.round(total / guests)
  const perPersonCollected = Math.round(collected / guests)
  const cancelledValue = perPersonValue * count
  const collectedForCancelled = Math.min(collected, perPersonCollected * count)
  return { total, collected, guests, perPersonValue, perPersonCollected, cancelledValue, collectedForCancelled }
}

/**
 * Allocate a refund total across captured payments. Each payment can only be
 * refunded up to the amount it captured (Razorpay refunds are per-payment), so a
 * token + balance booking must spread the refund across both. Allocates greedily
 * in capture order. Pure: returns the per-payment amounts; the caller issues them.
 */
export function allocateRefundAcrossPayments(
  payments: CapturedPayment[],
  totalRefundPaise: number,
):
  | { ok: true; allocations: Array<{ id: string; amount: number }> }
  | { ok: false; error: string; allocations: Array<{ id: string; amount: number }> } {
  const allocations: Array<{ id: string; amount: number }> = []
  let remaining = Math.max(0, Math.round(totalRefundPaise))
  for (const p of payments) {
    if (remaining <= 0) break
    const amount = Math.min(remaining, Math.max(0, Math.round(p.amount || 0)))
    if (amount <= 0) continue
    allocations.push({ id: p.id, amount })
    remaining -= amount
  }
  if (remaining > 0) {
    return {
      ok: false,
      error: `Refund exceeds captured payments by ₹${(remaining / 100).toLocaleString('en-IN')}.`,
      allocations,
    }
  }
  return { ok: true, allocations }
}

/**
 * Deduct non-refundable payment-gateway charges from a gross refund.
 *
 * Uses the actual per-payment `fee` when known (method-specific: UPI ~0, cards ~2%),
 * falling back to `fallbackPercent` of the payment amount otherwise. The fee is
 * applied proportionally to the portion being refunded:
 *   feeRatio = totalFee / onlinePaid;  gatewayFee = round(gross × feeRatio)
 * so a 100% refund deducts the whole fee and a 50% refund deducts half.
 *
 * Wallet/credit-paid portions carry no fee because they are not in `payments`.
 */
export function computeGatewayFeeDeduction(input: {
  payments: CapturedPayment[]
  grossRefundPaise: number
  deductEnabled: boolean
  fallbackPercent?: number
}): { onlinePaidPaise: number; totalFeePaise: number; gatewayFeePaise: number; netRefundPaise: number } {
  const gross = Math.max(0, Math.round(input.grossRefundPaise))
  const fallback = Math.max(0, input.fallbackPercent ?? 0)
  const onlinePaidPaise = input.payments.reduce((s, p) => s + Math.max(0, Math.round(p.amount || 0)), 0)
  const totalFeePaise = input.payments.reduce((s, p) => {
    const fee = typeof p.fee === 'number' ? p.fee : Math.round(Math.max(0, p.amount || 0) * (fallback / 100))
    return s + Math.max(0, Math.round(fee))
  }, 0)

  if (!input.deductEnabled || onlinePaidPaise <= 0 || totalFeePaise <= 0) {
    return { onlinePaidPaise, totalFeePaise, gatewayFeePaise: 0, netRefundPaise: gross }
  }

  const feeRatio = totalFeePaise / onlinePaidPaise
  const gatewayFeePaise = Math.min(gross, Math.round(gross * feeRatio))
  const netRefundPaise = Math.max(0, gross - gatewayFeePaise)
  return { onlinePaidPaise, totalFeePaise, gatewayFeePaise, netRefundPaise }
}
