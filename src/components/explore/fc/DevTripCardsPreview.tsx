'use client'

import type { Package } from '@/types'
import { TripCardView } from '@/components/listings/TripCardView'

/** DEVELOPMENT-ONLY: renders the shared trip card (results grid / home rows) with sample packages. */
export function DevTripCardsPreview({ pkgs }: { pkgs: { pkg: Package; booked: number; past: boolean }[] }) {
  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 px-4 py-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {pkgs.map(({ pkg, booked, past }) => (
        <TripCardView key={pkg.id} pkg={pkg} pastEdition={past} spotsBooked={booked} interestCount={3} interested={false}
          imageSizes="25vw" onOpen={() => undefined} onToggleInterest={() => undefined} />
      ))}
    </div>
  )
}
