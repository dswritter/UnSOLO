import { redirect } from 'next/navigation'
import { hasAdminPermission, type AdminPermissionKey, type UserRole } from '@/types'
import { getEffectiveAdminRole } from './admin-permissions'
import { getRequestAuth } from './request-session'

/** Server-component gate for admin pages: signed in + staff permission, else redirect. */
export async function requireAdminPagePermission(key: AdminPermissionKey): Promise<{ userId: string; role: UserRole }> {
  const { user } = await getRequestAuth()
  if (!user) redirect('/login?redirectTo=%2Fadmin')
  const eff = await getEffectiveAdminRole()
  if (!eff || !hasAdminPermission(eff.role, eff.customPermissions, key)) redirect('/admin')
  return { userId: user.id, role: eff.role }
}
