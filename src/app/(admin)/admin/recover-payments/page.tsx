import { scanOrphanedRazorpayPayments, recoverBookingFromRazorpayOrder } from '@/actions/admin'
import { RecoverPaymentsClient } from './RecoverPaymentsClient'

export default function AdminRecoverPaymentsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-black">Recover <span className="text-primary">Payments</span></h1>
        <p className="text-sm text-muted-foreground mt-1">
          Rebuild bookings for travelers who were charged but whose booking row never persisted.
        </p>
      </div>
      <RecoverPaymentsClient scan={scanOrphanedRazorpayPayments} recover={recoverBookingFromRazorpayOrder} />
    </div>
  )
}
