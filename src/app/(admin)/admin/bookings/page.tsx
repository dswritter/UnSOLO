import { getAdminBookings, getStaffMembers } from '@/actions/admin'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { AdminBookingsClient } from './AdminBookingsClient'
import type { PartialCancellationRow } from '@/components/bookings/PartialCancellation'

export default async function AdminBookingsPage() {
  const [bookings, staffMembers] = await Promise.all([
    getAdminBookings(),
    getStaffMembers(),
  ])

  // Partial (per-traveller) cancellations for these bookings, keyed by booking.
  const partialCancellationsByBooking: Record<string, PartialCancellationRow[]> = {}
  const bookingIds = bookings.map((b: { id: string }) => b.id)
  if (bookingIds.length) {
    const svc = createServiceRoleClient()
    const { data: pcRows } = await svc
      .from('booking_partial_cancellations')
      .select('*')
      .in('booking_id', bookingIds)
      .order('created_at', { ascending: false })
    for (const r of (pcRows || []) as PartialCancellationRow[]) {
      ;(partialCancellationsByBooking[r.booking_id] ||= []).push(r)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Manage Bookings</h1>
      <AdminBookingsClient
        bookings={bookings}
        staffMembers={staffMembers}
        partialCancellationsByBooking={partialCancellationsByBooking}
      />
    </div>
  )
}
