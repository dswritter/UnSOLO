export type LandingTab = 'explore' | 'tribe' | 'trips'

/**
 * Suggest a landing tab when one tab clearly dominates recent opens (≥3 opens, more than every
 * other tab, not already the landing tab) and the user hasn't dismissed the prompt in 30 days.
 * Shared rule — Android and iOS implement the same logic locally for offline first launch.
 */
export function suggestLandingTab(
  visits: Record<LandingTab, number>,
  current: LandingTab,
  dismissedAt: string | null,
  now = Date.now(),
): LandingTab | null {
  if (dismissedAt && now - new Date(dismissedAt).getTime() < 30 * 86400_000) return null
  const ranked = (Object.entries(visits) as [LandingTab, number][]).sort((a, b) => b[1] - a[1])
  const [top, second] = ranked
  if (!top || top[1] < 3 || top[0] === current) return null
  if (second && top[1] <= second[1]) return null
  return top[0]
}
