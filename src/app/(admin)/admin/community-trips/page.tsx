import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getRequestAuth } from '@/lib/auth/request-session'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { computeReleasableHostEarning } from '@/lib/host-releasable'
import { parseRefundTiersJson, defaultHostRefundTiers } from '@/lib/refund-tiers'
import { isRazorpayXConfigured } from '@/lib/razorpay/x'
import CommunityTripsClient from './CommunityTripsClient'
import { fetchCommunityTripBookingCountsForPackages } from '@/lib/community-trip-booking-stats'
import { STAFF_ROLES } from '@/lib/auth/admin-permissions'
import type { UserRole, AdminPermissionKey } from '@/types'
import { hostListingAssignmentRows } from '@/lib/host-listing-contact'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

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

  const [{ data: trips }, { data: pendingPayoutsRaw }, { data: settingsRows }] = await Promise.all([
    svc
      .from('packages')
      .select('*, destination:destinations(name, state), host_assignment:host_listing_assignments(host_name, email, phone, status), host:profiles!packages_host_id_fkey(id, username, full_name, avatar_url, is_phone_verified, is_email_verified, host_rating)')
      .or('host_id.not.is.null,created_on_behalf_by.not.is.null')
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    svc
      .from('host_earnings')
      .select(
        '*, host:profiles(username, full_name, upi_id, bank_account_number, bank_ifsc, payout_method), booking:bookings(travel_date, check_in_date, confirmation_code, package:packages(title))',
      )
      .in('payout_status', ['pending', 'processing', 'failed'])
      .order('created_at', { ascending: false }),
    svc.from('platform_settings').select('key, value').in('key', ['platform_fee_percent', 'refund_tiers_host']),
  ])

  const tripList = (trips || []).map((t) => ({ ...t, host_assignment: hostListingAssignmentRows(t.host_assignment) }))
  const tripIds = tripList.map((t) => t.id as string)
  const bookingCountByPackage =
    tripIds.length > 0 ? await fetchCommunityTripBookingCountsForPackages(svc, tripIds) : {}
  const tripsWithBookings = tripList.map((t) => ({
    ...t,
    booking_count: bookingCountByPackage[t.id as string] ?? 0,
  }))

  const setting = (key: string) => settingsRows?.find((row) => row.key === key)?.value
  const refundTiers = parseRefundTiersJson((setting('refund_tiers_host') as string | null) ?? null, defaultHostRefundTiers())
  // Releasable-now info lets the client prefill a safe amount and show the refund gate.
  const pendingPayouts = ((pendingPayoutsRaw || []) as PendingPayoutRow[]).map((row) => {
    const booking = row.booking as { travel_date?: string | null; check_in_date?: string | null } | null
    return {
      ...row,
      releasable: computeReleasableHostEarning({
        hostPaise: Number(row.host_paise) || 0,
        releasedPaise: Number(row.released_paise) || 0,
        travelDateIso: booking?.travel_date ?? booking?.check_in_date ?? null,
        tiers: refundTiers,
      }),
    }
  })

  const razorpayxEnabled = isRazorpayXConfigured()

  const parsedFee = parseFloat(String(setting('platform_fee_percent') ?? '').trim())
  const platformFeePercent =
    Number.isFinite(parsedFee) && parsedFee >= 0 && parsedFee <= 100 ? Math.round(parsedFee * 100) / 100 : 15

  return (
    <div>
      <AdminPageHeader
        title="Community trips"
        description="Review host trips and release host payouts."
        actions={<Link href="/admin/community-trips/create" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">New trip for a host</Link>}
      />
      <CommunityTripsClient
        trips={tripsWithBookings}
        pendingPayouts={pendingPayouts || []}
        platformFeePercent={platformFeePercent}
        razorpayxEnabled={razorpayxEnabled}
      />
    </div>
  )
}
