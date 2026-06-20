'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { UserMinus } from 'lucide-react'
import {
  quotePartialRefund,
  requestPartialCancellation,
  processPartialCancellation,
  adminPartialCancel,
  initiatePartialRefund,
  markPartialRefundComplete,
} from '@/actions/partial-cancellation'

export type Traveller = { name?: string; age?: number | string | null; gender?: string | null }

export type PartialCancellationRow = {
  id: string
  booking_id: string
  travellers: Traveller[]
  guests_cancelled: number
  refund_amount_paise: number
  refund_status: string
  status: string
  created_at: string
}

type BookingLite = {
  id: string
  status: string
  guests: number
  total_amount_paise?: number
  deposit_paise?: number | null
  traveller_details?: Traveller[] | null
}

const fmt = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`

function travellerLabel(t: Traveller, i: number) {
  const name = t?.name || `Guest ${i + 1}`
  const extra = [t?.age || null, t?.gender || null].filter(Boolean).join(' · ')
  return extra ? `${name} · ${extra}` : name
}

function StatusChips({ rows }: { rows: PartialCancellationRow[] }) {
  if (!rows.length) return null
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const names = (r.travellers || []).map((t) => t?.name).filter(Boolean).join(', ')
        const tone =
          r.status === 'denied' ? 'text-red-400' : r.status === 'approved' ? 'text-green-500' : 'text-amber-500'
        return (
          <div key={r.id} className="text-xs rounded-lg border border-border bg-secondary/30 px-2.5 py-1.5">
            <span className={`font-medium ${tone}`}>
              {r.status === 'requested' ? 'Cancellation requested' : r.status === 'approved' ? 'Cancellation approved' : 'Request declined'}
            </span>
            <span className="text-muted-foreground"> · {r.guests_cancelled} traveller(s){names ? ` (${names})` : ''}</span>
            {r.status === 'approved' && r.refund_amount_paise > 0 && (
              <span className="text-muted-foreground">
                {' '}· refund {fmt(r.refund_amount_paise)} ({r.refund_status})
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Traveller-facing: lets the person who booked request that some of their party
 * be cancelled. Creates a request that admin/host then approve with a refund.
 */
export function TravellerPartialCancel({
  booking,
  existing = [],
}: {
  booking: BookingLite
  existing?: PartialCancellationRow[]
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState(false)
  const [isPending, start] = useTransition()

  const travellers = Array.isArray(booking.traveller_details) ? booking.traveller_details : []
  const hasPending = existing.some((r) => r.status === 'requested')

  if (booking.status !== 'confirmed' || (booking.guests || 1) < 2) {
    return existing.length ? <StatusChips rows={existing} /> : null
  }

  function toggle(i: number) {
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))
  }

  function submit() {
    if (!selected.length) { setErr(true); setMsg('Select at least one traveller.'); return }
    start(async () => {
      const res = await requestPartialCancellation(booking.id, selected, reason)
      if ('error' in res && res.error) { setErr(true); setMsg(res.error) }
      else { setErr(false); setMsg('Request sent — we will review and process any refund.'); setOpen(false); setSelected([]); setReason('') }
    })
  }

  return (
    <div className="space-y-2">
      <StatusChips rows={existing} />
      {!hasPending && (
        !open ? (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <UserMinus className="h-3.5 w-3.5" /> Cancel some travellers
          </button>
        ) : (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
            <p className="text-xs font-medium">Select the travellers to cancel</p>
            <div className="space-y-1">
              {travellers.map((t, i) => (
                <label key={i} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} className="rounded border-border" />
                  {travellerLabel(t, i)}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              You can&apos;t cancel everyone here — to cancel the whole booking use the full cancellation option.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Reason (optional)"
              className="w-full bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs resize-none"
            />
            <div className="flex gap-2">
              <Button size="sm" className="text-xs" onClick={submit} disabled={isPending}>Request cancellation</Button>
              <Button size="sm" variant="outline" className="text-xs border-border" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            </div>
          </div>
        )
      )}
      {msg && <p className={`text-xs ${err ? 'text-red-400' : 'text-green-500'}`}>{msg}</p>}
    </div>
  )
}

/**
 * Admin/host-facing: review traveller requests (approve with an editable pro-rata
 * refund, or deny), initiate the refund, mark it complete, or directly cancel
 * some travellers without a prior request.
 */
export function PartialCancelManager({
  booking,
  existing = [],
}: {
  booking: BookingLite
  existing?: PartialCancellationRow[]
}) {
  const travellers = Array.isArray(booking.traveller_details) ? booking.traveller_details : []
  const requests = existing.filter((r) => r.status === 'requested')
  const processed = existing.filter((r) => r.status !== 'requested')

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <RequestReview key={r.id} booking={booking} row={r} />
      ))}

      {processed.map((r) => (
        <ProcessedRow key={r.id} row={r} />
      ))}

      {booking.status === 'confirmed' && (booking.guests || 1) >= 2 && (
        <DirectCancel booking={booking} travellers={travellers} />
      )}
    </div>
  )
}

type QuoteResult = { autoRefundPaise: number; maxRefundPaise: number; tierPercent: number; guestsCancelled: number }

function useQuote(bookingId: string) {
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  async function load(indexes: number[]): Promise<{ quote?: QuoteResult; error?: string }> {
    if (!indexes.length) { setQuote(null); return {} }
    const res = await quotePartialRefund(bookingId, indexes)
    if ('error' in res) { setQuote(null); return { error: res.error } }
    setQuote(res)
    return { quote: res }
  }
  return { quote, load, setQuote }
}

function RequestReview({ booking, row }: { booking: BookingLite; row: PartialCancellationRow }) {
  const [refund, setRefund] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState(false)
  const [quote, setQuote] = useState<{ autoRefundPaise: number; maxRefundPaise: number; tierPercent: number } | null>(null)
  const [isPending, start] = useTransition()

  // Resolve the snapshot travellers back to indexes in the current list for the quote.
  const current = Array.isArray(booking.traveller_details) ? booking.traveller_details : []
  const indexes = resolveIndexes(current, row.travellers, row.guests_cancelled)

  async function loadQuote() {
    const res = await quotePartialRefund(booking.id, indexes)
    if ('error' in res) { setErr(true); setMsg(res.error || 'Could not calculate refund.'); return }
    setQuote(res)
    setRefund(String(Math.round(res.autoRefundPaise / 100)))
  }

  function approve() {
    const paise = Math.round(parseFloat(refund || '0') * 100)
    start(async () => {
      const res = await processPartialCancellation(row.id, true, paise, note)
      if ('error' in res && res.error) { setErr(true); setMsg(res.error) }
      else { setErr(false); setMsg('Approved — booking updated. Initiate the refund below if due.') }
    })
  }
  function deny() {
    start(async () => {
      const res = await processPartialCancellation(row.id, false, undefined, note)
      if ('error' in res && res.error) { setErr(true); setMsg(res.error) }
      else { setErr(false); setMsg('Request denied — traveller notified.') }
    })
  }

  const names = (row.travellers || []).map((t) => t?.name).filter(Boolean).join(', ')

  return (
    <div className="rounded-lg border border-amber-700/40 bg-amber-950/10 p-3 space-y-2">
      <p className="text-sm font-medium text-amber-500">
        Partial cancellation requested · {row.guests_cancelled} traveller(s){names ? ` (${names})` : ''}
      </p>
      {!quote ? (
        <Button size="sm" variant="outline" className="text-xs border-border" onClick={loadQuote} disabled={isPending}>
          Calculate refund
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Suggested refund {fmt(quote.autoRefundPaise)} (tier {quote.tierPercent}% · max {fmt(quote.maxRefundPaise)}). Edit if needed.
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Refund ₹</label>
            <input type="number" min="0" value={refund} onChange={(e) => setRefund(e.target.value)} className="bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-sm w-32" />
          </div>
        </div>
      )}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note to traveller (optional)" className="w-full bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs resize-none" />
      <div className="flex gap-2">
        <Button size="sm" className="text-xs bg-green-600 hover:bg-green-700 text-white" onClick={approve} disabled={isPending || !quote}>Approve</Button>
        <Button size="sm" variant="outline" className="text-xs border-red-800 text-red-400 hover:bg-red-950" onClick={deny} disabled={isPending}>Deny</Button>
      </div>
      {msg && <p className={`text-xs ${err ? 'text-red-400' : 'text-green-500'}`}>{msg}</p>}
    </div>
  )
}

function ProcessedRow({ row }: { row: PartialCancellationRow }) {
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState(false)
  const [isPending, start] = useTransition()
  const names = (row.travellers || []).map((t) => t?.name).filter(Boolean).join(', ')

  function initiate() {
    start(async () => {
      const res = await initiatePartialRefund(row.id)
      if ('error' in res && res.error) { setErr(true); setMsg(res.error) }
      else { setErr(false); setMsg('manual' in res && res.manual ? 'No online payment on file — refund manually, then mark complete.' : 'Refund initiated via Razorpay.') }
    })
  }
  function complete() {
    start(async () => {
      const res = await markPartialRefundComplete(row.id)
      if ('error' in res && res.error) { setErr(true); setMsg(res.error) }
      else { setErr(false); setMsg('Marked complete — traveller notified.') }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
      <p className="text-xs">
        <span className={row.status === 'denied' ? 'text-red-400 font-medium' : 'text-green-500 font-medium'}>
          {row.status === 'denied' ? 'Denied' : 'Approved'}
        </span>
        <span className="text-muted-foreground"> · {row.guests_cancelled} traveller(s){names ? ` (${names})` : ''}</span>
        {row.status === 'approved' && row.refund_amount_paise > 0 && (
          <span className="text-muted-foreground"> · refund {fmt(row.refund_amount_paise)} ({row.refund_status})</span>
        )}
      </p>
      {row.status === 'approved' && row.refund_amount_paise > 0 && (
        <div className="flex gap-2">
          {(row.refund_status === 'pending') && (
            <Button size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={initiate} disabled={isPending}>💳 Initiate refund</Button>
          )}
          {row.refund_status === 'processing' && (
            <Button size="sm" variant="outline" className="text-xs border-border" onClick={complete} disabled={isPending}>Mark refund complete</Button>
          )}
        </div>
      )}
      {msg && <p className={`text-xs ${err ? 'text-red-400' : 'text-green-500'}`}>{msg}</p>}
    </div>
  )
}

function DirectCancel({ booking, travellers }: { booking: BookingLite; travellers: Traveller[] }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [refund, setRefund] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState(false)
  const { quote, load } = useQuote(booking.id)
  const [isPending, start] = useTransition()

  async function toggle(i: number) {
    const next = selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i]
    setSelected(next)
    const { quote: q, error } = await load(next)
    if (error) { setErr(true); setMsg(error) }
    else {
      setErr(false); setMsg('')
      // Prefill the refund with the suggested amount each time the selection changes.
      if (q) setRefund(String(Math.round(q.autoRefundPaise / 100)))
      else setRefund('')
    }
  }

  function submit() {
    if (!selected.length) { setErr(true); setMsg('Select at least one traveller.'); return }
    const paise = Math.round(parseFloat(refund || '0') * 100)
    start(async () => {
      const res = await adminPartialCancel(booking.id, selected, paise, note)
      if ('error' in res && res.error) { setErr(true); setMsg(res.error) }
      else { setErr(false); setMsg('Cancelled — initiate the refund from the record above if due.'); setOpen(false); setSelected([]); setRefund(''); setNote('') }
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <UserMinus className="h-3.5 w-3.5" /> Cancel some travellers
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
      <p className="text-xs font-medium">Cancel travellers from this booking</p>
      <div className="space-y-1">
        {travellers.map((t, i) => (
          <label key={i} className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} className="rounded border-border" />
            {travellerLabel(t, i)}
          </label>
        ))}
      </div>
      {quote && (
        <p className="text-[11px] text-muted-foreground">
          Suggested {fmt(quote.autoRefundPaise)} (tier {quote.tierPercent}% · max {fmt(quote.maxRefundPaise)})
        </p>
      )}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Refund ₹</label>
        <input type="number" min="0" value={refund} onChange={(e) => setRefund(e.target.value)} className="bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-sm w-32" />
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note to traveller (optional)" className="w-full bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs resize-none" />
      <div className="flex gap-2">
        <Button size="sm" className="text-xs" onClick={submit} disabled={isPending}>Confirm cancellation</Button>
        <Button size="sm" variant="outline" className="text-xs border-border" onClick={() => setOpen(false)} disabled={isPending}>Close</Button>
      </div>
      {msg && <p className={`text-xs ${err ? 'text-red-400' : 'text-green-500'}`}>{msg}</p>}
    </div>
  )
}

/** Map snapshot travellers back to indexes in the current traveller list. */
function resolveIndexes(current: Traveller[], snapshot: Traveller[], fallbackCount: number): number[] {
  const used = new Set<number>()
  const out: number[] = []
  for (const s of snapshot) {
    const idx = current.findIndex(
      (t, i) => !used.has(i) && (t?.name || '') === (s?.name || '') && (t?.age ?? null) === (s?.age ?? null) && (t?.gender ?? null) === (s?.gender ?? null),
    )
    if (idx >= 0) { used.add(idx); out.push(idx) }
  }
  // Fall back to the first N unused indexes if matching failed.
  if (out.length < fallbackCount) {
    for (let i = 0; i < current.length && out.length < fallbackCount; i++) {
      if (!used.has(i)) { used.add(i); out.push(i) }
    }
  }
  return out
}
