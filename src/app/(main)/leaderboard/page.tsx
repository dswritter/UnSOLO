import type { Metadata } from 'next'
import { getCachedLeaderboardBoard } from '@/lib/leaderboard/leaderboardBoard'
import { LeaderboardV2Client } from '@/components/leaderboard/LeaderboardV2Client'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Travel Leaderboard — UnSOLO',
  description: 'Top solo travellers in India. Compete, explore, and earn your way to the top.',
}

// Static/ISR: the shared board is served to everyone from cache; the viewer's
// own rank is filled in client-side (LeaderboardV2Client → getMyLeaderboardStanding).
export default async function LeaderboardPage() {
  const { entries, monthlyEntries } = await getCachedLeaderboardBoard()

  return <LeaderboardV2Client entries={entries} monthlyEntries={monthlyEntries} />
}
