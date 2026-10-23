'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { settleRentalSecurityDeposit } from '@/actions/rental-security-deposit'
import { formatPrice } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  held: 'Held', refunded: 'Refunded', partially_refunded: 'Partly refunded', retained: 'Kept',
}

/** Shows a rental's security deposit and lets staff return it (fully or keeping part) after the rental. */
export function RentalDepositPanel({ bookingId, depositPaise, status, refundedPaise, note, canSettle, onSettled }: {
  bookingId: string
  depositPaise: number
  status: string | null
  refundedPaise?: number | null
  note?: string | null
  canSettle: boolean
  onSettled: (fields: { security_deposit_status: string; security_deposit_refunded_paise: number; security_deposit_note: string | null }) => void
}) {
  const [keeping, setKeeping] = useState(false)
  const [keepRupees, setKeepRupees] = useState('')
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()

  function settle(retainPaise: number) {
    start(async () => {
      const res = await settleRentalSecurityDeposit(bookingId, retainPaise, reason)
      if ('error' in res) { toast.error(res.error); return }
      toast.success(res.refundPaise > 0 ? `Refunding ${formatPrice(res.refundPaise)}` : 'Deposit kept')
      onSettled({
        security_deposit_status: retainPaise === 0 ? 'refunded' : retainPaise >= depositPaise ? 'retained' : 'partially_refunded',
        security_deposit_refunded_paise: depositPaise - retainPaise,
        security_deposit_note: reason.trim() || null,
      })
    })
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">Security deposit: {formatPrice(depositPaise)}</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs">{STATUS_LABEL[status ?? 'held'] ?? status}</span>
      </div>
      {status !== 'held' && refundedPaise != null && (
        <p className="text-xs text-muted-foreground">Refunded {formatPrice(refundedPaise)}{note ? ` · ${note}` : ''}</p>
      )}
      {status === 'held' && canSettle && !keeping && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => settle(0)}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {pending ? 'Refunding…' : 'Refund full deposit'}
          </button>
          <button type="button" disabled={pending} onClick={() => setKeeping(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium">
            Keep part of it
          </button>
        </div>
      )}
      {status === 'held' && canSettle && keeping && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input type="number" min="1" max={depositPaise / 100} aria-label="Amount to keep (₹)" placeholder="Amount to keep (₹)"
              value={keepRupees} onChange={e => setKeepRupees(e.target.value)}
              className="w-40 rounded-lg border border-border bg-background px-2 py-1.5 text-xs" />
            <input type="text" aria-label="Reason" placeholder="Reason, e.g. late return 2 hrs"
              value={reason} onChange={e => setReason(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs" />
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={pending || !keepRupees} onClick={() => settle(Math.round(Number(keepRupees) * 100))}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
              {pending ? 'Saving…' : `Refund ${formatPrice(Math.max(0, depositPaise - Math.round(Number(keepRupees || 0) * 100)))}`}
            </button>
            <button type="button" disabled={pending} onClick={() => setKeeping(false)} className="text-xs text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
