/**
 * LOCAL preview only (never production): a Package-shaped trip built from the Explore demo
 * departures, so /packages/<demo-slug> renders when no database is reachable.
 */
import type { HostProfile, Package } from '@/types'
import { DEMO_TRIPS } from '@/lib/tribe/demo-trips'
import { demoEnabled, isUnreachable } from '@/lib/tribe/demo'

export function demoPackage(slug: string, dbError: unknown): (Package & { host: unknown }) | null {
  if (!demoEnabled() || !isUnreachable(dbError)) return null
  const t = DEMO_TRIPS.find((x) => x.slug === slug)
  if (!t) return null
  const [name, state] = (t.place?.name ?? 'Himachal').split(/,\s*/)
  const host: HostProfile | null = t.host
    ? { id: t.host.id, username: t.host.username, full_name: t.host.name, avatar_url: t.host.avatarUrl, bio: 'Small groups since 2019. Local guides, no rush.', host_rating: 4.9, is_verified: true, total_hosted_trips: 42 }
    : null
  const others = DEMO_TRIPS.filter((x) => x.slug !== slug).slice(0, 3).map((x) => x.image!.url)
  return {
    id: t.id, slug: t.slug, title: t.title, destination_id: 'demo', short_description: null,
    description: `A ${t.durationDays}-day small-group trip with a local host. Meet the circle on day one, share rooms, share stories.\n\n**Day 1** · Meet at the bus, overnight journey.\n**Day 2** · Settle in, short acclimatisation walk.\n**Day 3** · The big day out, back by sunset.`,
    price_paise: t.priceFromPaise, duration_days: t.durationDays, max_group_size: t.seatsTotal ?? 12, difficulty: 'moderate',
    includes: ['Stays on twin sharing', 'Breakfast and dinner', 'Local transport from the meeting point', 'Trip host and local guide'],
    images: [t.image!.url, ...others], departure_dates: t.nextDeparture ? [t.nextDeparture] : [], is_active: true,
    host_id: host?.id ?? null, destination: { id: 'demo', name, state: state ?? 'India', slug: 'demo' }, host,
  } as unknown as Package & { host: unknown }
}
