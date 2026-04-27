import type { Metadata } from 'next'
import { getRequestAuth } from '@/lib/auth/request-session'
import { getLeaderboardSnapshot } from '@/lib/leaderboard/leaderboardSnapshot'
import { LeaderboardV2Client } from '@/components/leaderboard/LeaderboardV2Client'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Travel Leaderboard — UnSOLO',
  description: 'Top solo travellers in India. Compete, explore, and earn your way to the top.',
}

export default async function LeaderboardPage() {
  const { supabase, user } = await getRequestAuth()
  const { entries, myRank, myEntry, monthlyEntries, inTop100 } = await getLeaderboardSnapshot(
    supabase,
    user?.id ?? null,
  )

  return (
    <LeaderboardV2Client
      entries={entries}
      currentUserId={user?.id}
      myRank={!inTop100 ? myRank : null}
      myEntry={myEntry}
      monthlyEntries={monthlyEntries}
    />
  )
}
