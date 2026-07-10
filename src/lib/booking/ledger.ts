import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Payment & refund ledger helpers (Phase 2).
 *
 * The tables `booking_payments` / `booking_refunds` are the eventual source of
 * truth for collected/refunded. During the transition, app code DUAL-WRITES here
 * (best-effort — never blocks the live money flow) while reads still use the
 * existing scalar columns. `summarizeLedger` is pure and unit-tested.
 */

export type LedgerPaymentRow = { amount_paise: number }
export type LedgerRefundRow = { amount_paise: number; status: string }

/** Derive collected/refunded from ledger rows. Pure — see ledger.test.ts. */
export function summarizeLedger(
  payments: LedgerPaymentRow[],
  refunds: LedgerRefundRow[],
): { collectedPaise: number; refundedPaise: number; netCollectedPaise: number } {
  const collectedPaise = (payments || []).reduce((s, p) => s + (p?.amount_paise || 0), 0)
  const refundedPaise = (refunds || [])
    .filter((r) => r?.status === 'completed')
    .reduce((s, r) => s + (r?.amount_paise || 0), 0)
  return { collectedPaise, refundedPaise, netCollectedPaise: collectedPaise - refundedPaise }
}

type Svc = SupabaseClient

/**
 * Append a payment to the ledger. Best-effort: swallows errors (e.g. migration
 * 100 not yet applied) so it can never break the real deposit-crediting flow.
 */
export async function recordPaymentLedger(
  svc: Svc,
  input: {
    bookingId: string
    amountPaise: number
    method: 'razorpay' | 'offline_cash' | 'offline_bank' | 'wallet' | 'other'
    kind?: 'token' | 'balance' | 'payment'
    gatewayPaymentId?: string | null
    gatewayFeePaise?: number | null
    recordedBy?: string | null
    note?: string | null
  },
): Promise<void> {
  if (!input.amountPaise || input.amountPaise <= 0) return
  try {
    await svc.from('booking_payments').insert({
      booking_id: input.bookingId,
      amount_paise: Math.round(input.amountPaise),
      method: input.method,
      kind: input.kind ?? 'payment',
      gateway_payment_id: input.gatewayPaymentId ?? null,
      gateway_fee_paise: Math.round(input.gatewayFeePaise ?? 0),
      recorded_by: input.recordedBy ?? null,
      note: input.note ?? null,
    })
  } catch { /* best-effort dual-write */ }
}

/**
 * Dual-write a refund into the ledger, shared by the full-booking and partial
 * flows (best-effort — never blocks the live refund). Correlates by
 * (booking_id, partial_cancellation_id): full-cancel refunds use a null
 * partial id, partial refunds use the partial-cancellation row's id, so a
 * refund's initiate→complete transitions update the SAME ledger row (also the
 * one seeded by the 101 backfill). Inserts only when amount is known (>0).
 */
export async function upsertBookingRefund(
  svc: Svc,
  input: {
    bookingId: string
    partialCancellationId?: string | null
    amountPaise?: number
    method: 'razorpay' | 'offline' | 'wallet'
    status: 'pending' | 'processing' | 'completed' | 'failed'
    gatewayRefundId?: string | null
    initiatedBy?: string | null
    completedAt?: string | null
  },
): Promise<void> {
  try {
    const pcId = input.partialCancellationId ?? null
    let sel = svc.from('booking_refunds').select('id').eq('booking_id', input.bookingId)
    sel = pcId ? sel.eq('partial_cancellation_id', pcId) : sel.is('partial_cancellation_id', null)
    const { data: existing } = await sel.order('created_at', { ascending: false }).limit(1).maybeSingle()

    const fields: Record<string, unknown> = { method: input.method, status: input.status }
    if (typeof input.amountPaise === 'number' && input.amountPaise > 0) fields.amount_paise = Math.round(input.amountPaise)
    if (input.gatewayRefundId != null) fields.gateway_refund_id = input.gatewayRefundId
    if (input.initiatedBy != null) fields.initiated_by = input.initiatedBy
    if (input.status === 'processing') fields.initiated_at = new Date().toISOString()
    if (input.status === 'completed') fields.completed_at = input.completedAt ?? new Date().toISOString()

    if (existing?.id) {
      await svc.from('booking_refunds').update(fields).eq('id', existing.id)
    } else {
      if (!fields.amount_paise) return // can't insert without a positive amount
      await svc.from('booking_refunds').insert({ booking_id: input.bookingId, partial_cancellation_id: pcId, ...fields })
    }
  } catch { /* best-effort dual-write */ }
}

/** Read + summarize a booking's ledger (for verification / Phase 2b reads). */
export async function getBookingLedgerSummary(
  svc: Svc,
  bookingId: string,
): Promise<{ collectedPaise: number; refundedPaise: number; netCollectedPaise: number }> {
  try {
    const [{ data: payments }, { data: refunds }] = await Promise.all([
      svc.from('booking_payments').select('amount_paise').eq('booking_id', bookingId),
      svc.from('booking_refunds').select('amount_paise, status').eq('booking_id', bookingId),
    ])
    return summarizeLedger((payments || []) as LedgerPaymentRow[], (refunds || []) as LedgerRefundRow[])
  } catch {
    return { collectedPaise: 0, refundedPaise: 0, netCollectedPaise: 0 }
  }
}
