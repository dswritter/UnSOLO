/** Cheap client-side filter over already-loaded results while the debounced server search runs. */
export function matchesExploreSearch(values: unknown[], query: string): boolean {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return true
  const haystack = values.map(value => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value))
    .join(' ').toLocaleLowerCase()
  return tokens.every(token => haystack.includes(token))
}

/** Keep page appends idempotent when a retry returns an overlapping boundary. */
export function appendUniqueById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map(item => item.id))
  const appended: T[] = []
  for (const item of incoming) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    appended.push(item)
  }
  return [...existing, ...appended]
}
