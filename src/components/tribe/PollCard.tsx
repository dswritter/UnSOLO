'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, newClientId } from '@/lib/api/client'
import type { Post } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'

type Poll = NonNullable<Post['poll']>

/**
 * Tap-to-vote poll. Before voting: big outlined rows. After: result bars, your choice in sun gold.
 * A vote is a reply with `pollChoice` (the API keeps one vote per person).
 */
export function PollOptions({ post, signedIn, demo, onVote, showTotal = true }: {
  post: Post
  signedIn: boolean
  demo?: boolean
  /** Detail page passes its own handler so the vote also shows up in the replies list. */
  onVote?: (choice: string, label: string) => void | Promise<void>
  showTotal?: boolean
}) {
  const router = useRouter()
  const [poll, setPoll] = useState<Poll>(post.poll!)
  const total = poll.options.reduce((s, o) => s + o.votes, 0)
  const voted = !!poll.myChoice

  async function vote(id: string) {
    if (!signedIn) { router.push(`/login?redirectTo=${encodeURIComponent(`/tribe/p/${post.id}`)}`); return }
    if (voted) return
    const prev = poll
    const label = poll.options.find((o) => o.id === id)?.label ?? ''
    setPoll({ myChoice: id, options: poll.options.map((o) => (o.id === id ? { ...o, votes: o.votes + 1 } : o)) })
    if (demo) return
    try {
      if (onVote) await onVote(id, label)
      else await apiFetch(`/posts/${post.id}/comments`, { body: { clientId: newClientId(), body: `Voted: ${label}`, parentId: null, pollChoice: id } })
    } catch (e) {
      setPoll(prev)
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <ul className="fc-poll" aria-label="Poll options">
        {poll.options.map((o) => {
          const pct = total ? Math.round((o.votes / total) * 100) : 0
          const mine = poll.myChoice === o.id
          return (
            <li key={o.id}>
              {voted ? (
                <div className={cn('fc-opt', mine && 'is-mine')} aria-label={`${o.label}: ${pct}%${mine ? ', your vote' : ''}`}>
                  <span className="fc-opt-bar" style={{ width: `${pct}%` }} aria-hidden />
                  <span>{mine && <CircleCheck className="h-[18px] w-[18px] shrink-0" aria-hidden />}<span className="truncate">{o.label}</span></span>
                  <span>{pct}%</span>
                </div>
              ) : (
                <button type="button" className="fc-opt is-vote" onClick={() => void vote(o.id)}>
                  <span><span className="truncate">{o.label}</span></span>
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {showTotal && (
        <p className="mt-2.5 text-[13px] font-semibold text-[color:var(--pc-ink3)]">
          {total} {total === 1 ? 'vote' : 'votes'}{voted ? '' : ' · tap to vote'}
        </p>
      )}
    </div>
  )
}
