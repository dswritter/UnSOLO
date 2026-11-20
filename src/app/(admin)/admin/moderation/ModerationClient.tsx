'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Clock, ExternalLink, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api/client'
import type { QueueItem } from '@/lib/moderation/queue'
import { cn } from '@/lib/utils'

export type HeldPost = { id: string; kind: string; title: string | null; body: string; flags: string[]; createdAt: string; author: string }

const TABS = [
  { id: 'open', label: 'Open' }, { id: 'held', label: 'Held posts' }, { id: 'in_review', label: 'In review' },
  { id: 'actioned', label: 'Actioned' }, { id: 'dismissed', label: 'Dismissed' },
]
const REASON: Record<string, string> = {
  spam: 'Spam', scam_money: 'Money / scam', harassment: 'Harassment', unsafe_meetup: 'Unsafe meetup',
  fake_profile: 'Fake profile', hate: 'Hate', sexual: 'Sexual content', other: 'Other',
}
type Action = 'hide' | 'remove' | 'restore' | 'warn' | 'mute' | 'suspend' | 'ban' | 'dismiss'
const ACTIONS: { id: Action; label: string; adminOnly?: boolean; danger?: boolean; content?: boolean }[] = [
  { id: 'dismiss', label: 'Dismiss' },
  { id: 'hide', label: 'Hide', content: true },
  { id: 'remove', label: 'Remove', content: true, danger: true },
  { id: 'restore', label: 'Restore', content: true },
  { id: 'warn', label: 'Warn' },
  { id: 'mute', label: 'Mute 7 days' },
  { id: 'suspend', label: 'Suspend 30 days', danger: true },
  { id: 'ban', label: 'Ban', adminOnly: true, danger: true },
]

function due(iso: string | null) {
  if (!iso) return ''
  const m = Math.round((Date.parse(iso) - Date.now()) / 60000)
  if (m < 0) return `${Math.abs(m) >= 120 ? `${Math.round(-m / 60)} h` : `${-m} min`} overdue`
  return m >= 120 ? `due in ${Math.round(m / 60)} h` : `due in ${m} min`
}

export function ModerationClient({ state, items: initial, counts, held: initialHeld, isAdmin }: {
  state: string
  items: QueueItem[]
  counts: Record<string, number>
  held: HeldPost[]
  isAdmin: boolean
}) {
  const [items, setItems] = useState(initial)
  const [held, setHeld] = useState(initialHeld)
  const [active, setActive] = useState<string | null>(initial[0]?.id ?? null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const current = items.find((i) => i.id === active) ?? null

  async function act(a: Action) {
    if (!current || note.trim().length < 3) { toast.error('Add a short note — it is sent to the person and kept in the audit log'); return }
    if ((a === 'ban' || a === 'suspend' || a === 'remove') && !confirm(`${ACTIONS.find((x) => x.id === a)?.label}? This notifies ${current.targetUser?.name ?? 'the person'}.`)) return
    setBusy(true)
    try {
      await apiFetch(`/admin/reports/${current.id}/action`, { body: { action: a, note: note.trim() } })
      toast.success('Done')
      const rest = items.filter((i) => i.id !== current.id)
      setItems(rest)
      setActive(rest[0]?.id ?? null)
      setNote('')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  async function decideHeld(p: HeldPost, status: 'live' | 'removed') {
    const n = prompt(status === 'live' ? 'Note (why it is fine to publish):' : 'Reason (sent to the author):', status === 'live' ? 'Cost split, not a sale' : '')
    if (!n || n.trim().length < 3) return
    try {
      await apiFetch(`/admin/posts/${p.id}`, { body: { status, note: n.trim() } })
      setHeld((h) => h.filter((x) => x.id !== p.id))
      toast.success(status === 'live' ? 'Published' : 'Removed')
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Queue">
        {TABS.map((t) => (
          <Link key={t.id} href={`/admin/moderation?state=${t.id}`} className="pc-chip" aria-pressed={state === t.id}>
            {t.label}{t.id === state && t.id !== 'held' && counts[t.id] != null ? <span className="pc-count">{counts[t.id]}</span> : null}
          </Link>
        ))}
        {state === 'open' && (counts.safety ?? 0) > 0 && <span className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--pc-red)]"><ShieldAlert className="h-4 w-4" aria-hidden /> {counts.safety} safety</span>}
        {state === 'open' && (counts.overdue ?? 0) > 0 && <span className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--pc-red)]"><Clock className="h-4 w-4" aria-hidden /> {counts.overdue} overdue</span>}
      </nav>

      {state === 'held' ? (
        held.length === 0 ? <p className="text-sm text-muted-foreground">No posts waiting. Posts land here when screening spots money talk or blocked words.</p> : (
          <ul className="divide-y divide-border border-y border-border">
            {held.map((p) => (
              <li key={p.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{p.kind} · {p.author} · flags: <span className="pc-mono">{p.flags.join(', ') || '—'}</span></p>
                  <p className="mt-1 font-semibold">{p.title ?? '(no title)'}</p>
                  <p className="mt-1 line-clamp-3 text-sm">{p.body}</p>
                </div>
                <div className="flex items-start gap-2">
                  <button type="button" className="pc-btn pc-btn-sm" onClick={() => decideHeld(p, 'live')}>Publish</button>
                  <button type="button" className="pc-btn pc-btn-danger pc-btn-sm" onClick={() => decideHeld(p, 'removed')}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in this queue.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          <ul className="divide-y divide-border border-y border-border" aria-label="Reports">
            {items.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => setActive(i.id)} aria-current={active === i.id}
                  className={cn('block w-full px-3 py-3 text-left', active === i.id ? 'bg-accent' : 'hover:bg-accent/50')}>
                  <div className="flex items-center gap-2">
                    {i.priority === 'safety' && <span className="pc-tag border border-[color:var(--pc-red)] text-[color:var(--pc-red)]"><AlertTriangle className="mr-1 h-3 w-3" aria-hidden />Safety</span>}
                    <span className="text-sm font-semibold">{REASON[i.reason] ?? i.reason}</span>
                    <span className="pc-mono ml-auto text-xs text-muted-foreground">{i.reportCount}×</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{i.preview.body}</p>
                  <p className={cn('pc-mono mt-1 text-xs', i.overdue ? 'font-semibold text-[color:var(--pc-red)]' : 'text-muted-foreground')}>{i.targetType} · {due(i.dueAt)}</p>
                </button>
              </li>
            ))}
          </ul>

          {current && (
            <section className="pc-surface p-5" aria-label="Report detail">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl">{REASON[current.reason] ?? current.reason}</h2>
                {current.priority === 'safety' && <span className="pc-tag border border-[color:var(--pc-red)] text-[color:var(--pc-red)]">Safety · 2 h</span>}
                <span className={cn('pc-mono text-xs', current.overdue ? 'text-[color:var(--pc-red)]' : 'text-muted-foreground')}>{due(current.dueAt)}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Reported by {current.reporter.name}{current.reportCount > 1 ? ` and ${current.reportCount - 1} others` : ''} · about {current.targetUser ? <Link className="pc-link" href={`/profile/${current.targetUser.username}`}>{current.targetUser.name}</Link> : 'a deleted account'}
              </p>
              {current.details && <blockquote className="mt-3 border-l-2 border-foreground pl-3 text-sm">“{current.details}”</blockquote>}
              <div className="mt-4 rounded-md border border-border bg-background p-4">
                <p className="text-xs text-muted-foreground">{current.preview.title} {current.preview.status ? `· status ${current.preview.status}` : ''}</p>
                <p className="mt-1 whitespace-pre-line text-[15px]">{current.preview.body}</p>
                {current.preview.link && <Link href={current.preview.link} target="_blank" className="pc-link mt-2 inline-flex items-center gap-1 text-sm">Open in context <ExternalLink className="h-3.5 w-3.5" aria-hidden /></Link>}
              </div>
              {state === 'open' || state === 'in_review' ? (
                <>
                  <label className="mt-4 block text-sm font-medium" htmlFor="mod-note">Note (sent to the person, kept in the audit log)</label>
                  <textarea id="mod-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} className="pc-input mt-1" placeholder="Shared a UPI ID asking for an advance" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ACTIONS.filter((a) => (!a.adminOnly || isAdmin) && (!a.content || current.targetType !== 'user')).map((a) => (
                      <button key={a.id} type="button" disabled={busy} onClick={() => act(a.id)} className={cn('pc-btn pc-btn-sm', a.id === 'dismiss' ? 'pc-btn-quiet' : a.danger ? 'pc-btn-danger' : 'pc-btn-outline')}>{a.label}</button>
                    ))}
                  </div>
                </>
              ) : <p className="mt-4 text-sm text-muted-foreground">Resolved.</p>}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
