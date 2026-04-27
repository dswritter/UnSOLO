import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import type { UserRole } from '@/types'
import { AdminSidebar } from './AdminSidebar'
import { getAdminDashboardStats } from '@/actions/admin'

const STAFF_ROLES: UserRole[] = ['admin', 'social_media_manager', 'field_person', 'chat_responder']

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getRequestAuth()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, username')
    .eq('id', user.id)
    .single()

  if (!profile || !STAFF_ROLES.includes(profile.role as UserRole)) {
    redirect('/')
  }

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
        role={profile.role as UserRole}
        name={profile.full_name || profile.username}
        userId={user.id}
        pendingCounts={pendingCounts}
      />

      <main className="flex-1 min-w-0 min-h-dvh overflow-y-auto pt-14 md:pt-0 [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-8 py-6 md:py-8">{children}</div>
      </main>
    </div>
  )
}
