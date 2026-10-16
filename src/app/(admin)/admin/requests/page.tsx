import { getAdminCustomRequests } from '@/actions/admin'
import { CustomRequestsClient } from './CustomRequestsClient'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

export default async function AdminRequestsPage() {
  const requests = await getAdminCustomRequests()
  return (
    <div>
      <AdminPageHeader title="Custom requests" description="Travellers asking for dates outside the schedule." />
      <CustomRequestsClient requests={requests} />
    </div>
  )
}
