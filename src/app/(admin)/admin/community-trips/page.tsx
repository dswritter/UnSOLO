import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getReleasableHostEarning } from '@/actions/host-payout'
import { isRazorpayXConfigured } from '@/lib/razorpay/x'
import CommunityTripsClient from './CommunityTripsClient'
import { fetchCommunityTripBookingCountsForPackages } from '@/lib/community-trip-booking-stats'

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

  const tripList = trips || []
  const tripIds = tripList.map((t) => t.id as string)
  const bookingCountByPackage =
    tripIds.length > 0 ? await fetchCommunityTripBookingCountsForPackages(supabase, tripIds) : {}
  const tripsWithBookings = tripList.map((t) => ({
    ...t,
    booking_count: bookingCountByPackage[t.id as string] ?? 0,
  }))

  // Get pending payouts (booking details for admin transfer)
  const { data: pendingPayoutsRaw } = await supabase
    .from('host_earnings')
    .select(
      '*, host:profiles(username, full_name, upi_id, bank_account_number, bank_ifsc, payout_method), booking:bookings(travel_date, check_in_date, confirmation_code, package:packages(title))',
    )
    .in('payout_status', ['pending', 'processing', 'failed'])
    .order('created_at', { ascending: false })

  // Attach releasable-now info so the client can prefill safe amount + show the refund gate.
  const pendingPayouts = await Promise.all(
    (pendingPayoutsRaw || []).map(async (row: any) => {
      const info = await getReleasableHostEarning(row.id)
      return { ...row, releasable: 'error' in info ? null : info }
    }),
  )

  const razorpayxEnabled = isRazorpayXConfigured()

  const { data: feeRow } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'platform_fee_percent')
    .maybeSingle()
  const parsedFee = parseFloat(String(feeRow?.value ?? '').trim())
  const platformFeePercent =
    Number.isFinite(parsedFee) && parsedFee >= 0 && parsedFee <= 100 ? Math.round(parsedFee * 100) / 100 : 15

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">Community <span className="text-primary">Trips</span></h1>
      <p className="text-muted-foreground text-sm mb-6">Moderate user-hosted trips and manage host payouts</p>
      <CommunityTripsClient
        trips={tripsWithBookings}
        pendingPayouts={pendingPayouts || []}
        platformFeePercent={platformFeePercent}
        razorpayxEnabled={razorpayxEnabled}
      />
    </div>
  )
}
