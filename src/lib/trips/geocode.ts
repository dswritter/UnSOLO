import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>
const UA = 'UnSOLO/1.0 (https://unsolo.in)'

/** One place in India → coordinates (OpenStreetMap Nominatim; keep to ~1 request a second). */
export async function geocodeIndia(q: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(6000) })
    const j = (await r.json()) as { lat?: string; lon?: string }[]
    const hit = j?.[0]
    return hit?.lat && hit?.lon ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null
  } catch { return null }
}

/** Fills in coordinates for up to [max] destinations that don't have them yet (tried once a week). */
export async function geocodeMissingDestinations(svc: SupabaseClient, max = 5): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data } = await svc.from('destinations').select('id, name, state').is('lat', null)
    .or(`geocoded_at.is.null,geocoded_at.lt.${weekAgo}`).limit(max)
  let n = 0
  for (const d of (data ?? []) as Row[]) {
    const hit = await geocodeIndia([d.name, d.state].filter(Boolean).join(', '))
    await svc.from('destinations').update({ lat: hit?.lat ?? null, lng: hit?.lng ?? null, geocoded_at: new Date().toISOString() }).eq('id', d.id)
    if (hit) n++
    await new Promise((r) => setTimeout(r, 1100))
  }
  return n
}
