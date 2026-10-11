'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getActionAuth } from '@/lib/auth/action-auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { STAFF_ROLES } from '@/lib/auth/admin-permissions'
import { SERVICE_LISTINGS_TAG } from '@/lib/cache-tags'
import { normalizeHostListingContact, type HostListingContactInput } from '@/lib/host-listing-contact'
import { hasAdminPermission, type UserRole, type AdminPermissionKey } from '@/types'

/** Contact corrections never permit replacing an already claimed host. */
export async function updateHostListingContact(kind: 'service' | 'trip', listingId: string, input: HostListingContactInput) {
  if (kind !== 'service' && kind !== 'trip') throw new Error('Invalid listing kind')
  const { user } = await getActionAuth()
  if (!user) throw new Error('Not authenticated')
  const svc = createServiceRoleClient()
  const [{ data: profile }, { data: membership }] = await Promise.all([
    svc.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    svc.from('team_members').select('role, is_active, custom_permissions').eq('user_id', user.id).maybeSingle(),
  ])
  const role = profile?.role && STAFF_ROLES.includes(profile.role as UserRole)
    ? profile.role as UserRole
    : membership?.is_active && STAFF_ROLES.includes(membership.role as UserRole)
      ? membership.role as UserRole : null
  const perms: AdminPermissionKey[] = role === 'custom' && membership?.is_active
    ? membership.custom_permissions ?? [] : []
  if (!role || !hasAdminPermission(role, perms, kind === 'service' ? 'service_listings' : 'community_trips')) {
    throw new Error('Unauthorized')
  }
  const contact = normalizeHostListingContact(input)
  const { error } = await svc.rpc('update_host_listing_contact', {
    p_kind: kind, p_listing_id: listingId, p_contact: contact, p_staff_id: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/service-listings')
  revalidatePath(`/admin/service-listings/${listingId}`)
  revalidatePath('/admin/community-trips')
  revalidatePath('/host')
  revalidateTag(SERVICE_LISTINGS_TAG, 'max')
  return { success: true }
}