'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Send, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/admin/ui/ConfirmDialog'
import { AdminEmptyState } from '@/components/admin/ui/AdminPrimitives'
import {
  countPromotionAudience, listPromotions, sendPromotion, sendTestPromotion,
  type PromoAudience, type PromoSent,
} from '@/actions/promotions'

const AUDIENCES: { id: PromoAudience; label: string; hint: string }[] = [
  { id: 'all', label: 'Everyone opted in', hint: 'All travellers with Offers and news on' },
  { id: 'booked', label: 'Past travellers', hint: 'Have a confirmed or completed booking' },
  { id: 'not_booked', label: 'Not booked yet', hint: 'Signed up but never booked' },
]

const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function PromotionsClient({ initialSent, optedIn }: { initialSent: PromoSent[]; optedIn: number }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('/offers')
  const [audience, setAudience] = useState<PromoAudience>('all')
  const [counts, setCounts] = useState<Partial<Record<PromoAudience, number>>>({ all: optedIn })
  const count = counts[audience] ?? null
  const [sent, setSent] = useState(initialSent)
  const [pending, start] = useTransition()
  const confirm = useConfirm()

  useEffect(() => {
    if (counts[audience] !== undefined) return
    countPromotionAudience(audience)
      .then((n) => setCounts((c) => ({ ...c, [audience]: n })))
      .catch(() => setCounts((c) => ({ ...c, [audience]: 0 })))
  }, [audience, counts])

  const draft = { title, body, link, audience }
  const ready = title.trim().length >= 3

  function test() {
    start(async () => {
      try { await sendTestPromotion(draft); toast.success('Sent to your devices. Check your phone or this browser.') }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  async function send() {
    if (!count) return
    const ok = await confirm({
      title: `Send to ${count.toLocaleString('en-IN')} ${count === 1 ? 'person' : 'people'}?`,
      description: `“${title.trim()}” goes out as a push now and stays in their Activity. This can't be taken back.`,
      confirmLabel: 'Send now',
    })
    if (!ok) return
    start(async () => {
      try {
        const r = await sendPromotion(draft)
        toast.success(`Sending to ${r.recipients.toLocaleString('en-IN')} ${r.recipients === 1 ? 'person' : 'people'}`)
        setTitle(''); setBody('')
        setSent(await listPromotions())
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
        <label className="block">
          <span className="text-sm font-semibold">Title</span>
          <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Monsoon trips: ₹2,000 off this week" className="mt-1.5" />
          <span className="mt-1 block text-xs text-muted-foreground">{title.length}/80 · keep it short; phones cut long titles</span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Message</span>
          <Textarea value={body} maxLength={240} rows={3} onChange={(e) => setBody(e.target.value)} placeholder="Spiti, Meghalaya and Coorg departures in July. Use code RAIN2K at checkout." className="mt-1.5" />
          <span className="mt-1 block text-xs text-muted-foreground">{body.length}/240</span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Opens</span>
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/offers" className="mt-1.5 font-mono text-sm" />
          <span className="mt-1 block text-xs text-muted-foreground">A page on UnSOLO, e.g. /offers, /packages/spiti-valley, /explore</span>
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">Who gets it</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {AUDIENCES.map((a) => (
              <button key={a.id} type="button" onClick={() => setAudience(a.id)} aria-pressed={audience === a.id}
                className={`rounded-xl border p-3 text-left transition ${audience === a.id ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/50'}`}>
                <span className="block text-sm font-bold">{a.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{a.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
            {count === null ? 'Counting…' : count === 0 ? 'Nobody in this group has offers turned on yet.' : `${count.toLocaleString('en-IN')} ${count === 1 ? 'person' : 'people'} will get it`}
          </p>
        </fieldset>
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={test} disabled={!ready || pending}><Smartphone className="mr-1.5 h-4 w-4" />Send me a test</Button>
          <Button type="button" onClick={send} disabled={!ready || pending || !count}><Send className="mr-1.5 h-4 w-4" />Send{count ? ` to ${count.toLocaleString('en-IN')}` : ''}</Button>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
          <div className="mt-3 flex gap-3 rounded-xl bg-muted p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">UnSOLO · now</p>
              <p className="truncate text-sm font-bold">{title || 'Your title'}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">{body || 'Your message'}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Quiet hours (10 pm–7 am by default) are respected: people in quiet hours see it in Activity only.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-bold">Sent</p>
          {sent.length === 0 ? <div className="mt-2"><AdminEmptyState title="Nothing sent yet" /></div> : (
            <ul className="mt-2 divide-y divide-border">
              {sent.map((s) => (
                <li key={s.campaign} className="py-2.5">
                  <p className="truncate text-sm font-semibold">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(s.sentAt)} · {AUDIENCES.find((a) => a.id === s.audience)?.label ?? s.audience} · {s.recipients.toLocaleString('en-IN')} sent · {s.opened.toLocaleString('en-IN')} opened
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
