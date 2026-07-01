// Shared leaderboard row types. The board itself is now computed (and cached)
// in `leaderboardBoard.ts`; per-viewer standing comes from the
// `getMyLeaderboardStanding` server action.
export type LeaderboardEntryRow = {
  user_id: string
  trips_completed: number
  reviews_written: number
  destinations_count: number
  total_score: number
  profile: {
    username: string
    full_name: string | null
    avatar_url: string | null
    location: string | null
  } | null
}

export type MonthlyLeaderboardEntry = LeaderboardEntryRow & { monthly_trips: number }
