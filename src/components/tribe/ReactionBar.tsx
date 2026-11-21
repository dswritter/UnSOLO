'use client'

import { useState, useTransition } from 'react'
import { Bookmark, Heart, Lightbulb, MapPin, MessageCircle, Share2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api/client'
import type { Post, ReactionKind } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'

const META: { kind: ReactionKind; key: keyof Post['reactions']; label: string; icon: typeof Heart }[] = [
  { kind: 'love', key: 'love', label: 'Love', icon: Heart },
  { kind: 'want_to_go', key: 'wantToGo', label: 'Want to go', icon: MapPin },
  { kind: 'helpful', key: 'helpful', label: 'Helpful', icon: Lightbulb },
]

export function reactionKindsFor(kind: Post['kind']) {
  return kind === 'ask' ? META.filter((m) => m.kind === 'helpful') : kind === 'plan' ? META.filter((m) => m.kind !== 'helpful') : META
}

/** Shared optimistic toggle for a post's reactions (feed row, detail, story viewer). */
export function useReactions(post: Post, signedIn: boolean, demo?: boolean) {
  const [counts, setCounts] = useState(post.reactions)
  const [mine, setMine] = useState<ReactionKind[]>(post.myReactions)
  const [, start] = useTransition()
  const router = useRouter()
  function toggle(kind: ReactionKind, key: keyof Post['reactions'], force?: boolean) {
    if (!signedIn) {
      router.push(`/login?redirectTo=${encodeURIComponent(`/tribe/p/${post.id}`)}`)
      return
    }
    const on = mine.includes(kind)
    if (force === true && on) return
    const prev = { counts, mine }
    setMine(on ? mine.filter((k) => k !== kind) : [...mine, kind])
    setCounts({ ...counts, [key]: Math.max(counts[key] + (on ? -1 : 1), 0) })
    if (demo) return
    start(async () => {
      try {
        const r = await apiFetch<{ reactions: Post['reactions']; myReactions: ReactionKind[] }>(`/posts/${post.id}/reactions/${kind}`, { method: on ? 'DELETE' : 'PUT' })
        setCounts(r.reactions)
        setMine(r.myReactions)
      } catch (e) {
        setCounts(prev.counts)
        setMine(prev.mine)
        toast.error((e as Error).message)
      }
    })
  }
  return { counts, mine, toggle }
}

export async function sharePost(post: Post) {
  const url = `${location.origin}/tribe/p/${post.id}`
  const text = post.title ?? post.body.slice(0, 80)
  if (navigator.share) await navigator.share({ title: text, url }).catch(() => undefined)
  else { await navigator.clipboard?.writeText(url).catch(() => undefined); toast.success('Link copied') }
}

/**
 * Reactions row: icon + count buttons (44px targets), replies, share and save.
 * Optimistic: the icon flips immediately; the server result reconciles; errors roll back.
 */
export function ReactionBar({ post, signedIn, demo, compact, onComment, commentExpanded, showSave = true }: {
  post: Post
  signedIn: boolean
  demo?: boolean
  compact?: boolean
  /** Detail page: focus the comment box instead of navigating. */
  onComment?: () => void
  /** Feed cards: whether the inline replies are open (aria-expanded). */
  commentExpanded?: boolean
  showSave?: boolean
}) {
  const { counts, mine, toggle } = useReactions(post, signedIn, demo)
  const [saved, setSaved] = useState(post.viewer.saved)
  const router = useRouter()

  async function toggleSave() {
    if (!signedIn) { router.push(`/login?redirectTo=${encodeURIComponent(`/tribe/p/${post.id}`)}`); return }
    const next = !saved
    setSaved(next)
    if (demo) return
    try { await apiFetch(`/posts/${post.id}/save`, { method: next ? 'PUT' : 'DELETE' }) } catch (e) { setSaved(!next); toast.error((e as Error).message) }
  }

  const commentLabel = post.kind === 'ask' ? `${post.commentCount} answers` : `${post.commentCount} replies`
  const commentInner = <><MessageCircle aria-hidden /><span>{post.commentCount > 0 ? post.commentCount : ''}</span>{post.kind === 'ask' && !compact && <span className="sr-only">answers</span>}</>

  return (
    <div className="fc-reacts">
      {reactionKindsFor(post.kind).map(({ kind, key, label, icon: Icon }) => (
        <button key={kind} type="button" aria-pressed={mine.includes(kind)} aria-label={`${label}${counts[key] ? `, ${counts[key]}` : ''}`} title={label}
          onClick={() => toggle(kind, key)} className={cn('fc-react', kind === 'love' && 'is-love')}>
          <Icon aria-hidden />{counts[key] > 0 && <span>{counts[key]}</span>}
        </button>
      ))}
      {onComment
        ? <button type="button" className="fc-react" aria-label={commentLabel} aria-expanded={commentExpanded} onClick={onComment}>{commentInner}</button>
        : <Link href={`/tribe/p/${post.id}#comments`} className="fc-react" aria-label={commentLabel}>{commentInner}</Link>}
      <button type="button" className="fc-react" aria-label="Share" onClick={() => void sharePost(post)}><Share2 aria-hidden /></button>
      <span className="flex-1" />
      {showSave && (
        <button type="button" className="fc-react" aria-pressed={saved} aria-label={saved ? 'Saved' : 'Save'} onClick={toggleSave}>
          <Bookmark aria-hidden className={cn(saved && 'fill-current')} />
        </button>
      )}
    </div>
  )
}
