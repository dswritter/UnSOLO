import { getAdminCustomRequests } from '@/actions/admin'
import { CustomRequestsClient } from './CustomRequestsClient'

export default async function AdminRequestsPage() {
  const requests = await getAdminCustomRequests()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Custom Date Requests</h1>
      <CustomRequestsClient requests={requests} />
    </div>
  )
}
