'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Star, MapPin, Calendar, Users, Plane, Home, Activity, Bike } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Package } from '@/types'

const TABS = [
  { id: 'trips',      label: 'Trips',      icon: Plane },
  { id: 'stays',      label: 'Stays',      icon: Home },
  { id: 'activities', label: 'Activities', icon: Activity },
  { id: 'rentals',    label: 'Rentals',    icon: Bike },
]

const AVATAR_INITIALS = ['R', 'A', 'D', 'S']
const AVATAR_COLORS   = ['#2E5A3E', '#1F3D2B', '#3A7052', '#162A1F']

export function HeroSection({ packages }: { packages: Package[] }) {
  const [activeTab, setActiveTab] = useState('trips')
  const [where, setWhere] = useState('')
  const router = useRouter()

  const heroImage = packages[0]?.images?.[0] ?? null

  function handleExplore(e: React.FormEvent) {
    e.preventDefault()
    const p = new URLSearchParams()
    if (where) p.set('q', where)
    if (activeTab !== 'trips') p.set('tab', activeTab)
    router.push(`/explore${p.toString() ? '?' + p.toString() : ''}`)
  }

  return (
    <section className="relative overflow-hidden py-14 lg:py-20 xl:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid lg:grid-cols-[1fr_440px] xl:grid-cols-[1fr_500px] gap-10 lg:gap-14 items-center">

          {/* ── Left ─────────────────────────────────────── */}
          <div className="space-y-7">

            {/* Trust badge */}
            <span
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-foreground/90"
              style={{
                background: 'oklch(0.222 0.048 152 / 0.65)',
                border: '1px solid oklch(0.38 0.065 152 / 0.50)',
              }}
            >
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              India's Most Trusted Solo Travel Community
            </span>

            {/* Headline */}
            <h1 className="text-5xl lg:text-6xl xl:text-[4.25rem] font-black leading-[1.02] tracking-tight">
              Travel solo.<br />
              Find your{' '}
              <span className="text-primary">people.</span>
            </h1>

            {/* Subtitle */}
            <p className="text-base lg:text-lg text-muted-foreground max-w-[420px] leading-relaxed">
              Trips, stays, experiences and a community<br className="hidden sm:block" /> for solo travelers.
            </p>

            {/* Category tabs */}
            <div className="flex flex-wrap gap-2">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                    activeTab === id
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'text-foreground/70 hover:text-foreground'
                  }`}
                  style={activeTab !== id ? {
                    background: 'oklch(0.222 0.048 152 / 0.50)',
                    border: '1px solid oklch(0.30 0.052 152 / 0.40)',
                  } : {}}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Search bar — glassmorphism */}
            <form
              onSubmit={handleExplore}
              className="flex flex-col sm:flex-row gap-0 rounded-2xl overflow-hidden max-w-2xl"
              style={{
                background: 'oklch(0.175 0.042 152 / 0.60)',
                backdropFilter: 'blur(20px) saturate(1.2)',
                WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
                border: '1px solid oklch(0.34 0.058 152 / 0.38)',
                boxShadow: '0 8px 40px oklch(0 0 0 / 0.32)',
              }}
            >
              <div className="flex items-center gap-2 flex-1 px-5 py-3.5">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Where are you going?"
                  value={where}
                  onChange={e => setWhere(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleExplore(e as unknown as React.FormEvent)}
                  className="bg-transparent text-sm w-full outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div
                className="hidden sm:flex items-center gap-2 px-5 py-3.5"
                style={{ borderLeft: '1px solid oklch(0.34 0.058 152 / 0.30)' }}
              >
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground whitespace-nowrap">Check-in – Check-out</span>
              </div>
              <div
                className="hidden sm:flex items-center gap-2 px-5 py-3.5"
                style={{ borderLeft: '1px solid oklch(0.34 0.058 152 / 0.30)' }}
              >
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">Guests</span>
              </div>
              <div className="p-2">
                <Button
                  type="submit"
                  className="bg-primary text-primary-foreground font-bold rounded-xl px-6 h-full hover:bg-primary/90 w-full sm:w-auto"
                >
                  Explore
                </Button>
              </div>
            </form>

            {/* Social proof */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex -space-x-2.5">
                {AVATAR_INITIALS.map((init, i) => (
                  <div
                    key={i}
                    className="h-9 w-9 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: AVATAR_COLORS[i] }}
                  >
                    {init}
                  </div>
                ))}
                <div className="h-9 w-9 rounded-full border-2 border-background bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0">
                  +2K
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Star className="h-4 w-4 text-primary fill-primary" />
                <span className="font-bold text-sm">4.8/5</span>
                <span className="text-muted-foreground text-sm">· Trusted by 10K+ solo travelers</span>
              </div>
            </div>
          </div>

          {/* ── Right — hero image ────────────────────────── */}
          <div className="relative hidden lg:block">
            {/* Glow behind image */}
            <div
              className="absolute -inset-8 -z-10 rounded-3xl blur-3xl opacity-35"
              style={{ background: 'radial-gradient(ellipse, oklch(0.38 0.095 152), transparent 70%)' }}
            />

            <div
              className="relative rounded-3xl overflow-hidden"
              style={{
                aspectRatio: '3 / 4',
                maxHeight: '600px',
                boxShadow: '0 40px 100px oklch(0 0 0 / 0.55), 0 0 0 1px oklch(0.35 0.055 152 / 0.30)',
              }}
            >
              {heroImage ? (
                <Image
                  src={heroImage}
                  alt="Solo traveler adventure"
                  fill
                  className="object-cover"
                  priority
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(160deg, oklch(0.32 0.085 152) 0%, oklch(0.18 0.045 152) 55%, oklch(0.12 0.030 152) 100%)',
                  }}
                >
                  {/* Decorative mountain silhouette when no image */}
                  <div className="absolute inset-0 flex items-end justify-center pb-16 opacity-20">
                    <svg viewBox="0 0 400 200" className="w-full" fill="white">
                      <polygon points="0,200 80,80 160,140 240,40 320,120 400,60 400,200" />
                    </svg>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

              {/* Floating rating card */}
              <div
                className="absolute bottom-5 right-5 rounded-2xl p-4"
                style={{
                  background: 'oklch(0.12 0.030 152 / 0.82)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid oklch(0.32 0.055 152 / 0.45)',
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Star className="h-4 w-4 text-primary fill-primary" />
                  <span className="font-bold text-sm text-white">4.8/5</span>
                </div>
                <p className="text-xs text-white/65 leading-snug">
                  Trusted by 10K+<br />solo travelers
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
