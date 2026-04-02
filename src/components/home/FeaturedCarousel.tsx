'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin, Mountain, ChevronLeft, ChevronRight } from 'lucide-react'

interface FeaturedPackage {
  id: string
  slug: string
  title: string
  short_description: string
  price_paise: number
  duration_days: number
  difficulty: string
  images: string[] | null
  max_group_size: number
  destination: { name: string; state: string } | null
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/30',
  moderate: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  challenging: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const DIFFICULTY_ICONS: Record<string, string> = {
  easy: '✔',
  moderate: '⚠',
  challenging: '⚡',
}

function formatPrice(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`
}

export function FeaturedCarousel({ packages }: { packages: FeaturedPackage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const autoScrollRef = useRef<NodeJS.Timeout | null>(null)

  function updateScrollState() {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 10)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }

  function scrollBy(dir: 'left' | 'right') {
    const el = scrollRef.current
    if (!el) return
    const cardWidth = el.querySelector('a')?.clientWidth || 340
    el.scrollBy({ left: dir === 'right' ? cardWidth + 24 : -(cardWidth + 24), behavior: 'smooth' })
  }

  // Auto-scroll every 4 seconds
  useEffect(() => {
    if (packages.length <= 1) return

    function startAutoScroll() {
      autoScrollRef.current = setInterval(() => {
        const el = scrollRef.current
        if (!el) return
        // If at the end, scroll back to start
        if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 10) {
          el.scrollTo({ left: 0, behavior: 'smooth' })
        } else {
          const cardWidth = el.querySelector('a')?.clientWidth || 340
          el.scrollBy({ left: cardWidth + 24, behavior: 'smooth' })
        }
      }, 4000)
    }

    startAutoScroll()

    // Pause on hover
    const el = scrollRef.current
    const pause = () => { if (autoScrollRef.current) clearInterval(autoScrollRef.current) }
    const resume = () => { pause(); startAutoScroll() }
    el?.addEventListener('mouseenter', pause)
    el?.addEventListener('mouseleave', resume)

    return () => {
      if (autoScrollRef.current) clearInterval(autoScrollRef.current)
      el?.removeEventListener('mouseenter', pause)
      el?.removeEventListener('mouseleave', resume)
    }
  }, [packages.length])

  if (packages.length === 0) return null

  return (
    <div className="relative group">
      {/* Scroll buttons */}
      {canScrollLeft && (
        <button
          onClick={() => scrollBy('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 bg-black/70 hover:bg-black/90 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity -ml-2"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scrollBy('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 bg-black/70 hover:bg-black/90 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity -mr-2"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* Scrollable strip */}
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-smooth pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {packages.map((pkg) => (
          <Link
            key={pkg.id}
            href={`/packages/${pkg.slug}`}
            className="snap-start shrink-0 w-[320px] sm:w-[360px]"
          >
            <Card className="bg-card border-border overflow-hidden card-hover cursor-pointer h-full">
              <div className="relative h-48 bg-secondary overflow-hidden">
                {pkg.images?.[0] ? (
                  <img src={pkg.images[0]} alt={pkg.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                    <Mountain className="h-12 w-12 text-primary/40" />
                  </div>
                )}
                <div className="absolute top-3 left-3">
                  <Badge className={`text-xs ${DIFFICULTY_COLORS[pkg.difficulty] || 'bg-black/60 text-white backdrop-blur-sm'}`}>
                    {DIFFICULTY_ICONS[pkg.difficulty] || ''} {pkg.difficulty}
                  </Badge>
                </div>
                <Badge className="absolute top-3 right-3 text-xs bg-primary/90 text-black border-0">
                  Featured
                </Badge>
              </div>
              <CardContent className="p-4">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <MapPin className="h-3 w-3" />
                  {pkg.destination?.name}, {pkg.destination?.state}
                </div>
                <h3 className="font-bold text-foreground text-lg leading-tight mb-2">{pkg.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{pkg.short_description}</p>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-primary font-black text-lg">{formatPrice(pkg.price_paise)}</span>
                    <span className="text-muted-foreground text-xs ml-1">/ person</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">{pkg.duration_days} days</span>
                    <div className="text-[10px] text-muted-foreground">Max {pkg.max_group_size} people</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 mt-4">
        {packages.map((_, i) => (
          <div key={i} className="h-1.5 w-1.5 rounded-full bg-primary/30" />
        ))}
      </div>
    </div>
  )
}
