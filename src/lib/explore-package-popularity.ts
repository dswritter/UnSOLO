import type { SupabaseClient } from '@supabase/supabase-js'
import type { Package } from '@/types'

export function packageRecencyMs(pkg: Package): number {
  const u = pkg.updated_at
  const t = u && u.length > 0 ? new Date(u).getTime() : new Date(pkg.created_at).getTime()
  return Number.isFinite(t) ? t : 0
}

export function sortExplorePackages(
  packages: Package[],
  bookedGuests: Map<string, number>,
  interestCount: Map<string, number>,
): Package[] {
  return [...packages].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1
    const popA = (bookedGuests.get(a.id) || 0) + (interestCount.get(a.id) || 0)
    const popB = (bookedGuests.get(b.id) || 0) + (interestCount.get(b.id) || 0)
    if (popB !== popA) return popB - popA
    const rec = packageRecencyMs(b) - packageRecencyMs(a)
    if (rec !== 0) return rec
    return a.slug.localeCompare(b.slug)
  })
}

export async function fetchPackagePopularityMaps(
  supabase: SupabaseClient,
  packageIds: string[],
): Promise<{ bookedGuests: Map<string, number>; interestCount: Map<string, number> }> {
  const bookedGuests = new Map<string, number>()
  const interestCount = new Map<string, number>()
  if (packageIds.length === 0) return { bookedGuests, interestCount }

  const { data: bookings } = await supabase
    .from('bookings')
    .select('package_id, guests')
    .in('package_id', packageIds)
    .in('status', ['confirmed', 'completed'])

  for (const b of bookings || []) {
    const pid = b.package_id as string
    const g = typeof b.guests === 'number' && b.guests > 0 ? b.guests : 1
    bookedGuests.set(pid, (bookedGuests.get(pid) || 0) + g)
  }

  const { data: interests } = await supabase
    .from('package_interests')
    .select('package_id')
    .in('package_id', packageIds)

  for (const row of interests || []) {
    const pid = row.package_id as string
    interestCount.set(pid, (interestCount.get(pid) || 0) + 1)
  }

  return { bookedGuests, interestCount }
}
