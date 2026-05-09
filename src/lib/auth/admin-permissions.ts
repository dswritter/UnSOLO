import { getRequestAuth } from './request-session'
import type { UserRole, AdminPermissionKey } from '@/types'

export const STAFF_ROLES: UserRole[] = [
  'admin',
  'social_media_manager',
  'field_person',
  'chat_responder',
  'host_onboarding_staff',
  'custom',
]

/**
 * Returns the effective staff role + custom permissions for the current user.
 * Returns null if the user is not a staff member.
 */
export async function getEffectiveAdminRole(): Promise<{
  role: UserRole
  customPermissions: AdminPermissionKey[]
} | null> {
  try {
    const { supabase, user } = await getRequestAuth()
    if (!user) return null

    const [{ data: profile }, { data: membership }] = await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single(),
      supabase
        .from('team_members')
        .select('role, is_active, custom_permissions')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    const role =
      profile?.role && STAFF_ROLES.includes(profile.role as UserRole)
        ? (profile.role as UserRole)
        : membership?.is_active &&
            membership.role &&
            STAFF_ROLES.includes(membership.role as UserRole)
          ? (membership.role as UserRole)
          : null

    if (!role) return null

    const customPermissions: AdminPermissionKey[] =
      role === 'custom' && Array.isArray(membership?.custom_permissions)
        ? (membership.custom_permissions as AdminPermissionKey[])
        : []

    return { role, customPermissions }
  } catch {
    return null
  }
}
