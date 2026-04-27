'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Info } from 'lucide-react'
import { formatPrice } from '@/types'
import { quoteCancellationRefund, type CancellationQuote } from '@/actions/cancellation-refund'

type Props = {
  bookingId: string
  totalAmountPaise: number
  cancellationReason?: string | null
  disabled: boolean
  onApprove: (refundPaise: number, tierPercent: number, note: string) => void
  onDeny: (note: string) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  unsolo: 'UnSOLO curated trip',
  host: 'Community trip',
  stays: 'Stay',
  activities: 'Activity',
  rentals: 'Rental',
}

export function CancellationReviewPanel({
  bookingId,
  totalAmountPaise,
  cancellationReason,
  disabled,
  onApprove,
  onDeny,
}: Props) {
  const [quote, setQuote] = useState<CancellationQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [refundRupees, setRefundRupees] = useState<string>('')
  const [tierPercent, setTierPercent] = useState<number>(0)
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false
    quoteCancellationRefund(bookingId).then((res) => {
      if (cancelled) return
      if ('error' in res) {
        setQuoteError(res.error)
        setRefundRupees((totalAmountPaise / 100).toFixed(2))
        return
      }
      setQuote(res)
      setTierPercent(res.tierPercent)
      setRefundRupees((res.totalRefundPaise / 100).toFixed(2))
    })
    return () => { cancelled = true }
  }, [bookingId, totalAmountPaise])

  // Re-quote when admin overrides the tier %
  async function handleTierChange(pct: number) {
    setTierPercent(pct)
    const res = await quoteCancellationRefund(bookingId, pct)
    if (!('error' in res)) {
      setQuote(res)
      setRefundRupees((res.totalRefundPaise / 100).toFixed(2))
    }
  }

  const maxRupees = totalAmountPaise / 100
  const refundPaise = Math.max(0, Math.round(parseFloat(refundRupees || '0') * 100))

  return (
    <div className="p-3 rounded-lg border border-orange-500/30 bg-orange-500/5 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-orange-400" />
        <span className="text-sm font-bold text-orange-400">Cancellation Requested</span>
      </div>
      {cancellationReason && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Reason:</span> {cancellationReason}
        </p>
      )}

      {quote && (
        <div className="rounded-md border border-border bg-card/60 p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Info className="h-3.5 w-3.5 text-primary" />
            <span>
              Category: <strong className="text-foreground">{CATEGORY_LABELS[quote.category] || quote.category}</strong>
              {' · '}Current tier refund:{' '}
              <strong className="text-primary">{quote.tierPercent}%</strong>
              {quote.travelDateIso && (
                <> · Travel date {new Date(quote.travelDateIso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
              )}
            </span>
          </div>
          {!quote.platformOnly && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded bg-secondary/50 px-2 py-1.5 border border-border">
                <div className="text-muted-foreground">Host absorbs</div>
                <div className="font-semibold tabular-nums">{formatPrice(quote.hostRefundPaise)}</div>
              </div>
              <div className="rounded bg-secondary/50 px-2 py-1.5 border border-border">
                <div className="text-muted-foreground">Platform absorbs</div>
                <div className="font-semibold tabular-nums">{formatPrice(quote.platformRefundPaise)}</div>
              </div>
              <div className="rounded bg-primary/10 px-2 py-1.5 border border-primary/25">
                <div className="text-muted-foreground">Traveler refund</div>
                <div className="font-bold text-primary tabular-nums">{formatPrice(quote.totalRefundPaise)}</div>
              </div>
            </div>
          )}
          {quote.platformWriteOffPaise > 0 && (
            <p className="text-[11px] text-amber-500">
              Note: Host was already paid {formatPrice(quote.alreadyReleasedPaise)} in advance — platform absorbs {formatPrice(quote.platformWriteOffPaise)} write-off (host is not clawed back).
            </p>
          )}
        </div>
      )}
      {quoteError && <p className="text-xs text-red-400">Preview unavailable: {quoteError}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tier refund %</label>
          <input
            type="number"
            min={0}
            max={100}
            value={tierPercent}
            onChange={(e) => handleTierChange(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
            className="w-full bg-secondary border border-border rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Refund to traveler (₹)</label>
          <input
            type="number"
            min={0}
            max={maxRupees}
            value={refundRupees}
            onChange={(e) => setRefundRupees(e.target.value)}
            className="w-full bg-secondary border border-border rounded px-2 py-1 text-sm"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Max: ₹{maxRupees.toLocaleString('en-IN')}</p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none"
        rows={2}
        placeholder="Note to customer (reason for refund amount, deductions etc.)..."
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white text-xs"
          onClick={() => onApprove(refundPaise, tierPercent, note)}
          disabled={disabled}
        >
          Approve &amp; Refund
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-red-500/30 text-red-400 text-xs hover:bg-red-500/10"
          onClick={() => onDeny(note)}
          disabled={disabled}
        >
          Deny
        </Button>
      </div>
    </div>
  )
}
