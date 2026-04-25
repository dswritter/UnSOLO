'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BarChart2, Loader2 } from 'lucide-react'
import { castChatPollVote, getPollStateForMessage } from '@/actions/chat'
import type { ChatPollState } from '@/lib/chat/getRoomPollsState'
function votePercent(count: number, total: number) {
  if (total <= 0) return 0
  return Math.round((count / total) * 1000) / 10
}

export function ChatPollCard({
  roomId,
  messageId,
  initial,
}: {
  roomId: string
  messageId: string
  initial: ChatPollState | null
}) {
  const router = useRouter()
  const [state, setState] = useState<ChatPollState | null>(initial)
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState(false)

  const load = useCallback(async () => {
    if (initial) {
      setState(initial)
      return
    }
    setLoading(true)
    try {
      const r = await getPollStateForMessage(messageId)
      if (r.state) setState(r.state)
      else if (r.error) toast.error('Could not load poll')
    } finally {
      setLoading(false)
    }
  }, [messageId, initial])

  useEffect(() => {
    if (initial) {
      setState(initial)
    } else {
      void load()
    }
  }, [initial, load])

  if (loading && !state) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading poll…
      </div>
    )
  }
  if (!state) {
    return <p className="text-xs text-muted-foreground">Poll unavailable</p>
  }

  const totalVotes = state.options.reduce((s, o) => s + o.voteCount, 0)
  const ended = state.endsAt ? new Date(state.endsAt) < new Date() : false

  async function onPick(optionId: string) {
    const s = state
    if (!s) return
    if (ended) {
      toast.error('This poll has ended')
      return
    }
    if (toggling) return
    setToggling(true)
    try {
      let next: string[]
      if (s.allowMultiple) {
        const has = s.myOptionIds.includes(optionId)
        next = has ? s.myOptionIds.filter(id => id !== optionId) : [...s.myOptionIds, optionId]
      } else {
        next = s.myOptionIds[0] === optionId ? [] : [optionId]
      }
      const r = await castChatPollVote(roomId, s.pollId, next)
      if (r.error) {
        toast.error(r.error)
        return
      }
      const r2 = await getPollStateForMessage(messageId)
      if (r2.state) setState(r2.state)
      router.refresh()
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card/80 px-3 py-2.5 w-full min-w-0 max-w-sm shadow-sm">
      <div className="flex items-start gap-2 mb-2">
        <BarChart2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug break-words">{state.question}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {state.allowMultiple ? 'Select one or more options' : 'Select one option'}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        {state.options.map(o => {
          const pct = votePercent(o.voteCount, totalVotes)
          const selected = state.myOptionIds.includes(o.id)
          return (
            <button
              key={o.id}
              type="button"
              disabled={toggling || ended}
              onClick={() => void onPick(o.id)}
              className={`relative w-full text-left rounded-lg overflow-hidden border transition-colors ${
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-secondary/40 hover:bg-secondary/80'
              } ${ended ? 'opacity-90' : ''}`}
            >
              <div
                className="absolute inset-y-0 left-0 bg-primary/25 pointer-events-none"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
              <div className="relative px-2.5 py-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium pr-1 break-words">{o.label}</span>
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground shrink-0">
                  {o.voteCount > 0 ? `${pct}%` : '—'}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        {totalVotes} vote{totalVotes === 1 ? '' : 's'}
        {state.endsAt ? ` · ${ended ? 'Ended' : `Ends ${new Date(state.endsAt).toLocaleString()}`}` : ''}
      </p>
    </div>
  )
}
