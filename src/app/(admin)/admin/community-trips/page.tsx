import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CommunityTripsClient from './CommunityTripsClient'

export default async function AdminCommunityTripsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/')

  // Fetch all community trips (host_id not null)
  const { data: trips } = await supabase
    .from('packages')
    .select('*, destination:destinations(name, state), host:profiles!packages_host_id_fkey(id, username, full_name, avatar_url, is_phone_verified, is_email_verified, host_rating)')
    .not('host_id', 'is', null)
    .order('created_at', { ascending: false })

  // Get pending payouts
  const { data: pendingPayouts } = await supabase
    .from('host_earnings')
    .select('*, host:profiles(username, full_name), booking:bookings(travel_date, package:packages(title))')
    .eq('payout_status', 'pending')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">Community <span className="text-primary">Trips</span></h1>
      <p className="text-muted-foreground text-sm mb-6">Moderate user-hosted trips and manage host payouts</p>
      <CommunityTripsClient trips={trips || []} pendingPayouts={pendingPayouts || []} />
    </div>
  )
}
