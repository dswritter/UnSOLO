/** Active explore filters as removable chips, plus client-side sort for loaded results. */

export type ExploreFilterChip = { id: string; label: string; clears: string[] }

const rupees = (v: string) => `₹${Number(v).toLocaleString('en-IN')}`

function rangeLabel(min: string | undefined, max: string | undefined, fmt: (v: string) => string, unit = '') {
  if (min && max) return `${fmt(min)}–${fmt(max)}${unit}`
  if (max) return `Under ${fmt(max)}${unit}`
  return `${fmt(min!)}+${unit}`
}

export function exploreFilterChips(params: Record<string, string | undefined>): ExploreFilterChip[] {
  const chips: ExploreFilterChip[] = []
  if (params.tripSource) chips.push({ id: 'tripSource', label: params.tripSource === 'unsolo' ? 'UnSOLO trips' : 'Community trips', clears: ['tripSource'] })
  if (params.difficulty) chips.push({ id: 'difficulty', label: params.difficulty[0].toUpperCase() + params.difficulty.slice(1), clears: ['difficulty'] })
  if (params.minBudget || params.maxBudget) chips.push({ id: 'budget', label: rangeLabel(params.minBudget, params.maxBudget, rupees), clears: ['minBudget', 'maxBudget'] })
  if (params.minDays || params.maxDays) chips.push({ id: 'days', label: rangeLabel(params.minDays, params.maxDays, (v) => v, ' days'), clears: ['minDays', 'maxDays'] })
  if (params.minPrice || params.maxPrice) chips.push({ id: 'price', label: rangeLabel(params.minPrice, params.maxPrice, rupees), clears: ['minPrice', 'maxPrice'] })
  if (params.month) {
    const d = new Date(`${params.month}-01T12:00:00`)
    const label = Number.isNaN(d.getTime()) ? params.month : d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    chips.push({ id: 'month', label, clears: ['month'] })
  }
  if (params.activityType) chips.push({ id: 'activityType', label: params.activityType, clears: ['activityType'] })
  if (params.interested) chips.push({ id: 'interested', label: 'Interested', clears: ['interested'] })
  return chips
}

/** `basePath?…` keeping every param except `clears` (and `page`); `search=1` is always kept for the home explore. */
export function exploreHrefWithout(
  params: Record<string, string | undefined>,
  clears: string[],
  basePath: string,
): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== 'page' && !clears.includes(k)) q.set(k, v)
  }
  if (basePath === '/') q.set('search', '1')
  const qs = q.toString()
  return `${basePath}${qs ? `?${qs}` : ''}`
}

export type ExploreSort = 'recommended' | 'soonest' | 'price_asc' | 'price_desc'

export function sortExploreItems<T extends { price_paise: number }>(
  items: T[],
  sort: ExploreSort,
  nextDateKey?: (item: T) => string | null,
): T[] {
  if (sort === 'recommended') return items
  const out = [...items]
  if (sort === 'price_asc') return out.sort((a, b) => a.price_paise - b.price_paise)
  if (sort === 'price_desc') return out.sort((a, b) => b.price_paise - a.price_paise)
  if (!nextDateKey) return items
  // Undated / no open departure go last, original order kept among ties.
  return out.sort((a, b) => (nextDateKey(a) ?? '9999').localeCompare(nextDateKey(b) ?? '9999'))
}
