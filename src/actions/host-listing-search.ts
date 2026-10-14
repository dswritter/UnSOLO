'use server'

import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { STAFF_ROLES } from '@/lib/auth/admin-permissions'
import { hasAdminPermission, type AdminPermissionKey, type UserRole } from '@/types'
import {
  dedupeHostListingContacts, parseHostListingContacts, hostSearchQuery,
  HOST_SEARCH_RESULT_LIMIT, type HostListingContactOption,
} from '@/lib/host-listing-search'

/** Contacts are suggestions, never ownership credentials. Kind gates permission, not the directory. */
export async function searchHostListingContacts(kind: 'service' | 'trip', query: string): Promise<HostListingContactOption[]> {
  if (kind !== 'service' && kind !== 'trip') throw new Error('Invalid listing kind')
  const term = hostSearchQuery(query)
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')

  const [profileResult, membershipResult] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('team_members').select('role, is_active, custom_permissions').eq('user_id', user.id).maybeSingle(),
  ])
  if (profileResult.error || membershipResult.error) throw new Error('Unable to authorize host search')
  const profile = profileResult.data
  const membership = membershipResult.data
  const role = profile?.role && STAFF_ROLES.includes(profile.role as UserRole)
    ? profile.role as UserRole
    : membership?.is_active && STAFF_ROLES.includes(membership.role as UserRole)
      ? membership.role as UserRole : null
  const permissions: AdminPermissionKey[] = role === 'custom' && membership?.is_active && Array.isArray(membership.custom_permissions)
    ? membership.custom_permissions : []
  if (!role || !hasAdminPermission(role, permissions, kind === 'service' ? 'service_listings' : 'community_trips')) {
    throw new Error('Unauthorized')
  }

  // The privileged client and private RPC are reachable only after both checks.
  const svc = createServiceRoleClient()
  const { data, error } = await svc.rpc('search_staff_host_contacts', {
    p_query: term, p_limit: HOST_SEARCH_RESULT_LIMIT,
  })
  if (error) throw new Error('Unable to search host contacts')
  return dedupeHostListingContacts(parseHostListingContacts(data))
}