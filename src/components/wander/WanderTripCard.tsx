'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Package } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPrice, cn } from '@/lib/utils'
import { packageDurationShortLabel, packageNextDepartureLine } from '@/lib/package-trip-calendar'
import { hasTieredPricing } from '@/lib/package-pricing'
import { MapPin, Mountain, Heart } from 'lucide-react'

const DIFF: Record<string, string> = {
  easy: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  moderate: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  challenging: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
}

type Props = {
  pkg: Package
  interestCount: number
  /** Server: package ids the signed-in user already marked interested */
  interestedPackageIds: string[]
}

export function WanderTripCard({ pkg, interestCount, interestedPackageIds }: Props) {
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
      router.push(`/packages/${pkg.slug}`)
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
      className="block h-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#fcba03]/50 rounded-xl"
    >
      <Card
        className={cn(
          'wander-frost-card h-full overflow-hidden border-border/80 py-0 gap-0 transition-all hover:shadow-lg hover:scale-[1.01]',
          'motion-reduce:transition-none motion-reduce:hover:scale-100',
          pkg.is_featured && 'ring-1 ring-primary/30',
        )}
      >
        <div className="relative h-48 bg-secondary overflow-hidden">
          {pkg.images?.[0] ? (
            <Image src={pkg.images[0]} alt="" fill className="object-cover" sizes="(min-width: 1024px) 25vw, 100vw" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Mountain className="h-12 w-12 text-primary/30" />
            </div>
          )}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {pkg.is_featured ? (
              <Badge className="text-[10px] bg-primary text-primary-foreground border-0">Featured</Badge>
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
          <h3 className="mb-1 line-clamp-2 text-sm font-bold leading-snug sm:text-base">{pkg.title}</h3>
          <p className="mb-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            {pkg.destination ? `${pkg.destination.name}, ${pkg.destination.state}` : '—'}
          </p>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <span className="text-base font-black text-primary sm:text-lg">
                {hasTieredPricing(pkg.price_variants) ? 'From ' : ''}
                {formatPrice(pkg.price_paise)}
              </span>
              <span className="text-[10px] text-muted-foreground"> / person</span>
            </div>
            <div className="text-right text-[10px] space-y-0.5 shrink-0">
              <div className="font-semibold text-foreground tabular-nums">{packageDurationShortLabel(pkg)}</div>
              {nextDeparture ? (
                <div className="text-[10px] font-medium text-primary leading-tight">{nextDeparture}</div>
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
