export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UsersClient } from './UsersClient'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/')

  const { data: users } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, email, phone_number, is_host, is_phone_verified, is_email_verified, instagram_url, created_at, role')
    .order('created_at', { ascending: false })
    .limit(500)

  // Get booking stats per user
  const { data: bookingStats } = await supabase
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
