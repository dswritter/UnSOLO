'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRight, MapPin, ChevronLeft, ChevronRight } from 'lucide-react'
import { packageDurationShortLabel } from '@/lib/package-trip-calendar'
import { hasTieredPricing } from '@/lib/package-pricing'

interface HeroPackage {
  slug: string
  title: string
  short_description?: string | null
  price_paise: number
  price_variants?: { description: string; price_paise: number }[] | null
  duration_days: number
  trip_days?: number | null
  trip_nights?: number | null
  difficulty: string
  images?: string[] | null
  destination?: { name: string; state: string } | null
}

function formatPrice(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`
}

export function HeroCarousel({
  packages,
  communityHref = '/signup',
  communityButtonLabel,
}: {
  packages: HeroPackage[]
  /** Logged-in users go to chat; guests go to signup */
  communityHref?: string
  /** e.g. signed-in: friendlier CTA than "Join" */
  communityButtonLabel?: string
}) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const totalSlides = 1 + packages.length

  function goTo(idx: number) {
    setCurrent(((idx % totalSlides) + totalSlides) % totalSlides)
  }

  function next() { goTo(current + 1) }
  function prev() { goTo(current - 1) }

  // Auto-advance every 5s (only when not paused)
  useEffect(() => {
    if (paused) return
    timerRef.current = setInterval(next, 5000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [current, totalSlides, paused]) // eslint-disable-line react-hooks/exhaustive-deps

  // ESC key resumes auto-advance
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && paused) {
        setPaused(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [paused])

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!paused) timerRef.current = setInterval(next, 5000)
  }

  const pkg = current > 0 ? packages[current - 1] : null

  return (
    <section
      className="relative overflow-hidden bg-black aspect-[21/9] min-h-[440px] max-h-[72vh]"
    >
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-black to-[#1a0f00] pointer-events-none" />
      {/* Package image background when showing a trip */}
      {pkg?.images?.[0] && (
        <div className="absolute inset-0 transition-opacity duration-700">
          <img src={pkg.images[0]} alt="" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />
        </div>
      )}
      {!pkg && (
        <>
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        </>
      )}

      {/* Content */}
      <div className="relative flex h-full items-center justify-center px-4 py-10 md:py-16">
        <div className="mx-auto max-w-4xl text-center w-full">
          {current === 0 ? (
            /* Slide 0: Hero text */
            <div key="hero" className="animate-fade-in">
              <Badge className="mb-6 bg-primary/20 text-primary border-primary/30 text-sm px-4 py-1">
                India&apos;s #1 Solo Travel Community
              </Badge>
              <h1 className="text-5xl md:text-7xl font-black leading-none tracking-tight mb-6">
                <span className="text-primary">UN</span><span className="text-white">SOLO</span>
              </h1>
              <p className="text-xl md:text-2xl text-white/90 font-medium mb-3">
                Change the way you travel.
              </p>
              <p className="text-base md:text-lg text-white/50 max-w-2xl mx-auto mb-10">
                Book curated solo trips across India, connect with fellow explorers in real-time,
                earn badges, and climb the leaderboard. Travel solo — never alone.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" className="bg-primary text-black font-bold hover:bg-primary/90" asChild>
                  <Link href="/explore">Explore Trips <ArrowRight className="ml-2 h-5 w-5" /></Link>
                </Button>
                <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 bg-white/5" asChild>
                  <Link href={communityHref} className="text-white">{communityButtonLabel ?? 'Join the Community'}</Link>
                </Button>
              </div>
            </div>
          ) : pkg ? (
            /* Slide 1+: Featured package — click pauses carousel */
            <div key={pkg.slug} className="animate-fade-in" onClick={() => setPaused(true)}>
              <Badge className="mb-4 bg-primary/90 text-black border-0 text-xs">Featured Trip</Badge>
              <h2 className="text-4xl md:text-6xl font-black text-white mb-3">
                {pkg.title}
              </h2>
              {pkg.destination && (
                <p className="text-white/60 text-sm flex items-center justify-center gap-1 mb-3">
                  <MapPin className="h-4 w-4" /> {pkg.destination.name}, {pkg.destination.state}
                </p>
              )}
              {pkg.short_description && (
                <p className="text-white/50 text-base max-w-xl mx-auto mb-6">{pkg.short_description}</p>
              )}
              <div className="flex items-center justify-center gap-6 mb-8">
                <span className="text-primary font-black text-2xl">
                  {hasTieredPricing(pkg.price_variants) ? 'From ' : ''}
                  {formatPrice(pkg.price_paise)}
                </span>
                <span className="text-white/40">·</span>
                <span className="text-white/60">{packageDurationShortLabel(pkg)}</span>
              </div>
              <Button size="lg" className="bg-primary text-black font-bold hover:bg-primary/90" asChild>
                <Link href={`/packages/${pkg.slug}`}>View Trip <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Navigation arrows */}
      {totalSlides > 1 && (
        <>
          <button
            onClick={() => { prev(); resetTimer() }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-sm"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => { next(); resetTimer() }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-sm"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Dots */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        {Array.from({ length: totalSlides }).map((_, i) => (
          <button
            key={i}
            onClick={() => { goTo(i); resetTimer() }}
            className={`h-2 rounded-full transition-all ${
              i === current ? 'w-6 bg-primary' : 'w-2 bg-white/30 hover:bg-white/50'
            }`}
          />
        ))}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.6s ease-out; }
      `}</style>
    </section>
  )
}
