'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Package } from '@/types'
import { pushWithRouteProgress } from '@/lib/navigation/pushWithRouteProgress'
import { toggleInterest } from '@/actions/booking'
import { useAuth } from '@/components/layout/AuthProvider'
import { toast } from 'sonner'
import { TripCardView } from '@/components/listings/TripCardView'
import { rememberViewerInterest, useViewerInterested } from '@/lib/explore/viewer-interests'

type Props = {
  pkg: Package
  interestCount: number
  /** Optional server-known interests; otherwise the viewer's interests load in the browser. */
  interestedPackageIds?: string[]
  /** Render like explore “past” editions: subdued card + Past trip badge. */
  pastEdition?: boolean
  /** Guests already booked across this package's departures (for "Only N left"). */
  spotsBooked?: number
}

export function WanderTripCard({ pkg, interestCount, interestedPackageIds = [], pastEdition = false, spotsBooked = 0 }: Props) {
  const router = useRouter()
  const { userId } = useAuth()
  const [isMobile, setIsMobile] = useState(false)
  const loadedInterested = useViewerInterested(userId, pkg.id)
  const [interestOverride, setInterestOverride] = useState<boolean | null>(null)
  const interested = interestOverride ?? loadedInterested ?? interestedPackageIds.includes(pkg.id)
  const [count, setCount] = useState(interestCount)
  const [togglePending, setTogglePending] = useState(false)

  const toggleInterested = useCallback(async (packageId: string) => {
    if (!userId) {
      router.push('/login')
      return
    }
    if (togglePending) return
    setTogglePending(true)
    const wasInterested = interested
    setInterestOverride(!wasInterested)
    setCount(c => wasInterested ? c - 1 : c + 1)

    const result = await toggleInterest(packageId)
    if ('error' in result && result.error) {
      toast.error(result.error)
      setInterestOverride(wasInterested)
      setCount(c => wasInterested ? c + 1 : c - 1)
    } else {
      rememberViewerInterest(userId, packageId, !wasInterested)
    }
    setTogglePending(false)
  }, [interested, togglePending, userId, router])

  const openPackage = useCallback(() => {
    if (isMobile) {
      pushWithRouteProgress(router, `/packages/${pkg.slug}`)
      return
    }
    window.open(`/packages/${pkg.slug}`, '_blank', 'noopener,noreferrer')
  }, [isMobile, pkg.slug, router])

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <TripCardView
      pkg={pkg}
      pastEdition={pastEdition}
      spotsBooked={spotsBooked}
      interestCount={count}
      interested={interested}
      togglePending={togglePending}
      imageSizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 80vw"
      onOpen={openPackage}
      onPrefetch={() => router.prefetch(`/packages/${pkg.slug}`)}
      onToggleInterest={() => void toggleInterested(pkg.id)}
    />
  )
}
