import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getLeaderboardSnapshot } from '@/lib/leaderboard/leaderboardSnapshot'
import { LeaderboardV2Client } from '@/components/leaderboard/LeaderboardV2Client'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Travel Leaderboard — UnSOLO',
  description: 'Top solo travellers in India. Compete, explore, and earn your way to the top.',
}

export default async function LeaderboardV2Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
