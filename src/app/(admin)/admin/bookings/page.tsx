import { getAdminBookings, getStaffMembers } from '@/actions/admin'
import { AdminBookingsClient } from './AdminBookingsClient'

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled']
const ADMIN_BOOKINGS_PAGE_SIZE = 25

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const cancellation = sp.cancellation === 'requested'
  const statusParam = typeof sp.status === 'string' && STATUSES.includes(sp.status) ? sp.status : undefined
  // Which filter chip is active (server-authoritative).
  const activeStatus = cancellation ? 'cancellation_requested' : statusParam ?? 'all'

  const [page, staffMembers] = await Promise.all([
    getAdminBookings({
      status: statusParam,
      cancellation: cancellation ? 'requested' : undefined,
      limit: ADMIN_BOOKINGS_PAGE_SIZE,
      offset: 0,
    }),
    getStaffMembers(),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Manage Bookings</h1>
      <AdminBookingsClient
        key={activeStatus}
        bookings={page.rows}
        staffMembers={staffMembers}
        partialCancellationsByBooking={page.partialCancellationsByBooking}
        changeRequestsByBooking={page.changeRequestsByBooking}
        activeStatus={activeStatus}
        initialHasMore={page.hasMore}
        pageSize={ADMIN_BOOKINGS_PAGE_SIZE}
      />
    </div>
  )
}
