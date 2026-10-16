import Link from 'next/link'
import { MessageSquare, Trophy } from 'lucide-react'
import { getRequestAuth } from '@/lib/auth/request-session'
import { getLeaderboardRank } from '@/lib/leaderboard-rank'
import { WanderStatusRail } from '@/components/wander/WanderStatusRail'

export async function WanderCommunityPanel() {
  const { supabase, user } = await getRequestAuth()
  const rank = user ? await getLeaderboardRank(supabase, user.id).catch(() => null) : null

  return (
    <div className="glass-card flex h-full flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-black tracking-tight text-foreground">From the community</h3>
        <Link href="/community" className="text-xs font-semibold text-primary hover:underline">
          Open community
        </Link>
      </div>
      <WanderStatusRail />
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
          {rank ? <>Leaderboard: you&apos;re #{rank}</> : 'Leaderboard'}
        </Link>
      </div>
    </div>
  )
}
