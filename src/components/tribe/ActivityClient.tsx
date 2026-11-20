'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, CalendarDays, MessageCircle, Tag, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api/client'
import { trackScreen } from '@/lib/analytics/client'
import type { NotificationItem } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { safeInternalLink } from '@/lib/links'
import { ago } from './format'

const CATS = [
  { id: 'all', label: 'All' }, { id: 'plans', label: 'Plans' }, { id: 'replies', label: 'Replies' },
  { id: 'trips', label: 'Trips' }, { id: 'tags', label: 'Tags' }, { id: 'system', label: 'Account' },
] as const
const ICON = { plans: CalendarDays, replies: MessageCircle, messages: MessageCircle, trips: Ticket, tags: Tag, system: Bell }

export function ActivityClient({ initial, initialCursor }: { initial: NotificationItem[]; initialCursor: string | null }) {
  const [items, setItems] = useState(initial)
  const [cursor, setCursor] = useState(initialCursor)
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('all')
  const [decided, setDecided] = useState<Record<string, 'approved' | 'declined'>>({})

  useEffect(() => { trackScreen('activity') }, [])

  async function more() {
    if (!cursor) return
    const r = await apiFetch<{ items: NotificationItem[]; nextCursor: string | null }>(`/notifications?cursor=${encodeURIComponent(cursor)}`)
    setItems((x) => [...x, ...r.items])
    setCursor(r.nextCursor)
  }
  async function markAll() {
    setItems((x) => x.map((n) => ({ ...n, isRead: true })))
    await apiFetch('/notifications/read', { body: { all: true } }).catch(() => undefined)
  }
  async function decide(n: NotificationItem, decision: 'approve' | 'decline') {
    if (!n.postId || !n.actorId) return
    setDecided((d) => ({ ...d, [n.id]: decision === 'approve' ? 'approved' : 'declined' }))
    try {
      await apiFetch(`/posts/${n.postId}/requests/${n.actorId}`, { body: { decision } })
      await apiFetch('/notifications/read', { body: { ids: [n.id] } })
    } catch (e) {
      setDecided((d) => { const c = { ...d }; delete c[n.id]; return c })
      toast.error((e as Error).message)
    }
  }

  const shown = cat === 'all' ? items : items.filter((n) => n.category === cat || (cat === 'replies' && n.category === 'messages'))
  const unread = items.filter((n) => !n.isRead).length

  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-4 lg:pt-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] leading-none">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">{unread ? `${unread} new` : 'All caught up'}</p>
        </div>
        {unread > 0 && <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm" onClick={markAll}>Mark all read</button>}
      </div>
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide" role="toolbar" aria-label="Filter activity">
        {CATS.map((c) => <button key={c.id} type="button" className="pc-chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>)}
      </div>
      {shown.length === 0 ? (
        <p className="mt-10 text-center text-muted-foreground">Nothing here yet. Join a plan or post a story and replies will show up here.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {shown.map((n) => {
            const Icon = ICON[n.category] ?? Bell
            const isJoin = n.type === 'tribe_join_request'
            return (
              <li key={n.id} className={cn('flex gap-3 py-4', !n.isRead && 'bg-[color:var(--pc-raised)]')}>
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border"><Icon className="h-4 w-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <Link href={safeInternalLink(n.link)} className="block">
                    <p className={cn('text-[15px]', !n.isRead && 'font-semibold')}>{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.body}</p>}
                    <p className="pc-mono mt-1 text-xs text-muted-foreground">{ago(n.createdAt)}</p>
                  </Link>
                  {isJoin && n.postId && n.actorId && (
                    decided[n.id] ? <p className="mt-2 text-sm font-medium">{decided[n.id] === 'approved' ? 'Approved · they can see the plan chat now' : 'Declined'}</p> : (
                      <div className="mt-2 flex gap-2">
                        <button type="button" className="pc-btn pc-btn-sm" onClick={() => decide(n, 'approve')}>Approve</button>
                        <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm" onClick={() => decide(n, 'decline')}>Decline</button>
                      </div>
                    )
                  )}
                </div>
                {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[color:var(--pc-red)]" aria-label="Unread" />}
              </li>
            )
          })}
        </ul>
      )}
      {cursor && <button type="button" className="pc-btn pc-btn-quiet pc-btn-block mt-4" onClick={more}>Show older</button>}
    </div>
  )
}
