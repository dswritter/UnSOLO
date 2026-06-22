'use client'

import { useState, type ReactNode } from 'react'
import { saveListingDraftAsStaff, type StaffDraftDetail } from '@/actions/listing-drafts'
import { Button } from '@/components/ui/button'

const inputCls = 'w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm'

export function StaffDraftEditor({ draft }: { draft: StaffDraftDetail }) {
  const [payload, setPayload] = useState<Record<string, unknown>>(draft.payload || {})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const str = (k: string) => (typeof payload[k] === 'string' ? (payload[k] as string) : '')
  const setField = (k: string, v: unknown) => setPayload((p) => ({ ...p, [k]: v }))

  // priceRows (trips) / items (service) — edit existing rows' key fields.
  const rows = Array.isArray(payload[draft.kind === 'trip' ? 'priceRows' : 'items'])
    ? (payload[draft.kind === 'trip' ? 'priceRows' : 'items'] as Record<string, unknown>[])
    : []
  const setRow = (i: number, key: string, v: unknown) => {
    const arrKey = draft.kind === 'trip' ? 'priceRows' : 'items'
    const next = rows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r))
    setField(arrKey, next)
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    const title = str('title')
    const destinationLabel =
      draft.kind === 'trip'
        ? ((payload.destination as { name?: string } | null)?.name ?? draft.destination_label ?? null)
        : ((payload.destinationName as string) || draft.destination_label || null)
    const res = await saveListingDraftAsStaff(draft.id, { title, destinationLabel, step: draft.step, payload })
    setSaving(false)
    setMsg('error' in res ? { ok: false, text: res.error } : { ok: true, text: 'Saved. The host was notified to reopen their draft to see your changes.' })
  }

  return (
    <div className="mx-auto max-w-2xl">
      <a href="/admin/host-drafts" className="text-sm text-primary hover:underline">&larr; All drafts in progress</a>
      <h1 className="text-2xl font-bold mt-2 mb-1">Edit draft</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {draft.kind === 'trip' ? 'Community trip' : 'Service listing'} by{' '}
        <strong>{draft.host?.full_name || draft.host?.username || 'host'}</strong>
        {draft.host?.username ? ` (@${draft.host.username})` : ''}. Your edits save to their draft.
      </p>

      <div className="space-y-4">
        <Field label="Title">
          <input className={inputCls} value={str('title')} onChange={(e) => setField('title', e.target.value)} />
        </Field>
        <Field label="Short description">
          <input className={inputCls} value={str('shortDescription')} onChange={(e) => setField('shortDescription', e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea className={inputCls} rows={6} value={str('description')} onChange={(e) => setField('description', e.target.value)} />
        </Field>

        {draft.kind === 'trip' ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Trip days"><input className={inputCls} value={str('tripDays')} onChange={(e) => setField('tripDays', e.target.value)} /></Field>
              <Field label="Trip nights"><input className={inputCls} value={str('tripNights')} onChange={(e) => setField('tripNights', e.target.value)} /></Field>
              <Field label="Max group size"><input className={inputCls} value={str('maxGroupSize')} onChange={(e) => setField('maxGroupSize', e.target.value)} /></Field>
            </div>
            <Field label="Difficulty"><input className={inputCls} value={str('difficulty')} onChange={(e) => setField('difficulty', e.target.value)} /></Field>
            <div>
              <p className="text-sm font-medium mb-2">Price tiers</p>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <input className={inputCls} placeholder="₹ per person" value={typeof r.rupees === 'string' ? r.rupees : ''} onChange={(e) => setRow(i, 'rupees', e.target.value)} />
                    <input className={inputCls} placeholder="What's included" value={typeof r.facilities === 'string' ? r.facilities : ''} onChange={(e) => setRow(i, 'facilities', e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <Field label="Location"><input className={inputCls} value={str('location')} onChange={(e) => setField('location', e.target.value)} /></Field>
            <div>
              <p className="text-sm font-medium mb-2">Items</p>
              <div className="space-y-3">
                {rows.map((r, i) => (
                  <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                    <input className={inputCls} placeholder="Name" value={typeof r.name === 'string' ? r.name : ''} onChange={(e) => setRow(i, 'name', e.target.value)} />
                    <textarea className={inputCls} rows={2} placeholder="Description" value={typeof r.description === 'string' ? r.description : ''} onChange={(e) => setRow(i, 'description', e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <input className={inputCls} placeholder="₹ price" value={r.priceRupees != null ? String(r.priceRupees) : ''} onChange={(e) => setRow(i, 'priceRupees', Number(e.target.value) || 0)} />
                      <input className={inputCls} placeholder="Quantity" value={r.quantity != null ? String(r.quantity) : ''} onChange={(e) => setRow(i, 'quantity', Number(e.target.value) || 0)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <p className="text-[11px] text-muted-foreground">
          This editor covers the fields hosts most often need help with. Images, schedule and other rich fields are edited by the host in the full create form (which will load your changes when they reopen).
        </p>

        {msg && <p className={`text-sm ${msg.ok ? 'text-green-500' : 'text-red-400'}`}>{msg.text}</p>}

        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save to host’s draft'}</Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      {children}
    </div>
  )
}
