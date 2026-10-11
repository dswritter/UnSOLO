import { redirect } from 'next/navigation'
import { canManageAnyHostTrip } from '@/actions/hosting'
import { HostTripForm } from '@/components/hosting/HostTripForm'

export default async function CreateCommunityTripForHostPage() {
  if (!(await canManageAnyHostTrip())) redirect('/')
  return <HostTripForm staffCreate />
}