/** Pure helpers for the profile "Connections" section (kept DB-free for tests). */

export type MiniProfile = { id: string; username: string; full_name: string | null; avatar_url: string | null }

export type ReceivedReview = {
  id: string
  rating: number
  body: string | null
  createdAt: string
  reviewerId: string
  subject: string | null
  href: string | null
}

/** Ids present in both lists, excluding the given ids, in `a`'s order. */
export function intersectIds(a: Iterable<string>, b: Iterable<string>, exclude: Iterable<string> = []): string[] {
  const right = new Set(b)
  const skip = new Set(exclude)
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of a) {
    if (!id || seen.has(id) || skip.has(id) || !right.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Distinct ids in first-seen order, excluding the given ids. */
export function distinctIds(ids: Iterable<string | null | undefined>, exclude: Iterable<string> = []): string[] {
  const skip = new Set(exclude)
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (!id || seen.has(id) || skip.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Order profiles by an id list (dropping ids with no profile row). */
export function orderProfiles<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map(r => [r.id, r]))
  return ids.map(id => byId.get(id)).filter((r): r is T => Boolean(r))
}

/** Newest first, then average rating over all rows (one decimal). */
export function summarizeReviews(rows: ReceivedReview[], limit = 6) {
  const sorted = [...rows].sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''))
  const rated = rows.filter(r => r.rating >= 1 && r.rating <= 5)
  const average = rated.length ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10 : null
  return { items: sorted.slice(0, limit), total: rows.length, average }
}
