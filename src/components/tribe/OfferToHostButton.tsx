'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api/client'

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
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Offer to host" className="w-full max-w-md rounded-t-lg border border-foreground bg-background p-5 md:rounded-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl">Offer to host {placeName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Only the organiser and approved members see your offer.</p>
            <label className="mt-4 block text-sm font-medium">Price per person (₹)
              <input className="pc-input pc-mono mt-1" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="15000" autoFocus />
            </label>
            <p className="mt-3 text-sm font-medium">Included</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {INCLUDES.map((i) => (
                <button key={i} type="button" className="pc-chip" aria-pressed={includes.includes(i)}
                  onClick={() => setIncludes(includes.includes(i) ? includes.filter((x) => x !== i) : [...includes, i])}>{i}</button>
              ))}
            </div>
            <label className="mt-3 block text-sm font-medium">Extra seats you can open to others
              <input className="pc-input pc-mono mt-1 w-24" type="number" min={0} max={20} value={extra} onChange={(e) => setExtra(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} />
            </label>
            <label className="mt-3 block text-sm font-medium">Note (optional)
              <textarea className="pc-input mt-1" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Same dates, Kinnaur route, homestays in Kaza" />
            </label>
            <div className="mt-4 flex gap-2">
              <button type="button" className="pc-btn flex-1" disabled={busy} onClick={send}>Send offer</button>
              <button type="button" className="pc-btn pc-btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
