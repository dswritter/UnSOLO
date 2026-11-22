import type { SupabaseClient } from '@supabase/supabase-js'
import type { Place } from './models'

type Row = Record<string, unknown>
export type PlaceHit = Place & { detail: string | null }

const clean = (q: string) => q.replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Our destinations: "Manali" · "Himachal Pradesh". */
export function destinationHit(r: Row): PlaceHit {
  return { name: String(r.name), slug: r.slug ? String(r.slug) : null, lat: null, lng: null, detail: r.state ? String(r.state) : null }
}

type OsmRow = { name?: string; display_name?: string; lat?: string; lon?: string; class?: string; type?: string; importance?: number; address?: Record<string, string> }

/** An OpenStreetMap search row → place, or null for roads, rivers, countries. */
export function osmHit(r: OsmRow): PlaceHit | null {
  if (r.class === 'highway' || r.class === 'waterway' || r.type === 'country') return null
  const a = r.address ?? {}
  const name = (r.name || a.village || a.town || a.city || a.hamlet || a.county || r.display_name?.split(',')[0] || '').trim()
  if (!name) return null
  const detail = [a.state_district && a.state_district !== name ? a.state_district : null, a.state].filter(Boolean).join(', ') || null
  const lat = Number(r.lat), lng = Number(r.lon)
  return { name, slug: null, lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null, detail }
}

/** Merges lists in order, one entry per place name (first wins), up to [limit]. */
export function mergeHits(lists: PlaceHit[][], limit: number): PlaceHit[] {
  const seen = new Set<string>(), out: PlaceHit[] = []
  for (const list of lists) for (const h of list) {
    const k = key(h.name)
    if (!k || seen.has(k)) continue
    seen.add(k); out.push(h)
    if (out.length >= limit) return out
  }
  return out
}

/** OpenStreetMap place search in India, cached a day per query (keeps us well inside its usage policy). */
async function searchOsm(q: string): Promise<PlaceHit[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&countrycodes=in&addressdetails=1`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'UnSOLO/1.0 (https://unsolo.in)', 'Accept-Language': 'en' },
      next: { revalidate: 86_400 }, signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) return []
    const rows = (await res.json()) as OsmRow[]
    if (!Array.isArray(rows)) return []
    return rows.sort((x, y) => Number(y.class === 'place') - Number(x.class === 'place') || (y.importance ?? 0) - (x.importance ?? 0))
      .map(osmHit).filter((h): h is PlaceHit => !!h)
  } catch { return [] }
}

/**
 * Place suggestions as someone types: our destinations first, then places people already post
 * about, then OpenStreetMap for anything else. An empty query returns popular places.
 */
export async function suggestPlaces(db: SupabaseClient, rawQ: string, limit = 8): Promise<PlaceHit[]> {
  const q = clean(rawQ)
  const destQ = db.from('destinations').select('name, state, slug').order('name').limit(q ? 12 : 30)
  const postQ = db.from('posts').select('place_name, place_slug').eq('status', 'live').not('place_name', 'is', null)
    .order('created_at', { ascending: false }).limit(q ? 20 : 60)
  const [dest, posts] = await Promise.all([
    q ? destQ.ilike('name', `%${q}%`) : destQ,
    q ? postQ.ilike('place_name', `%${q}%`) : postQ,
  ])
  const starts = (h: PlaceHit) => (q && h.name.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1)
  const destHits = ((dest.data ?? []) as Row[]).map(destinationHit).sort((a, b) => starts(a) - starts(b))
  const postHits = ((posts.data ?? []) as Row[]).map((r): PlaceHit => ({ name: String(r.place_name), slug: r.place_slug ? String(r.place_slug) : null, lat: null, lng: null, detail: null }))
  const local = mergeHits([destHits, postHits], limit)
  if (q.length < 3 || local.length >= limit) return local
  return mergeHits([local, await searchOsm(q)], limit)
}
