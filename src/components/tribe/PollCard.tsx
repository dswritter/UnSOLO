'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api/client'
import type { Post } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'

type Poll = NonNullable<Post['poll']>

/**
 * Tap-to-vote poll. Before voting: big outlined rows. After: result bars, your choice in sun gold;
 * tap another option to change your vote, or yours again to take it back. Votes go to
 * PUT /posts/{id}/vote (one per person), never into the replies.
 */
export function PollOptions({ post, signedIn, demo, showTotal = true }: {
  post: Post
  signedIn: boolean
  demo?: boolean
  showTotal?: boolean
}) {
  const router = useRouter()
  const [poll, setPoll] = useState<Poll>(post.poll!)
  const seq = useRef(0)
  const total = poll.options.reduce((s, o) => s + o.votes, 0)
  const voted = !!poll.myChoice

  async function vote(id: string) {
    if (!signedIn) { router.push(`/login?redirectTo=${encodeURIComponent(`/tribe/p/${post.id}`)}`); return }
    const prev = poll
    const next = poll.myChoice === id ? null : id
    // Move the vote at once; the server's counts replace these when it answers.
    setPoll({
      myChoice: next,
      options: poll.options.map((o) => ({ ...o, votes: o.votes - (o.id === poll.myChoice ? 1 : 0) + (o.id === next ? 1 : 0) })),
    })
    if (demo) return
    const mine = ++seq.current
    try {
      const r = await apiFetch<{ poll: Poll }>(`/posts/${post.id}/vote`, { method: 'PUT', body: { choice: next } })
      if (mine === seq.current) setPoll(r.poll)
    } catch (e) {
      if (mine === seq.current) setPoll(prev)
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
                <button type="button" className={cn('fc-opt', mine && 'is-mine')} onClick={() => void vote(o.id)}
                  aria-pressed={mine} aria-label={`${o.label}: ${pct}%${mine ? ', your vote. Tap to take it back' : '. Tap to vote for this instead'}`}>
                  <span className="fc-opt-bar" style={{ width: `${pct}%`, transition: 'width 220ms ease-out' }} aria-hidden />
                  <span>{mine && <CircleCheck className="h-[18px] w-[18px] shrink-0" aria-hidden />}<span className="truncate">{o.label}</span></span>
                  <span>{pct}%</span>
                </button>
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
          {total} {total === 1 ? 'vote' : 'votes'}{voted ? ' · tap to change' : ' · tap to vote'}
        </p>
      )}
    </div>
  )
}
