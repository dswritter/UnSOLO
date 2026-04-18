/** Client-side Nominatim helpers for Indian destination pickers (OSM usage policy: identify via User-Agent). */

export type NominatimDestinationHit = {
  id: string
  name: string
  state: string
  /** Sub-state context when the same name appears twice (e.g. Banjar · Kullu) */
  detail?: string
}

const USER_AGENT = 'UnSOLO/1.0 (https://unsolo.in)'

type NominatimRow = {
  place_id: number
  name?: string
  display_name: string
  type?: string
  class?: string
  importance?: number
  address?: {
    state?: string
    city?: string
    town?: string
    village?: string
    hamlet?: string
    county?: string
    suburb?: string
    locality?: string
    municipality?: string
    isolated_dwelling?: string
    state_district?: string
    neighbourhood?: string
    quarter?: string
    city_district?: string
    residential?: string
    allotments?: string
    farm?: string
    region?: string
  }
}

function mapRow(r: NominatimRow): NominatimDestinationHit | null {
  if (['country', 'continent'].includes(r.type || '')) return null
  if (r.class === 'highway' || r.class === 'waterway') return null

  const addr = r.address || {}
  const displayFirst =
    r.display_name && String(r.display_name).trim()
      ? String(r.display_name).split(',')[0].trim()
      : ''

  const name =
    (r.name && String(r.name).trim()) ||
    addr.hamlet ||
    addr.isolated_dwelling ||
    addr.village ||
    addr.town ||
    addr.city ||
    addr.municipality ||
    addr.county ||
    addr.suburb ||
    addr.locality ||
    addr.neighbourhood ||
    addr.quarter ||
    addr.city_district ||
    addr.residential ||
    addr.allotments ||
    addr.farm ||
    addr.state_district ||
    displayFirst

  if (!name) return null

  const state = (addr.state || 'India').trim()
  const detailParts = [addr.county, addr.state_district, addr.region].filter(Boolean) as string[]
  const detail = detailParts.length ? detailParts.join(' · ') : undefined

  return {
    id: `new_${r.place_id}`,
    name: String(name).trim(),
    state,
    detail,
  }
}

/**
 * Search places in India. Requires ≥3 non-space chars (caller should debounce so users can finish short names like "Shoja").
 */
export async function fetchNominatimIndiaDestinations(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<NominatimDestinationHit[]> {
  const q = rawQuery
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (q.length < 3) return []

  const url =
    `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(`${q} India`)}` +
    `&format=json&limit=22&countrycodes=in&addressdetails=1`

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal,
  })
  if (!res.ok) return []

  const data: unknown = await res.json()
  if (!Array.isArray(data)) return []

  const rows = data as NominatimRow[]
  const queryBlob = q.toLowerCase()
  const queryTokens = queryBlob.split(/\s+/).filter(Boolean)

  const rank = (r: NominatimRow) => {
    if (r.class === 'place') return 0
    if (r.type === 'administrative') return 2
    return 1
  }
  const sorted = [...rows].sort((a, b) => {
    const d = rank(a) - rank(b)
    if (d !== 0) return d
    return (b.importance ?? 0) - (a.importance ?? 0)
  })

  const out: NominatimDestinationHit[] = []
  for (const row of sorted) {
    const m = mapRow(row)
    if (m) out.push(m)
  }

  function relevance(m: NominatimDestinationHit): number {
    const blob = `${m.name} ${m.detail || ''} ${m.state}`.toLowerCase().replace(/\s+/g, ' ')
    let s = 0
    if (blob.includes(queryBlob)) s += 30
    for (const t of queryTokens) {
      if (t.length >= 2 && blob.includes(t)) s += 6
    }
    return s
  }
  out.sort((a, b) => relevance(b) - relevance(a) || a.name.localeCompare(b.name))

  return out
}

export function nominatimDebounceMs(trimmedQueryLength: number): number {
  // Short queries often hit Nominatim "dead zones" (e.g. "Shoj" → [], "Shoja" → hits). Wait longer so the user can finish the word.
  return trimmedQueryLength < 5 ? 700 : 380
}
