import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { HostProfile } from '@/types'

/** Public stand-in host for a staff-created listing whose host account isn't linked yet (name only). */
export type UnlinkedHost = HostProfile & { unlinked: true }

export const getCachedUnlinkedHostName = unstable_cache(
  async (kind: 'trip' | 'service', listingId: string): Promise<string | null> => {
    const { data } = await createServiceRoleClient()
      .from('host_listing_assignments')
      .select('host_name')
      .eq(kind === 'trip' ? 'package_id' : 'service_listing_id', listingId)
      .maybeSingle()
    return (data as { host_name?: string | null } | null)?.host_name?.trim() || null
  },
  ['unlinked-host-name-v1'],
  { revalidate: 300, tags: ['host-listing-assignments'] },
)

export async function getUnlinkedHost(kind: 'trip' | 'service', listingId: string): Promise<UnlinkedHost> {
  const name = await getCachedUnlinkedHostName(kind, listingId)
  return {
    id: `unlinked:${listingId}`,
    username: '',
    full_name: name || 'Your host',
    avatar_url: null,
    bio: null,
    host_rating: null,
    is_verified: false,
    total_hosted_trips: null,
    unlinked: true,
  }
}
