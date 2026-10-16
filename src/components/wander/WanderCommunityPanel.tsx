import { Suspense } from 'react'
import Link from 'next/link'
import { MessageSquare, Trophy } from 'lucide-react'
import { getRequestAuth } from '@/lib/auth/request-session'
import { getLeaderboardRank } from '@/lib/leaderboard-rank'
import { WanderStatusRail } from '@/components/wander/WanderStatusRail'

async function LeaderboardRankLabel() {
  const { supabase, user } = await getRequestAuth()
  const rank = user ? await getLeaderboardRank(supabase, user.id).catch(() => null) : null
  return rank ? <>Leaderboard: you&apos;re #{rank}</> : <>Leaderboard</>
}

/** Same footprint as the loaded rail so streaming in doesn't shift the panel. */
function StatusRailPlaceholder() {
  return (
    <div className="flex min-h-[3.5rem] items-center gap-3" aria-label="Loading traveller stories">
      <div className="w-[9.75rem] shrink-0 sm:w-[10.75rem]">
        <p className="text-sm font-bold leading-tight text-foreground">Traveler status</p>
        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">See what your connections are up to.</p>
      </div>
      <div className="flex gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="h-12 w-12 rounded-full border-2 border-border bg-foreground/[0.04]" />
        ))}
      </div>
    </div>
  )
}

/** Panel chrome renders immediately; only the stories and the rank stream in. */
export function WanderCommunityPanel() {
  return (
    <div className="glass-card flex h-full flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-black tracking-tight text-foreground">From the community</h3>
        <Link href="/community" className="text-xs font-semibold text-primary hover:underline">
          Open community
        </Link>
      </div>
      <Suspense fallback={<StatusRailPlaceholder />}>
        <WanderStatusRail />
      </Suspense>
      <div className="mt-auto flex flex-wrap gap-2">
        <Link
          href="/community"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary"
        >
          <MessageSquare className="h-3.5 w-3.5 text-primary" /> Trip chats &amp; travellers
        </Link>
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary"
        >
          <Trophy className="h-3.5 w-3.5 text-primary" />
          <Suspense fallback="Leaderboard">
            <LeaderboardRankLabel />
          </Suspense>
        </Link>
      </div>
    </div>
  )
}
