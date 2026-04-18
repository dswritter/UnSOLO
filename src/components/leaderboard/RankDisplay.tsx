import { Trophy } from 'lucide-react'

const MEDAL_1 = '\u{1F947}'
const MEDAL_2 = '\u{1F948}'
const MEDAL_3 = '\u{1F949}'

/** Medal strings — matches `LeaderboardList` for ranks 1–3. */
export function leaderboardMedalEmoji(rank: number): string | null {
  if (rank === 1) return MEDAL_1
  if (rank === 2) return MEDAL_2
  if (rank === 3) return MEDAL_3
  return null
}

/** Rank cell: medal or `#n` (leaderboard row). */
export function LeaderboardRankBadge({ rank }: { rank: number }) {
  const medal = leaderboardMedalEmoji(rank)
  if (medal) {
    return <span className="text-2xl leading-none">{medal}</span>
  }
  return <span className="text-sm font-bold text-muted-foreground">#{rank}</span>
}

/** Leading icon for compact “Leaderboard rank” rows (profile). */
export function LeaderboardRankRowIcon({ rank }: { rank: number }) {
  const medal = leaderboardMedalEmoji(rank)
  if (medal) {
    return <span className="text-xl leading-none shrink-0" aria-hidden>{medal}</span>
  }
  return <Trophy className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
}

/** Trailing link content: medal only for top 3, else `#rank`. */
export function LeaderboardRankLinkLabel({ rank }: { rank: number }) {
  const medal = leaderboardMedalEmoji(rank)
  if (medal) {
    return <span className="text-2xl leading-none tabular-nums">{medal}</span>
  }
  return <span className="tabular-nums">#{rank}</span>
}
