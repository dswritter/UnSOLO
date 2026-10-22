import { HostTripForm } from '@/components/hosting/HostTripForm'
import { getTripFormBootstrap } from '@/lib/hosting/trip-form-bootstrap'
import { checkIsHost, canManageAnyHostTrip, getHostTripDetail } from '@/actions/hosting'
import { notFound, redirect } from 'next/navigation'

export default async function EditTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  const [hostStatus, canManage] = await Promise.all([checkIsHost(), canManageAnyHostTrip()])
  if (!hostStatus.authenticated) redirect('/login')
  if (!hostStatus.isHost && !canManage) redirect('/host/verify')
  const [bootstrap, trip] = await Promise.all([
    getTripFormBootstrap(),
    getHostTripDetail(tripId),
  ])
  if (!trip) notFound()
  return <HostTripForm bootstrap={bootstrap} editTripId={tripId} initialTrip={trip} serverAuthorized />
}
