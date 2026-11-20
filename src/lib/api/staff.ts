import type { AdminPermissionKey, UserRole } from '@/types'
import { hasAdminPermission } from '@/types'
import { STAFF_ROLES } from '@/lib/auth/admin-permissions'
import { ApiError } from './http'
import { requireUser, type ApiContext } from './context'

/** Same precedence as getEffectiveAdminRole, but works with bearer auth too. */
export async function requireStaffPermission(ctx: ApiContext, key: AdminPermissionKey): Promise<{ userId: string; role: UserRole }> {
  const user = requireUser(ctx)
  const [{ data: profile }, { data: membership }] = await Promise.all([
    ctx.db.from('profiles').select('role').eq('id', user.id).single(),
    ctx.db.from('team_members').select('role, is_active, custom_permissions').eq('user_id', user.id).maybeSingle(),
  ])
  const role = (profile?.role && STAFF_ROLES.includes(profile.role as UserRole) ? profile.role
    : membership?.is_active && STAFF_ROLES.includes(membership.role as UserRole) ? membership.role : null) as UserRole | null
  const custom = role === 'custom' && Array.isArray(membership?.custom_permissions) ? (membership!.custom_permissions as AdminPermissionKey[]) : []
  if (!role || !hasAdminPermission(role, custom, key)) throw new ApiError('forbidden', 'Staff permission required')
  return { userId: user.id, role }
}
