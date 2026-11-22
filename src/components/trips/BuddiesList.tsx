'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, MessageCircle, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { startDirectMessage } from '@/actions/profile'
import { getInitials } from '@/lib/utils'
import { v1 } from '@/lib/api/v1-client'
import { WANDER_HOME_SEARCH_HREF } from '@/lib/routing/wanderLandingPath'

type Buddy = {
  user: { id: string; username: string; name: string; avatarUrl: string | null; isIdVerified?: boolean; isHost?: boolean }
  score: number
  reasons: string[]
  trip: { slug: string; title: string } | null
  planId: string | null
}

/** GET /api/v1/buddies: people to travel with, best first, with why. */
export function BuddiesList() {
  const [items, setItems] = useState<Buddy[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    let live = true
    void v1<{ items: Buddy[] }>('/buddies').then((r) => {
      if (!live) return
      if (r.ok) setItems(r.data.items)
      else setError(r.error)
    })
    return () => { live = false }
  }, [])

  async function message(id: string) {
    setOpening(id)
    const res = await startDirectMessage(id)
    setOpening(null)
    if ('error' in res && res.error) { toast.error(res.error); return }
    if ('roomId' in res && res.roomId) router.push(`/community/${res.roomId}`)
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!items) {
    return <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="pc-skel h-24 rounded-2xl" />)}</div>
  }
  if (!items.length) {
    return (
      <EmptyState
        icon={UsersRound}
        title="No buddies yet"
        description="Book a trip, post a plan or save a few trips and we’ll show people going your way."
        action={{ label: 'Explore trips', href: WANDER_HOME_SEARCH_HREF }}
        dashed
      />
    )
  }

  return (
    <ul className="space-y-3">
      {items.map((b) => (
        <li key={b.user.id} className="pc-card flex items-start gap-3 p-4">
          <Link href={`/profile/${encodeURIComponent(b.user.username)}`} className="shrink-0">
            <Avatar className="h-12 w-12">
              <AvatarImage src={b.user.avatarUrl || ''} alt="" />
              <AvatarFallback className="bg-primary/20 text-sm font-bold text-foreground">{getInitials(b.user.name || b.user.username)}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/profile/${encodeURIComponent(b.user.username)}`} className="font-semibold text-foreground hover:underline">
              {b.user.name || b.user.username}
            </Link>
            <span className="ml-1.5 text-xs text-muted-foreground">@{b.user.username}</span>
            <ul className="mt-1 space-y-0.5 text-[13px] text-muted-foreground">
              {b.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void message(b.user.id)}
                disabled={opening === b.user.id}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background disabled:opacity-70"
              >
                {opening === b.user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <MessageCircle className="h-3.5 w-3.5" aria-hidden />}Message
              </button>
              <Link href={`/profile/${encodeURIComponent(b.user.username)}`} className="inline-flex h-9 items-center rounded-full border border-border px-3.5 text-[13px] font-semibold text-foreground hover:border-primary">
                View profile
              </Link>
              {b.trip ? (
                <Link href={`/packages/${encodeURIComponent(b.trip.slug)}`} className="inline-flex h-9 items-center rounded-full border border-border px-3.5 text-[13px] font-semibold text-foreground hover:border-primary">
                  {b.trip.title}
                </Link>
              ) : b.planId ? (
                <Link href={`/tribe/p/${encodeURIComponent(b.planId)}`} className="inline-flex h-9 items-center rounded-full border border-border px-3.5 text-[13px] font-semibold text-foreground hover:border-primary">
                  Their plan
                </Link>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
