import { HostTripForm } from '@/components/hosting/HostTripForm'

export default async function EditTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  return <HostTripForm editTripId={tripId} />
}
