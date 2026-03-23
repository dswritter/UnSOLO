import { getAdminBookings, getStaffMembers } from '@/actions/admin'
import { AdminBookingsClient } from './AdminBookingsClient'

export default async function AdminBookingsPage() {
  const [bookings, staffMembers] = await Promise.all([
    getAdminBookings(),
    getStaffMembers(),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Manage Bookings</h1>
      <AdminBookingsClient bookings={bookings} staffMembers={staffMembers} />
    </div>
  )
}
