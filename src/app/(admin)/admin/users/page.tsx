export const dynamic = 'force-dynamic'

import { getRequestAuth } from '@/lib/auth/request-session'
import { redirect } from 'next/navigation'
import { UsersClient } from './UsersClient'
import { createClient as createSvcClient } from '@supabase/supabase-js'

export default async function AdminUsersPage() {
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/')

  // Use service client to bypass RLS for admin queries
  const svc = createSvcClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: users, error: usersError } = await svc
    .from('profiles')
    .select('id, username, full_name, avatar_url, phone_number, is_host, is_phone_verified, instagram_url, created_at, role')
    .order('created_at', { ascending: false })
    .limit(500)

  // Debug: log if query failed
  if (usersError) console.error('Users query error:', usersError.message)

  // Get booking stats per user
  const { data: bookingStats } = await svc
    .from('bookings')
    .select('user_id, status')

  const userBookings = new Map<string, { confirmed: number; completed: number; cancelled: number }>()
  for (const b of bookingStats || []) {
    const entry = userBookings.get(b.user_id) || { confirmed: 0, completed: 0, cancelled: 0 }
    if (b.status === 'confirmed') entry.confirmed++
    else if (b.status === 'completed') entry.completed++
    else if (b.status === 'cancelled') entry.cancelled++
    userBookings.set(b.user_id, entry)
  }

  const enrichedUsers = (users || []).map(u => ({
    ...u,
    bookings: userBookings.get(u.id) || { confirmed: 0, completed: 0, cancelled: 0 },
    totalTrips: (userBookings.get(u.id)?.confirmed || 0) + (userBookings.get(u.id)?.completed || 0),
  }))

  return <UsersClient users={enrichedUsers} />
}
