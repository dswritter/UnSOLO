/**
 * "New" badge for service listings (stays, rentals, activities): the N most recently published
 * listings of each type are "new". When a newer listing is published, the oldest of those drops out,
 * so the badge always marks the latest arrivals instead of every listing without reviews.
 */
export const NEW_LISTINGS_PER_TYPE = 6

type Row = { id: string; type: string; first_approved_at?: string | null; created_at: string }

/** Publish time = first admin approval, falling back to creation for older rows. */
const publishedAt = (r: Row) => r.first_approved_at || r.created_at

export function newestIdsByType(rows: Row[], perType = NEW_LISTINGS_PER_TYPE): Set<string> {
  const byType = new Map<string, Row[]>()
  for (const r of rows) {
    const list = byType.get(r.type) ?? []
    list.push(r)
    byType.set(r.type, list)
  }
  const out = new Set<string>()
  for (const list of byType.values()) {
    list.sort((a, b) => publishedAt(b).localeCompare(publishedAt(a)) || a.id.localeCompare(b.id))
    for (const r of list.slice(0, perType)) out.add(r.id)
  }
  return out
}

export function markNewListings<T extends { id: string }>(listings: T[], newest: Set<string>): (T & { is_new: boolean })[] {
  return listings.map((l) => ({ ...l, is_new: newest.has(l.id) }))
}
