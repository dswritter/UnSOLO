'use server'

import { getActionAuth } from '@/lib/auth/action-auth'
import { getLeaderboardRank } from '@/lib/leaderboard-rank'
import type { LeaderboardEntryRow } from '@/lib/leaderboard/leaderboardSnapshot'

/**
 * The signed-in viewer's own leaderboard standing (rank + their score row).
 * Called client-side from the leaderboard page after the static board loads, so
 * the "you're at rank N" card and the "You" row highlight fill in without making
 * the whole page dynamic.
 */
export async function getMyLeaderboardStanding(): Promise<{
  myRank: number | null
  myEntry: LeaderboardEntryRow | null
} | null> {
  const { supabase, user } = await getActionAuth()
  if (!user) return null

  const myRank = await getLeaderboardRank(supabase, user.id)
  const { data } = await supabase
    .from('leaderboard_scores')
    .select('*, profile:profiles(username, full_name, avatar_url, location)')
    .eq('user_id', user.id)
    .maybeSingle()

  return { myRank, myEntry: (data as LeaderboardEntryRow | null) ?? null }
}
