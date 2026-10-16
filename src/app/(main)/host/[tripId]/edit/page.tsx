import { HostTripForm } from '@/components/hosting/HostTripForm'
import { getTripFormBootstrap } from '@/lib/hosting/trip-form-bootstrap'

export default async function EditTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  return <HostTripForm bootstrap={await getTripFormBootstrap()} editTripId={tripId} />
}
