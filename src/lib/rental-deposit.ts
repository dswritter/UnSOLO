/** Pure settlement math for a held rental security deposit. */
export function planDepositSettlement(depositPaise: number, retainPaise: number, note: string | null | undefined):
  | { error: string }
  | { refundPaise: number; retainPaise: number; status: 'refunded' | 'partially_refunded' | 'retained' } {
  const deposit = Math.max(0, Math.round(depositPaise))
  const retain = Math.round(retainPaise)
  if (deposit <= 0) return { error: 'No security deposit is held on this booking' }
  if (!Number.isFinite(retain) || retain < 0) return { error: 'Retained amount cannot be negative' }
  if (retain > deposit) return { error: 'Retained amount cannot exceed the deposit' }
  if (retain > 0 && !note?.trim()) return { error: 'Add a reason for keeping part of the deposit' }
  const refundPaise = deposit - retain
  return {
    refundPaise,
    retainPaise: retain,
    status: retain === 0 ? 'refunded' : refundPaise === 0 ? 'retained' : 'partially_refunded',
  }
}
