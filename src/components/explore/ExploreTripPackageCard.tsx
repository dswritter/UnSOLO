'use client'

import type { Package } from '@/types'
import { TripCardView } from '@/components/listings/TripCardView'

export interface ExploreTripPackageCardProps {
  pkg: Package
  /** Dates are all in the past (no open upcoming departure): muted visuals + footer section */
  pastEdition: boolean
  spotsBooked: number
  interestTotal: number
  interested: boolean
  onOpenDetail: () => void
  onPrefetch: () => void
  onToggleInterest: (id: string) => void
}

export function ExploreTripPackageCard({
  pkg,
  pastEdition,
  spotsBooked,
  interestTotal,
  interested,
  onOpenDetail,
  onPrefetch,
  onToggleInterest,
}: ExploreTripPackageCardProps) {
  return (
    <TripCardView
      pkg={pkg}
      pastEdition={pastEdition}
      spotsBooked={spotsBooked}
      interestCount={interestTotal}
      interested={interested}
      imageSizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
      onOpen={onOpenDetail}
      onPrefetch={onPrefetch}
      onToggleInterest={() => onToggleInterest(pkg.id)}
    />
  )
}
