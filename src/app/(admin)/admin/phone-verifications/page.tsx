import { redirect } from 'next/navigation'
import { getPendingPhoneVerifications } from '@/actions/verification'
import { getRequestAuth } from '@/lib/auth/request-session'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { hasAdminPermission, ROLE_DEFAULT_PERMISSIONS } from '@/types'
import type { UserRole, AdminPermissionKey } from '@/types'
import { STAFF_ROLES } from '@/lib/auth/admin-permissions'
import PhoneVerificationsClient from './PhoneVerificationsClient'

export default async function PhoneVerificationsPage() {
  const { user } = await getRequestAuth()
  if (!user) redirect('/login')

  const svc = createServiceRoleClient()
  const [{ data: profile }, { data: membership }] = await Promise.all([
    svc.from('profiles').select('role').eq('id', user.id).single(),
    svc.from('team_members').select('role, is_active, custom_permissions').eq('user_id', user.id).maybeSingle(),
  ])

  const effRole: UserRole | null =
    profile?.role && STAFF_ROLES.includes(profile.role as UserRole)
      ? (profile.role as UserRole)
      : membership?.is_active && membership.role && STAFF_ROLES.includes(membership.role as UserRole)
        ? (membership.role as UserRole)
        : null

  const customPerms: AdminPermissionKey[] =
    effRole === 'custom' && Array.isArray(membership?.custom_permissions)
      ? (membership.custom_permissions as AdminPermissionKey[])
      : effRole
        ? (ROLE_DEFAULT_PERMISSIONS[effRole] ?? []) as AdminPermissionKey[]
        : []

  if (!effRole || !hasAdminPermission(effRole, customPerms, 'phone_verifications')) {
    redirect('/')
  }

  const result = await getPendingPhoneVerifications()
  if ('error' in result) redirect('/admin')

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">
        Phone <span className="text-primary">Verifications</span>
      </h1>
      <p className="text-muted-foreground text-sm mb-6">
        Manually verify foreign host phone numbers and approve phone change requests
      </p>
      <PhoneVerificationsClient
        foreignPending={result.foreignPending}
        changeRequests={result.changeRequests}
      />
    </div>
  )
}
