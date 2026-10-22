import { readListingPin } from '@/lib/listing-location'

export function TripMeetingPoint({ point, address }: { point: unknown; address?: unknown }) {
  const pin = readListingPin(point)
  const label = typeof address === 'string' && address.trim() ? address.trim() : pin?.label
  if (!pin && !label) return null
  return (
    <div className="mt-2 text-sm">
      <span className="font-medium">Meeting point: </span>
      {pin ? (
        <a href={`https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lon}`}
          target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {label || 'Open map pin'}
        </a>
      ) : label}
    </div>
  )
}
