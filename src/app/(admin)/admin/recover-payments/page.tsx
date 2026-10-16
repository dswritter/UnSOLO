import { scanOrphanedRazorpayPayments, recoverBookingFromRazorpayOrder } from '@/actions/admin'
import { RecoverPaymentsClient } from './RecoverPaymentsClient'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

export default function AdminRecoverPaymentsPage() {
  return (
    <div>
      <AdminPageHeader title="Recover payments" description="Rebuild bookings for travellers who were charged but whose booking never saved." />
      <RecoverPaymentsClient scan={scanOrphanedRazorpayPayments} recover={recoverBookingFromRazorpayOrder} />
    </div>
  )
}
