'use client'

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Post, UserLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { StoryRing } from './SeatRing'
import { StoryViewer, type StoryGroup } from './StoryViewer'
import { initials } from './format'

const SEEN_KEY = 'unsolo.storySeen'
const listeners = new Set<() => void>()
let seenCache: string | null = null

/** Seen story ids live in this browser only (a per-viewer convenience; nothing breaks without it). */
function readSeen(): string {
  if (seenCache !== null) return seenCache
  try { seenCache = localStorage.getItem(SEEN_KEY) ?? '' } catch { seenCache = '' }
  return seenCache
}
function markSeen(id: string) {
  const cur = readSeen()
  if (cur.split(',').includes(id)) return
  seenCache = [id, ...cur.split(',').filter(Boolean)].slice(0, 300).join(',')
  try { localStorage.setItem(SEEN_KEY, seenCache) } catch { /* private mode */ }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }

/** Story posts → one group per author (most recent author first, their stories oldest → newest). */
export function groupStories(posts: Post[]): StoryGroup[] {
  const by = new Map<string, StoryGroup>()
  for (const p of posts) {
    if (p.kind !== 'story') continue
    const g = by.get(p.author.id) ?? { author: p.author, stories: [] }
    g.stories.push(p)
    by.set(p.author.id, g)
  }
  for (const g of by.values()) g.stories.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return [...by.values()].sort((a, b) => b.stories[b.stories.length - 1].createdAt.localeCompare(a.stories[a.stories.length - 1].createdAt))
}

function Face({ user, size }: { user: UserLite; size: number }) {
  return user.avatarUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
    : <span className="grid h-full w-full place-items-center font-bold" style={{ fontSize: size * 0.3 }}>{initials(user.name)}</span>
}

/**
 * Story rail: one ring per author with stories (one arc per story, pine unseen / rule seen).
 * Your own ring is gold with a "+" that opens the story composer. Tapping a ring opens the viewer.
 */
export function StoryRail({ posts, me, signedIn, demo, className, onCard }: {
  posts: Post[]
  me: UserLite | null
  signedIn: boolean
  demo?: boolean
  className?: string
  /** Rail sits inside a card (desktop): halo colours match the card surface. */
  onCard?: boolean
}) {
  const seenRaw = useSyncExternalStore(subscribe, readSeen, () => '')
  const seen = useMemo(() => new Set(seenRaw.split(',').filter(Boolean)), [seenRaw])
  const all = useMemo(() => groupStories(posts), [posts])
  const meId = me?.id ?? null
  const { mine, others, groups } = useMemo(() => {
    const m = meId ? all.find((g) => g.author.id === meId) ?? null : null
    const o = all.filter((g) => g !== m)
    // Viewer order: yours first, then everyone else.
    return { mine: m, others: o, groups: m ? [m, ...o] : o }
  }, [all, meId])
  const plans = useMemo(() => {
    const m = new Map<string, Post>()
    for (const p of posts) if (p.kind === 'plan' && p.status === 'live' && !m.has(p.author.id)) m.set(p.author.id, p)
    return m
  }, [posts])
  const [open, setOpen] = useState<number | null>(null)
  const close = useCallback(() => setOpen(null), [])
  const onSeen = useCallback((id: string) => markSeen(id), [])

  if (!me && others.length === 0) return null
  const composeHref = signedIn ? '/tribe/new?kind=story' : '/login?redirectTo=%2Ftribe%2Fnew%3Fkind%3Dstory'
  const S = 64

  return (
    <>
      <div className={cn('fc-srail fc-scroll-x', onCard && 'fc-card-rail', className)} role="list" aria-label="Stories">
        {me && (
          <div role="listitem" className="fc-sitem">
            <span className="fc-sitem-ring">
              {mine
                ? <button type="button" onClick={() => setOpen(0)} aria-label="Your stories"><StoryRing count={mine.stories.length} you size={S}><Face user={me} size={S} /></StoryRing></button>
                : <Link href={composeHref} aria-label="Add a story"><StoryRing count={1} you size={S}><Face user={me} size={S} /></StoryRing></Link>}
              <Link href={composeHref} className="fc-sitem-plus" aria-label="Add a story"><Plus className="h-3.5 w-3.5" strokeWidth={3} /></Link>
            </span>
            <span>Your story</span>
          </div>
        )}
        {others.map((g) => {
          const idx = groups.indexOf(g)
          const seenCount = g.stories.findIndex((s) => !seen.has(s.id))
          const n = seenCount === -1 ? g.stories.length : seenCount
          return (
            <button key={g.author.id} type="button" role="listitem" className="fc-sitem" onClick={() => setOpen(idx)}
              aria-label={`${g.author.name}: ${g.stories.length} ${g.stories.length === 1 ? 'story' : 'stories'}${n >= g.stories.length ? ', seen' : ''}`}>
              <span className="fc-sitem-ring"><StoryRing count={g.stories.length} seen={n} size={S}><Face user={g.author} size={S} /></StoryRing></span>
              <span className={cn(n < g.stories.length && 'text-[color:var(--pc-ink)]')}>{g.author.name.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>
      {open !== null && groups[open] && (
        <StoryViewer groups={groups} startGroup={open} onClose={close} onSeen={onSeen} plans={plans} signedIn={signedIn} demo={demo} />
      )}
    </>
  )
}
