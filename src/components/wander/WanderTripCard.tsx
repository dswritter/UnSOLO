'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { Package } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPrice, cn } from '@/lib/utils'
import { storageThumbnailUrl } from '@/lib/images/storageThumbUrl'
import { pushWithRouteProgress } from '@/lib/navigation/pushWithRouteProgress'
import { hasTieredPricing } from '@/lib/package-pricing'
import { packageDurationShortLabel, packageNextDepartureLine } from '@/lib/package-trip-calendar'
import { MapPin, Mountain, Heart } from 'lucide-react'

// Frosted-glass difficulty chip, sitting on top of the card image. The text
// is a deeper hue than the previous lights — pale rose / amber / emerald
// vanished on a frosted background, so we lean toward saturated mid tones
// that hold their identity against both bright skies and dark forest art.
const DIFF: Record<string, string> = {
  easy: 'bg-white/15 text-emerald-200 border-white/25 backdrop-blur-md backdrop-saturate-150 shadow-sm',
  moderate: 'bg-white/15 text-amber-200 border-white/25 backdrop-blur-md backdrop-saturate-150 shadow-sm',
  challenging: 'bg-rose-900/55 text-rose-100 border-rose-300/40 backdrop-blur-md backdrop-saturate-150 shadow-sm',
}

type Props = {
  pkg: Package
  interestCount: number
  /** Server: package ids the signed-in user already marked interested */
  interestedPackageIds: string[]
  /** Render like explore “past” editions: subdued card + Past trip badge. */
  pastEdition?: boolean
}

export function WanderTripCard({ pkg, interestCount, interestedPackageIds, pastEdition = false }: Props) {
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const interestedSet = new Set(interestedPackageIds)
  const [wishlisted, setWishlisted] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    const saved = localStorage.getItem('wishlisted_packages')
    return new Set(saved ? JSON.parse(saved) : [])
  })

  const toggleWishlist = useCallback((packageId: string) => {
    setWishlisted(prev => {
      const next = new Set(prev)
      if (next.has(packageId)) next.delete(packageId)
      else next.add(packageId)
      if (typeof window !== 'undefined') {
        localStorage.setItem('wishlisted_packages', JSON.stringify([...next]))
      }
      return next
    })
  }, [])

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

  const heartActive = wishlisted.has(pkg.id) || interestedSet.has(pkg.id)
  const nextDeparture = packageNextDepartureLine(pkg)

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={openPackage}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openPackage()
        }
      }}
      onMouseEnter={() => router.prefetch(`/packages/${pkg.slug}`)}
      onFocus={() => router.prefetch(`/packages/${pkg.slug}`)}
      className={cn('block h-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#fcba03]/50 rounded-xl', pastEdition && 'opacity-95')}
    >
      <Card
        className={cn(
          'wander-frost-card h-full overflow-hidden border-border/80 py-0 gap-0 transition-all hover:shadow-lg hover:scale-[1.01]',
          'motion-reduce:transition-none motion-reduce:hover:scale-100',
          pkg.is_featured && !pastEdition && 'ring-1 ring-primary/30',
          pastEdition &&
            'border-dashed border-border/60 bg-muted/20 saturate-[0.92] grayscale-[15%] shadow-none hover:scale-[1.005] hover:grayscale-[5%]',
        )}
      >
        <div className="relative h-48 bg-secondary overflow-hidden">
          {pkg.images?.[0] ? (
            <Image
              src={storageThumbnailUrl(pkg.images[0]) || pkg.images[0]}
              alt=""
              fill
              className={cn('object-cover', pastEdition && 'brightness-[0.88] saturate-90')}
              sizes="(min-width: 1024px) 25vw, 100vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Mountain className="h-12 w-12 text-primary/30" />
            </div>
          )}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {pastEdition ? (
              <Badge className="text-[10px] border bg-black/55 text-white/95 border-white/25 backdrop-blur-xl">Past trip</Badge>
            ) : null}
            {pkg.is_featured ? (
              <Badge
                className={cn(
                  'text-[10px] border-0',
                  pastEdition ? 'bg-primary/70 text-primary-foreground' : 'bg-primary text-primary-foreground',
                )}
              >
                Featured
              </Badge>
            ) : null}
            <Badge variant="outline" className={cn('text-[10px] capitalize border', DIFF[pkg.difficulty] || '')}>
              {pkg.difficulty}
            </Badge>
          </div>
          <button
            type="button"
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              toggleWishlist(pkg.id)
            }}
            className="absolute top-2 right-2 z-10 rounded-full bg-black/35 p-2 backdrop-blur-xl backdrop-saturate-150 transition-all hover:bg-black/55"
            aria-label="Add to wishlist"
          >
            <Heart
              className={cn(
                'h-4 w-4 transition-all duration-300 sm:h-5 sm:w-5 motion-reduce:transition-none motion-reduce:scale-100',
                heartActive ? 'scale-110 fill-red-500 text-red-500' : 'text-white/80 hover:text-white',
              )}
            />
          </button>
        </div>
        <CardContent className="p-3 sm:p-4">
          <h3
            className={cn(
              'mb-1 line-clamp-2 text-sm font-bold leading-snug sm:text-base',
              pastEdition && 'text-muted-foreground font-semibold',
            )}
          >
            {pkg.title}
          </h3>
          <p className="mb-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            {pkg.destination ? `${pkg.destination.name}, ${pkg.destination.state}` : '—'}
          </p>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <span
                className={cn(
                  'text-base sm:text-lg',
                  pastEdition ? 'font-bold text-muted-foreground' : 'font-black text-primary',
                )}
              >
                {hasTieredPricing(pkg.price_variants) ? 'Starting from ' : ''}
                {formatPrice(pkg.price_paise)}
              </span>
              <span className="text-[10px] text-muted-foreground"> / person</span>
            </div>
            <div className="text-right text-[10px] space-y-0.5 shrink-0">
              <div className={cn('font-semibold tabular-nums', pastEdition ? 'text-muted-foreground' : 'text-foreground')}>
                {packageDurationShortLabel(pkg)}
              </div>
              {nextDeparture ? (
                <div className={cn('font-medium leading-tight', pastEdition ? 'text-muted-foreground/90' : 'text-primary')}>
                  {nextDeparture}
                </div>
              ) : null}
            </div>
          </div>
          {/* Cancellations & refunds link is intentionally NOT on the card —
              it lives on the trip detail page so the listing grid stays clean. */}
          {interestCount > 0 && (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Heart className="h-3 w-3 shrink-0 fill-red-400 text-red-400" />
              {interestCount} {interestCount === 1 ? 'person' : 'people'} interested
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
