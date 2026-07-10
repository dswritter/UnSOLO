/**
 * Refund a total amount across one or more captured Razorpay payments.
 *
 * A payment can only be refunded up to what it captured, so a token + balance
 * booking must refund each payment separately. Allocates greedily in capture
 * order. Returns the refund ids created (including any created before a
 * mid-sequence failure, so callers can reconcile).
 *
 * Server-only helper (uses RAZORPAY_* env + fetch). Not a server action — the
 * two callers (full-booking + partial-cancellation refunds) share this one copy.
 */
export async function refundAcrossPayments(
  payments: Array<{ id: string; amount: number }>,
  totalRefundPaise: number,
  notes: Record<string, string>,
): Promise<{ ok: true; refundIds: string[] } | { ok: false; error: string; refundIds: string[] }> {
  const auth = `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`
  const refundIds: string[] = []
  let remaining = totalRefundPaise
  for (const p of payments) {
    if (remaining <= 0) break
    const amount = Math.min(remaining, p.amount || 0)
    if (amount <= 0) continue
    const resp = await fetch(`https://api.razorpay.com/v1/payments/${p.id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ amount, notes }),
    })
    const result = (await resp.json()) as { id?: string; error?: { description?: string } }
    if (!resp.ok) {
      return { ok: false, error: result.error?.description || 'Razorpay refund failed', refundIds }
    }
    if (result.id) refundIds.push(result.id)
    remaining -= amount
  }
  if (remaining > 0) {
    return { ok: false, error: `Refund exceeds captured payments by ₹${(remaining / 100).toLocaleString('en-IN')}.`, refundIds }
  }
  return { ok: true, refundIds }
}
