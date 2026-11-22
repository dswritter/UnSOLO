import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TripPack } from '@/components/trips/TripPack'

export const metadata: Metadata = { title: 'Trip pack · UnSOLO', robots: { index: false } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Offline trip pack. The HTML is only a shell (no personal details), so the service worker can keep
 * it for places with no signal; the pack itself loads in the browser and is kept on this device.
 * Sign-in is checked by the API (a signed-out visit shows a sign-in link).
 */
export default async function TripPackPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  if (!UUID.test(bookingId)) notFound()
  return <TripPack bookingId={bookingId.toLowerCase()} />
}
