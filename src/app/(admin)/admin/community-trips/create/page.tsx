import { redirect } from 'next/navigation'
import { canManageAnyHostTrip } from '@/actions/hosting'
import { HostTripForm } from '@/components/hosting/HostTripForm'
import { getTripFormBootstrap } from '@/lib/hosting/trip-form-bootstrap'

export default async function CreateCommunityTripForHostPage() {
  const [canManage, bootstrap] = await Promise.all([canManageAnyHostTrip(), getTripFormBootstrap()])
  if (!canManage) redirect('/')
  return <HostTripForm staffCreate bootstrap={bootstrap} />
}
