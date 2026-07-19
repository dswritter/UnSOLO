import { redirect } from 'next/navigation'
import { getAdminPendingTripClaims } from '@/actions/trip-claims'
import { getRequestAuth } from '@/lib/auth/request-session'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { hasAdminPermission, ROLE_DEFAULT_PERMISSIONS } from '@/types'
import type { UserRole, AdminPermissionKey } from '@/types'
import { STAFF_ROLES } from '@/lib/auth/admin-permissions'
import { PendingClaimsList } from '@/components/trip-claims/PendingClaimsList'

export default async function TripClaimsPage() {
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

  if (!effRole || !hasAdminPermission(effRole, customPerms, 'trip_claims')) {
    redirect('/')
  }

  const claims = await getAdminPendingTripClaims()

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">
        Trip <span className="text-primary">Claims</span>
      </h1>
      <p className="text-muted-foreground text-sm mb-6">
        Companions who weren&apos;t the account holder asking to be recognized as travellers — approve to grant trip-chat
        access + full booking visibility (the booker or the trip&apos;s host can also approve these; whoever acts first wins).
      </p>
      {claims.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending trip-claim requests.</p>
      ) : (
        <PendingClaimsList claims={claims} context="admin" />
      )}
    </div>
  )
}
