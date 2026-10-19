import { createPublicClient } from '@/lib/supabase/public-client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getUnlinkedHost } from '@/lib/listings/unlinked-host'
import { escapeIlikePattern } from '@/lib/utils'
import type { Profile } from '@/types'
import { unlinkedHostProfileHref, type HostListingKind } from './host-profile'

export async function findPublicProfile(username: string): Promise<{ profile: Profile | null; ambiguous: boolean }> {
  const supabase = createPublicClient()
  const exact = await supabase.from('profiles').select('*').eq('username', username).maybeSingle()
  if (exact.error) throw exact.error
  if (exact.data) return { profile: exact.data as Profile, ambiguous: false }

  const pattern = escapeIlikePattern(username)
  const byUsername = await supabase.from('profiles').select('*').ilike('username', pattern).limit(2)
  if (byUsername.error) throw byUsername.error
  if (byUsername.data?.length) {
    return {
      profile: byUsername.data.length === 1 ? byUsername.data[0] as Profile : null,
      ambiguous: byUsername.data.length > 1,
    }
  }

  // Older shared host URLs sometimes contain the display name, not the account username.
  const byName = await supabase.from('profiles').select('*').eq('is_host', true).ilike('full_name', pattern).limit(2)
  if (byName.error) throw byName.error
  return {
    profile: byName.data?.length === 1 ? byName.data[0] as Profile : null,
    ambiguous: (byName.data?.length ?? 0) > 1,
  }
}

export async function loadPublicListingHost(kind: HostListingKind, listingId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listingId)) return null

  const supabase = createPublicClient()
  let query = supabase.from(kind === 'trip' ? 'packages' : 'service_listings')
    .select('id, title, slug, host_id, created_on_behalf_by')
    .eq('id', listingId).eq('is_active', true)
  if (kind === 'service') {
    query = query.or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
  }
  const { data: listing, error } = await query.maybeSingle()
  if (error) throw error
  if (!listing) return null

  if (listing.host_id) {
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('username').eq('id', listing.host_id).maybeSingle()
    if (profileError) throw profileError
    return profile ? { linked: true as const, username: profile.username as string } : null
  }
  if (!listing.created_on_behalf_by) return null

  const host = await getUnlinkedHost(kind, listingId)
  let href = `/packages/${encodeURIComponent(listing.slug)}`
  if (kind === 'service') {
    const { data: service, error: serviceError } = await supabase.from('service_listings')
      .select('type').eq('id', listingId).single()
    if (serviceError) throw serviceError
    href = `/listings/${service.type}/${encodeURIComponent(listing.slug)}`
  }
  return { linked: false as const, name: host.full_name || 'Your host', listing: { title: listing.title as string, href } }
}

export async function findUnlinkedHostProfileHref(name: string): Promise<string | null> {
  const { data, error } = await createServiceRoleClient().from('host_listing_assignments')
    .select('package_id, service_listing_id')
    .ilike('host_name', escapeIlikePattern(name)).neq('status', 'claimed').limit(2)
  if (error) throw error
  // Names are not identities. Never choose between multiple matching assignments.
  if (data?.length !== 1) return null
  const row = data[0]
  const kind = row.package_id ? 'trip' : 'service'
  const id = row.package_id || row.service_listing_id
  if (!id) return null
  const host = await loadPublicListingHost(kind, id)
  return host && !host.linked ? unlinkedHostProfileHref(kind, id) : null
}
