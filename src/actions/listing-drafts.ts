'use server'

import { createServiceRoleClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import { hasAdminPermission, type AdminPermissionKey, type UserRole } from '@/types'

const STAFF_ROLES: UserRole[] = ['admin', 'social_media_manager', 'field_person', 'chat_responder', 'host_onboarding_staff', 'custom']

/**
 * Persist an in-progress host listing draft to the cloud (called by the create
 * form on stage transitions / when leaving the page). Upserts one row per
 * (host, kind, local draft id). Uses the service-role client but always pins
 * host_id to the authenticated user.
 */
export async function saveListingDraft(input: {
  kind: 'trip' | 'service'
  localId: string
  title?: string | null
  destinationLabel?: string | null
  step?: number
  payload: unknown
}): Promise<{ success: true; savedAt: string } | { error: string }> {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  if (!input.localId) return { error: 'Missing draft id' }

  const svc = createServiceRoleClient()
  const savedAt = new Date().toISOString()
  const { error } = await svc.from('listing_drafts').upsert(
    {
      host_id: user.id,
      kind: input.kind,
      local_id: input.localId,
      title: (input.title || '').slice(0, 200) || null,
      destination_label: (input.destinationLabel || '').slice(0, 200) || null,
      step: Number.isFinite(input.step as number) ? (input.step as number) : 0,
      payload: input.payload ?? {},
      updated_at: savedAt,
    },
    { onConflict: 'host_id,kind,local_id' },
  )
  if (error) return { error: error.message }
  return { success: true, savedAt }
}

/** Mark a draft submitted (so it drops off the "needs help" list) — best-effort. */
export async function markListingDraftSubmitted(kind: 'trip' | 'service', localId: string) {
  const { user } = await getActionAuth()
  if (!user || !localId) return { success: false }
  const svc = createServiceRoleClient()
  await svc
    .from('listing_drafts')
    .update({ submitted: true, updated_at: new Date().toISOString() })
    .eq('host_id', user.id)
    .eq('kind', kind)
    .eq('local_id', localId)
  return { success: true }
}

export type StaffListingDraft = {
  id: string
  host_id: string
  kind: 'trip' | 'service'
  title: string | null
  destination_label: string | null
  step: number
  updated_at: string
  host: { full_name: string | null; username: string | null } | null
}

/** Staff view of in-progress drafts (host onboarding help). Permission-gated. */
export async function getStaffListingDrafts(): Promise<{ drafts: StaffListingDraft[] } | { error: string }> {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()
  const [{ data: profile }, { data: membership }] = await Promise.all([
    svc.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    svc.from('team_members').select('role, is_active, custom_permissions').eq('user_id', user.id).maybeSingle(),
  ])
  const role: UserRole | null =
    profile?.role && STAFF_ROLES.includes(profile.role as UserRole)
      ? (profile.role as UserRole)
      : membership?.is_active && membership.role && STAFF_ROLES.includes(membership.role as UserRole)
        ? (membership.role as UserRole)
        : null
  if (!role) return { error: 'Unauthorized' }
  const perms: AdminPermissionKey[] =
    role === 'custom' && membership?.is_active && Array.isArray(membership.custom_permissions)
      ? (membership.custom_permissions as AdminPermissionKey[])
      : []
  if (!hasAdminPermission(role, perms, 'community_trips') && !hasAdminPermission(role, perms, 'service_listings')) {
    return { error: 'Unauthorized' }
  }

  const { data } = await svc
    .from('listing_drafts')
    .select('id, host_id, kind, title, destination_label, step, updated_at, host:profiles!listing_drafts_host_id_fkey(full_name, username)')
    .eq('submitted', false)
    .order('updated_at', { ascending: false })
    .limit(300)

  return { drafts: (data || []) as unknown as StaffListingDraft[] }
}
