'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, MessageCircle, Search, ShieldCheck, Undo2, BadgeCheck } from 'lucide-react'
import { useAuth } from '@/components/layout/AuthProvider'
import { getMyLeaderboardStanding } from '@/actions/leaderboard'

const STEPS = [
  { icon: Search, title: 'Find your trip', body: 'Browse curated group trips, stays and activities by vibe, budget or region.' },
  { icon: MessageCircle, title: 'Meet your tribe', body: 'Join the trip chat before you go — say hi to your host and co-travellers.' },
  { icon: CalendarCheck, title: 'Book & go', body: 'Lock your seat in minutes, then just show up. We handle the rest.' },
]

const PROMISES = [
  { icon: BadgeCheck, label: 'Verified hosts' },
  { icon: ShieldCheck, label: 'Secure payments' },
  { icon: Undo2, label: 'Clear refund policy', href: '/refund-policy' },
]

/** Static explainer for first-time visitors; hidden once we know the viewer is signed in. */
export function WanderHowItWorks() {
  const { userId, loading } = useAuth()
  if (loading || userId) return null
  return (
    <section aria-labelledby="wander-how-it-works" className="mt-10 md:mt-14">
      <div className="wander-frost-panel p-5 md:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">New here?</p>
        <h2 id="wander-how-it-works" className="mt-1 text-xl font-black tracking-tight md:text-2xl">How UnSOLO works</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3 md:gap-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <step.icon className="h-5 w-5" />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">{i + 1}</span>
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold md:text-base">{step.title}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-col gap-4 border-t border-foreground/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <ul className="flex flex-wrap gap-2">
            {PROMISES.map(p => {
              const content = <><p.icon className="h-3.5 w-3.5 text-primary" />{p.label}</>
              const cls = 'inline-flex items-center gap-1.5 rounded-full border border-foreground/12 bg-foreground/[0.04] px-3 py-1.5 text-xs font-semibold'
              return <li key={p.label}>{p.href ? <Link href={p.href} className={`${cls} hover:border-primary/50`}>{content}</Link> : <span className={cls}>{content}</span>}</li>
            })}
          </ul>
          <Link href="/signup" className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90">
            Create free account
          </Link>
        </div>
      </div>
    </section>
  )
}

type Standing = Awaited<ReturnType<typeof getMyLeaderboardStanding>>

/** Personal rank chip for the leaderboard teaser — resolved client-side so the teaser stays cached. */
export function WanderMyLeaderboardRank() {
  const { userId, loading } = useAuth()
  const [standing, setStanding] = useState<{ userId: string; value: Standing } | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getMyLeaderboardStanding()
      .then(value => { if (!cancelled) setStanding({ userId, value }) })
      .catch(() => { if (!cancelled) setStanding({ userId, value: null }) })
    return () => { cancelled = true }
  }, [userId])

  const chip = 'rounded-xl border border-foreground/12 bg-foreground/[0.04] px-4 py-3 text-sm'
  if (loading) return <div className={`${chip} h-[3.25rem] animate-pulse`} aria-hidden />
  if (!userId) {
    return <div className={chip}><Link href="/login?redirectTo=/leaderboard" className="font-semibold text-primary hover:underline">Sign in</Link> to see where you rank.</div>
  }
  const current = standing?.userId === userId ? standing.value : undefined
  if (current === undefined) return <div className={`${chip} h-[3.25rem] animate-pulse`} aria-hidden />
  if (!current?.myRank || !current.myEntry) {
    return <div className={chip}>You&apos;re not on the board yet — <Link href="/?search=1&tab=trips#wander-explore" className="font-semibold text-primary hover:underline">complete a trip</Link> to start climbing.</div>
  }
  return (
    <div className={`${chip} flex items-center justify-between gap-3`}>
      <span>Your rank <span className="text-lg font-black text-primary">#{current.myRank}</span></span>
      <span className="text-muted-foreground">{current.myEntry.total_score.toLocaleString('en-IN')} pts</span>
    </div>
  )
}
