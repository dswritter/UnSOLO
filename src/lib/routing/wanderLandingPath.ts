/**
 * Trip discovery lives on the marketing home (`/`). Search mode uses `?search=1` plus tab/filters.
 */
export const WANDER_HOME_SEARCH_HREF = '/?search=1'

/** Build `/?search=1&…` for the homepage explore block; optional `#wander-explore` for scroll targets. */
export function wanderSearchHref(
  extra?: Record<string, string | undefined>,
  options?: { withHash?: boolean },
): string {
  const withHash = options?.withHash !== false
  const q = new URLSearchParams()
  q.set('search', '1')
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && v !== '') q.set(k, v)
    }
  }
  const qs = q.toString()
  return withHash ? `/?${qs}#wander-explore` : `/?${qs}`
}
