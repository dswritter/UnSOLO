'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api/client'
import { Sheet } from './Sheet'

const INCLUDES = ['Stay', 'Transport', 'Meals', 'Guide', 'Permits', 'Gear']

/** Host makes an offer on a plan: real price per person, what's included, extra seats. Expires in 7 days. */
export function OfferToHostButton({ postId, placeName }: { postId: string; placeName: string }) {
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState('')
  const [includes, setIncludes] = useState<string[]>(['Stay', 'Transport'])
  const [extra, setExtra] = useState(0)
  const [notes, setNotes] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  async function send() {
    const rupees = Number(price.replace(/[^\d]/g, ''))
    if (!rupees || rupees < 100) { toast.error('Enter a price per person'); return }
    setBusy(true)
    try {
      await apiFetch(`/posts/${postId}/offers`, { body: { pricePaise: rupees * 100, includes, extraSeats: extra, notes: notes.trim() || null } })
      setSent(true); setOpen(false)
      toast.success('Offer sent. The organiser has 7 days to reply.')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  if (sent) return <span className="pc-kicker">Offer sent</span>
  return (
    <>
      <button type="button" className="pc-btn pc-btn-sm" onClick={() => setOpen(true)}>Offer to host</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Offer to host ${placeName}`} description="Only the organiser and approved members see your offer.">
        <label className="mt-4 block text-sm font-semibold">Price per person (₹)
          <input className="pc-input mt-1.5 tabular-nums" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="15000" data-autofocus />
        </label>
        <p className="mt-4 text-sm font-semibold">Included</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {INCLUDES.map((i) => (
            <button key={i} type="button" className="pc-chip" aria-pressed={includes.includes(i)}
              onClick={() => setIncludes(includes.includes(i) ? includes.filter((x) => x !== i) : [...includes, i])}>{i}</button>
          ))}
        </div>
        <label className="mt-4 block text-sm font-semibold">Extra seats you can open to others
          <input className="pc-input mt-1.5 w-28 tabular-nums" type="number" min={0} max={20} value={extra} onChange={(e) => setExtra(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} />
        </label>
        <label className="mt-4 block text-sm font-semibold">Note (optional)
          <textarea className="pc-input mt-1.5" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Same dates, Kinnaur route, homestays in Kaza" />
        </label>
        <div className="fc-sheet-actions">
          <button type="button" className="pc-btn pc-btn-block" disabled={busy} onClick={send}>Send offer</button>
          <button type="button" className="pc-btn pc-btn-quiet pc-btn-block" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </Sheet>
    </>
  )
}
