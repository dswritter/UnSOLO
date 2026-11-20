'use client'

import { useState, useTransition } from 'react'
import { Heart, Lightbulb, MapPin, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api/client'
import type { Post, ReactionKind } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'

const META: { kind: ReactionKind; key: keyof Post['reactions']; label: string; icon: typeof Heart }[] = [
  { kind: 'want_to_go', key: 'wantToGo', label: 'Want to go', icon: MapPin },
  { kind: 'helpful', key: 'helpful', label: 'Helpful', icon: Lightbulb },
  { kind: 'love', key: 'love', label: 'Love', icon: Heart },
]

/** Optimistic reactions: the chip flips immediately; the server result reconciles; errors roll back. */
export function ReactionBar({ post, signedIn, demo, compact }: { post: Post; signedIn: boolean; demo?: boolean; compact?: boolean }) {
  const [counts, setCounts] = useState(post.reactions)
  const [mine, setMine] = useState<ReactionKind[]>(post.myReactions)
  const [, start] = useTransition()
  const router = useRouter()
  const kinds = post.kind === 'ask' ? META.filter((m) => m.kind === 'helpful') : post.kind === 'plan' ? META.filter((m) => m.kind !== 'helpful') : META

  function toggle(kind: ReactionKind, key: keyof Post['reactions']) {
    if (!signedIn) {
      router.push(`/login?redirectTo=${encodeURIComponent(`/tribe/p/${post.id}`)}`)
      return
    }
    const on = mine.includes(kind)
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {kinds.map(({ kind, key, label, icon: Icon }) => {
        const on = mine.includes(kind)
        return (
          <button key={kind} type="button" aria-pressed={on} onClick={() => toggle(kind, key)}
            className={cn('pc-chip min-h-[44px] sm:min-h-[36px]', compact && 'px-2.5')}>
            <Icon className={cn('h-4 w-4', on && kind === 'love' && 'fill-current')} aria-hidden />
            <span>{label}</span>
            {counts[key] > 0 && <span className="pc-count">{counts[key]}</span>}
          </button>
        )
      })}
      <Link href={`/tribe/p/${post.id}#comments`} className="pc-chip min-h-[44px] sm:min-h-[36px]">
        <MessageCircle className="h-4 w-4" aria-hidden />
        <span>{post.kind === 'ask' ? 'Answer' : 'Reply'}</span>
        {post.commentCount > 0 && <span className="pc-count">{post.commentCount}</span>}
      </Link>
    </div>
  )
}
