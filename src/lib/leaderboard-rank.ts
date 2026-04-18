import type { SupabaseClient } from '@supabase/supabase-js'

/** Global rank: 1 + number of users with a strictly higher total_score (ties share the same rank). */
export async function getLeaderboardRankByScore(
  supabase: SupabaseClient,
  totalScore: number
): Promise<number> {
  const { count } = await supabase
    .from('leaderboard_scores')
    .select('*', { count: 'exact', head: true })
    .gt('total_score', totalScore)

  return (count ?? 0) + 1
}

export async function getLeaderboardRank(
  supabase: SupabaseClient,
  userId: string
): Promise<number | null> {
  const { data } = await supabase
    .from('leaderboard_scores')
    .select('total_score')
    .eq('user_id', userId)
    .maybeSingle()

  if (data == null || typeof data.total_score !== 'number') return null
  return getLeaderboardRankByScore(supabase, data.total_score)
}
