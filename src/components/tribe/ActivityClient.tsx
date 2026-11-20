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

/** Activity: notifications grouped by category, join requests decided inline. */
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
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 lg:pt-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="fc-largetitle">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">{unread ? `${unread} new` : 'All caught up'}</p>
        </div>
        {unread > 0 && <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm" onClick={markAll}>Mark all read</button>}
      </div>
      <div className="fc-scroll-x -mx-4 mt-4 gap-2 px-4 pb-1" role="toolbar" aria-label="Filter activity">
        {CATS.map((c) => <button key={c.id} type="button" className="pc-chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>)}
      </div>
      {shown.length === 0 ? (
        <div className="pc-card mt-6 p-8 text-center">
          <span className="fc-act-ic mx-auto"><Bell aria-hidden /></span>
          <p className="mt-3 font-bold">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Join a plan or post a story and replies will show up here.</p>
          <Link href="/tribe" className="pc-btn pc-btn-sm mt-4">Open Tribe</Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {shown.map((n) => {
            const Icon = ICON[n.category] ?? Bell
            const isJoin = n.type === 'tribe_join_request'
            return (
              <li key={n.id} className={cn('fc-act', !n.isRead && 'is-unread')}>
                <span className="fc-act-ic"><Icon aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <Link href={safeInternalLink(n.link)} className="block">
                    <p className={cn('text-[15px] leading-snug', !n.isRead ? 'font-bold' : 'font-medium')}>{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-xs font-semibold text-[color:var(--pc-ink3)]">{ago(n.createdAt)}</p>
                  </Link>
                  {isJoin && n.postId && n.actorId && (
                    decided[n.id] ? <p className="mt-2 text-sm font-semibold text-[color:var(--pc-accent-ink)]">{decided[n.id] === 'approved' ? 'Approved · they can see the plan chat now' : 'Declined'}</p> : (
                      <div className="mt-2.5 flex gap-2">
                        <button type="button" className="pc-btn pc-btn-sm" onClick={() => decide(n, 'approve')}>Approve</button>
                        <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm" onClick={() => decide(n, 'decline')}>Decline</button>
                      </div>
                    )
                  )}
                </div>
                {!n.isRead && <span className="fc-dot mt-2" aria-label="Unread" />}
              </li>
            )
          })}
        </ul>
      )}
      {cursor && <button type="button" className="pc-btn pc-btn-quiet pc-btn-block mt-4" onClick={more}>Show older</button>}
    </div>
  )
}
