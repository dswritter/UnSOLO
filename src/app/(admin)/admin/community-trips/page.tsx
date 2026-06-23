import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getReleasableHostEarning } from '@/actions/host-payout'
import { isRazorpayXConfigured } from '@/lib/razorpay/x'
import CommunityTripsClient from './CommunityTripsClient'
import { fetchCommunityTripBookingCountsForPackages } from '@/lib/community-trip-booking-stats'
import { STAFF_ROLES } from '@/lib/auth/admin-permissions'
import type { UserRole, AdminPermissionKey } from '@/types'

type PendingPayoutRow = { id: string } & Record<string, unknown>

const ALLOWED_ROLES: UserRole[] = ['admin', 'host_onboarding_staff']

export default async function AdminCommunityTripsPage() {
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('team_members').select('role, is_active, custom_permissions').eq('user_id', user.id).maybeSingle(),
  ])

  const effectiveRole: UserRole | null =
    profile?.role && STAFF_ROLES.includes(profile.role as UserRole)
      ? (profile.role as UserRole)
      : membership?.is_active && membership.role && STAFF_ROLES.includes(membership.role as UserRole)
        ? (membership.role as UserRole)
        : null

  const customPermissions: AdminPermissionKey[] =
    effectiveRole === 'custom' && Array.isArray(membership?.custom_permissions)
      ? (membership.custom_permissions as AdminPermissionKey[])
      : []

  const hasAccess =
    (effectiveRole && ALLOWED_ROLES.includes(effectiveRole)) ||
    customPermissions.includes('community_trips')

  if (!hasAccess) redirect('/')

  // Use service-role for all queries: host_earnings is RLS-restricted to the
  // host's own rows, so a staff member's session client would return empty.
  const svc = createServiceRoleClient()

  // Fetch all community trips (host_id not null)
  const { data: trips } = await svc
    .from('packages')
    .select('*, destination:destinations(name, state), host:profiles!packages_host_id_fkey(id, username, full_name, avatar_url, is_phone_verified, is_email_verified, host_rating)')
    .not('host_id', 'is', null)
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  const tripList = trips || []
  const tripIds = tripList.map((t) => t.id as string)
  const bookingCountByPackage =
    tripIds.length > 0 ? await fetchCommunityTripBookingCountsForPackages(svc, tripIds) : {}
  const tripsWithBookings = tripList.map((t) => ({
    ...t,
    booking_count: bookingCountByPackage[t.id as string] ?? 0,
  }))

  // Get pending payouts — must use service-role (host_earnings RLS: host sees own only).
  const { data: pendingPayoutsRaw } = await svc
    .from('host_earnings')
    .select(
      '*, host:profiles(username, full_name, upi_id, bank_account_number, bank_ifsc, payout_method), booking:bookings(travel_date, check_in_date, confirmation_code, package:packages(title))',
    )
    .in('payout_status', ['pending', 'processing', 'failed'])
    .order('created_at', { ascending: false })

  // Attach releasable-now info so the client can prefill safe amount + show the refund gate.
  const pendingPayouts = await Promise.all(
    ((pendingPayoutsRaw || []) as PendingPayoutRow[]).map(async (row) => {
      const info = await getReleasableHostEarning(row.id)
      return { ...row, releasable: 'error' in info ? null : info }
    }),
  )

  const razorpayxEnabled = isRazorpayXConfigured()

  const { data: feeRow } = await svc
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
