'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil, Tag } from 'lucide-react'
import { requestTravellerEdit, requestTierChange, processBookingChangeRequest } from '@/actions/booking-change-requests'
import { parsePriceVariants } from '@/lib/package-pricing'
import { formatPrice } from '@/lib/utils'

type Traveller = { name?: string; age?: number | string | null; gender?: string | null }

export type ChangeRequestRow = {
  id: string
  booking_id: string
  kind: 'travellers' | 'tier'
  payload: { travellers?: Traveller[]; variantIndex?: number } | null
  status: 'requested' | 'approved' | 'denied'
  note?: string | null
  admin_note?: string | null
  created_at: string
}

type BookingLite = {
  id: string
  status: string
  guests: number
  traveller_details?: Traveller[] | null
  price_variant_label?: string | null
  package?: { price_variants?: unknown } | null
  service_listings?: { price_variants?: unknown } | null
}

function Chips({ rows, variantLabels }: { rows: ChangeRequestRow[]; variantLabels: string[] }) {
  if (!rows.length) return null
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const tone = r.status === 'denied' ? 'text-red-400' : r.status === 'approved' ? 'text-green-500' : 'text-amber-500'
        const what =
          r.kind === 'tier'
            ? `tier → ${variantLabels[r.payload?.variantIndex ?? -1] ?? 'new tier'}`
            : 'traveller details'
        const verb = r.status === 'requested' ? 'Change requested' : r.status === 'approved' ? 'Change approved' : 'Request declined'
        return (
          <div key={r.id} className="rounded-lg border border-border bg-secondary/30 px-2.5 py-1.5 text-xs">
            <span className={`font-medium ${tone}`}>{verb}</span>
            <span className="text-muted-foreground"> — {what}</span>
            {r.admin_note ? <span className="text-muted-foreground"> · {r.admin_note}</span> : null}
          </div>
        )
      })}
    </div>
  )
}

function travellerLine(t: Traveller, i: number) {
  const name = t?.name || `Guest ${i + 1}`
  const extra = [t?.age || null, t?.gender || null].filter(Boolean).join(' · ')
  return extra ? `${name} · ${extra}` : name
}

/**
 * Host/staff-facing approve/deny panel for a booking's pending change requests.
 * Approving a tier change runs the shared re-tier path (recomputes total + notifies
 * the booker, including any overpayment); approving traveller edits writes the
 * corrected `traveller_details`.
 */
export function BookingChangeRequestManager({
  existing,
  variantLabels = [],
}: {
  existing: ChangeRequestRow[]
  variantLabels?: string[]
}) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [noteById, setNoteById] = useState<Record<string, string>>({})

  const open = existing.filter((r) => r.status === 'requested')
  const history = existing.filter((r) => r.status !== 'requested')

  function act(id: string, approve: boolean) {
    setErr(null)
    start(async () => {
      const res = await processBookingChangeRequest(id, approve, noteById[id])
      if ('error' in res && res.error) setErr(res.error)
    })
  }

  if (!existing.length) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Pencil className="h-3 w-3" /> Change requests
      </p>
      {open.map((r) => (
        <div key={r.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs space-y-2">
          {r.kind === 'tier' ? (
            <p>
              <span className="font-medium text-amber-500">Tier change requested</span> → {variantLabels[r.payload?.variantIndex ?? -1] ?? `tier #${(r.payload?.variantIndex ?? 0) + 1}`}
            </p>
          ) : (
            <div>
              <p className="font-medium text-amber-500">Traveller details change requested</p>
              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                {(r.payload?.travellers || []).map((t, i) => <li key={i}>{travellerLine(t, i)}</li>)}
              </ul>
            </div>
          )}
          {r.note ? <p className="text-muted-foreground">“{r.note}”</p> : null}
          <input
            className="w-full rounded-md border border-border bg-background px-2 py-1"
            placeholder="Note to customer (optional)"
            value={noteById[r.id] ?? ''}
            onChange={(e) => setNoteById((p) => ({ ...p, [r.id]: e.target.value }))}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-7 text-xs" disabled={pending} onClick={() => act(r.id, true)}>Approve</Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={pending} onClick={() => act(r.id, false)}>Deny</Button>
          </div>
        </div>
      ))}
      {err ? <p className="text-xs text-red-400">{err}</p> : null}
      {history.length ? <Chips rows={history} variantLabels={variantLabels} /> : null}
    </div>
  )
}

export function BookingChangeRequest({ booking, existing }: { booking: BookingLite; existing: ChangeRequestRow[] }) {
  const variants = parsePriceVariants(booking.package?.price_variants ?? booking.service_listings?.price_variants) || []
  const variantLabels = variants.map((v) => v.description)

  const [mode, setMode] = useState<null | 'travellers' | 'tier'>(null)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const guests = booking.guests || 1
  const initialTravellers: Traveller[] = Array.from({ length: guests }, (_, i) => booking.traveller_details?.[i] ?? { name: '', age: '', gender: '' })
  const [rows, setRows] = useState<Traveller[]>(initialTravellers)
  const [tierIdx, setTierIdx] = useState<number>(() => {
    const cur = variants.findIndex((v) => v.description === booking.price_variant_label)
    return cur >= 0 ? cur : 0
  })

  const hasOpenRequest = existing.some((r) => r.status === 'requested')

  if (booking.status !== 'confirmed') {
    return existing.length ? <Chips rows={existing} variantLabels={variantLabels} /> : null
  }

  function submitTravellers() {
    setErr(null)
    start(async () => {
      const res = await requestTravellerEdit(
        booking.id,
        rows.map((r) => ({ name: String(r.name || '').trim(), age: r.age === '' || r.age == null ? null : Number(r.age), gender: r.gender ? String(r.gender) : null })),
      )
      if ('error' in res && res.error) setErr(res.error)
      else { setMode(null); setDone('Change requested — awaiting host/admin approval.') }
    })
  }

  function submitTier() {
    setErr(null)
    start(async () => {
      const res = await requestTierChange(booking.id, tierIdx)
      if ('error' in res && res.error) setErr(res.error)
      else { setMode(null); setDone('Tier change requested — awaiting host/admin approval.') }
    })
  }

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <Chips rows={existing} variantLabels={variantLabels} />
      {done ? <p className="text-xs text-green-500">{done}</p> : null}

      {!mode && !hasOpenRequest ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setMode('travellers'); setDone(null) }}>
            <Pencil className="h-3 w-3 mr-1" /> Edit traveller details
          </Button>
          {variants.length > 1 ? (
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setMode('tier'); setDone(null) }}>
              <Tag className="h-3 w-3 mr-1" /> Change tier
            </Button>
          ) : null}
        </div>
      ) : null}

      {mode === 'travellers' ? (
        <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
          <p className="text-xs font-medium">Correct traveller details (sent for approval)</p>
          {rows.map((t, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input
                className="flex-1 min-w-[140px] rounded-md border border-border bg-background px-2 py-1 text-sm"
                placeholder={`Traveller ${i + 1} name`}
                value={String(t.name ?? '')}
                onChange={(e) => setRows((p) => p.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
              />
              <input
                type="number"
                min={0}
                className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                placeholder="Age"
                value={t.age == null ? '' : String(t.age)}
                onChange={(e) => setRows((p) => p.map((r, j) => (j === i ? { ...r, age: e.target.value } : r)))}
              />
              <select
                className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm"
                value={String(t.gender ?? '')}
                onChange={(e) => setRows((p) => p.map((r, j) => (j === i ? { ...r, gender: e.target.value } : r)))}
              >
                <option value="">Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          ))}
          {err ? <p className="text-xs text-red-400">{err}</p> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-7 text-xs" disabled={pending} onClick={submitTravellers}>
              {pending ? 'Sending…' : 'Submit for approval'}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={pending} onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {mode === 'tier' ? (
        <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
          <p className="text-xs font-medium">Switch this booking to another tier (sent for approval)</p>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            value={tierIdx}
            onChange={(e) => setTierIdx(Number(e.target.value))}
          >
            {variants.map((v, i) => (
              <option key={i} value={i}>
                {v.description} — {formatPrice(v.price_paise)}/person
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">Switching tiers may change your total; any balance or refund is settled after approval.</p>
          {err ? <p className="text-xs text-red-400">{err}</p> : null}
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-7 text-xs" disabled={pending} onClick={submitTier}>
              {pending ? 'Sending…' : 'Submit for approval'}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={pending} onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
