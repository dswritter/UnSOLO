import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import { STAFF_ROLES } from '@/lib/auth/admin-permissions'
import type { UserRole, AdminPermissionKey } from '@/types'
import { AdminSidebar } from './AdminSidebar'
import { getAdminDashboardStats } from '@/actions/admin'

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getRequestAuth()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, full_name, username')
      .eq('id', user.id)
      .single(),
    supabase
      .from('team_members')
      .select('role, is_active, custom_permissions')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const effectiveRole =
    profile?.role && STAFF_ROLES.includes(profile.role as UserRole)
      ? (profile.role as UserRole)
      : membership?.is_active && membership.role && STAFF_ROLES.includes(membership.role as UserRole)
        ? (membership.role as UserRole)
        : null

  if (!profile || !effectiveRole) {
    redirect('/')
  }

  const customPermissions: AdminPermissionKey[] =
    effectiveRole === 'custom' && Array.isArray(membership?.custom_permissions)
      ? (membership.custom_permissions as AdminPermissionKey[])
      : []

  let pendingCounts = { bookings: 0, requests: 0, serviceListings: 0, communityTrips: 0 }
  try {
    const stats = await getAdminDashboardStats()
    pendingCounts = {
      bookings: stats.pendingBookings,
      requests: stats.pendingDateRequests,
      serviceListings: stats.pendingServiceListings,
      communityTrips: stats.pendingCommunityTrips,
    }
  } catch {
    /* non-fatal */
  }

  return (
    <div className="flex w-full min-h-dvh text-foreground">
      <AdminSidebar
        role={effectiveRole}
        name={profile.full_name || profile.username}
        userId={user.id}
        pendingCounts={pendingCounts}
        customPermissions={customPermissions}
      />

      <main className="flex-1 min-w-0 min-h-dvh overflow-y-auto pt-14 md:pt-0 [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-8 py-6 md:py-8">{children}</div>
      </main>
    </div>
  )
}
