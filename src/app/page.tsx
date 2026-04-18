export const revalidate = 3600 // 1 hour

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Users, Star, MessageCircle, Trophy, Shield, ArrowRight, Mountain } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { HeroCarousel } from '@/components/home/HeroCarousel'
import { HomeStatusRail } from '@/components/status/HomeStatusRail'
import { ChatNotificationWidget } from '@/components/chat/ChatNotificationWidget'
import { PresenceTracker } from '@/components/layout/PresenceTracker'
import type { Package, Profile } from '@/types'

async function getFeaturedPackages() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('packages')
    .select('*, destination:destinations(*)')
    .eq('is_featured', true)
    .eq('is_active', true)
    .limit(6)
  return (data || []) as Package[]
}

async function getCurrentProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  return data as Profile | null
}

async function getStats() {
  // Use direct supabase-js service client to bypass RLS completely
  const { createClient: createSvcClient } = await import('@supabase/supabase-js')
  const supabase = createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const [{ count: travelers }, { data: tripBookings }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('guests, package:packages(destination_id)').in('status', ['confirmed', 'completed']),
  ])

  // Sum guests for total trips booked (3 guests = 3 trips)
  const totalTrips = (tripBookings || []).reduce((sum, b) => sum + (b.guests || 1), 0)
  // Count distinct destinations
  const uniqueDests = new Set((tripBookings || []).map(b => (b.package as unknown as { destination_id: string } | null)?.destination_id).filter(Boolean)).size

  return { travelers: travelers || 0, trips: totalTrips, destinations: uniqueDests }
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-black/60 text-white backdrop-blur-sm',
  moderate: 'bg-black/60 text-white backdrop-blur-sm',
  challenging: 'bg-black/60 text-white backdrop-blur-sm',
}
const DIFFICULTY_ICONS: Record<string, string> = {
  easy: '\u2714',
  moderate: '\u26A0',
  challenging: '\u26A1',
}

export default async function HomePage() {
  let packages: Package[] = []
  let profile: Profile | null = null
  let stats = { travelers: 0, trips: 0, destinations: 0 }

  try {
    ;[packages, profile, stats] = await Promise.all([
      getFeaturedPackages(),
      getCurrentProfile(),
      getStats(),
    ])
  } catch {
    // If Supabase is down, show page with defaults
  }

  const displayTravelers = stats.travelers > 0 ? `${stats.travelers}+` : '10+'
  const displayTrips = stats.trips > 0 ? `${stats.trips}+` : '0'
  const displayDestinations = stats.destinations > 0 ? stats.destinations.toString() : '8'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar user={profile} />

      {/* Status photos (24h) — signed-in only */}
      {profile ? <HomeStatusRail avatarUrl={profile.avatar_url} /> : null}

      {/* Hero + Featured Trips Carousel */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <HeroCarousel
        packages={packages as any[]}
        communityHref={profile ? '/community' : '/signup'}
        communityButtonLabel={profile ? 'Sneak into the tribe' : undefined}
      />

      {/* Stats */}
      <section className="border-y border-border bg-card/50 py-10">
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid grid-cols-3 gap-6 text-center">
            {[
              { value: displayTravelers, label: 'Solo Travelers', icon: Users },
              { value: displayDestinations, label: 'Destinations', icon: MapPin },
              { value: displayTrips, label: 'Trips Booked', icon: Mountain },
            ].map(({ value, label, icon: Icon }) => (
              <div key={label} className="space-y-1">
                <Icon className="h-5 w-5 text-primary mx-auto mb-2" />
                <div className="text-2xl md:text-3xl font-black text-primary">{value}</div>
                <div className="text-xs md:text-sm text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-card/30 border-y border-border">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-3xl md:text-4xl font-black mb-3">How <span className="text-primary">UnSOLO</span> Works</h2>
          <p className="text-muted-foreground mb-12">Three simple steps to your next adventure</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Discover & Book', desc: 'Browse curated solo trips. Pick your destination and book securely with Razorpay.', icon: MapPin },
              { step: '02', title: 'Connect & Chat', desc: 'Get added to your trip\'s chat room automatically. Meet your fellow travelers before you leave.', icon: MessageCircle },
              { step: '03', title: 'Travel & Earn', desc: 'Complete trips, write reviews, and earn badges. Climb the leaderboard and build your legacy.', icon: Trophy },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div key={step} className="text-center space-y-4">
                <div className="relative mx-auto w-16 h-16">
                  <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
                    <Icon className="h-7 w-7 text-primary" />
                  </div>
                  <span className="absolute -top-1 -right-1 text-[10px] font-black text-primary-foreground bg-primary rounded-full w-5 h-5 flex items-center justify-center">{step}</span>
                </div>
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl md:text-4xl font-black text-center mb-12">
            Built for <span className="text-primary">solo explorers</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Shield, title: 'Safe Payments', desc: 'Secure checkout powered by Razorpay. UPI, cards, netbanking accepted.' },
              { icon: MessageCircle, title: 'Real-time Chat', desc: 'Connect with trip-mates and the community in live chat rooms.' },
              { icon: Trophy, title: 'Leaderboard', desc: 'Compete with fellow travelers. Earn points for every adventure.' },
              { icon: Star, title: 'Verified Reviews', desc: 'Only confirmed travelers can review. Honest, real feedback.' },
              { icon: Users, title: 'Travel Profiles', desc: 'Showcase your journeys, badges, and travel style.' },
              { icon: MapPin, title: 'India First', desc: 'Curated trips across India\'s most stunning states and regions.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-5 rounded-xl border border-border bg-card/50 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-bold">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 px-4 bg-primary/10 border-y border-primary/20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl md:text-4xl font-black mb-4">Ready to change the way you travel?</h2>
          <p className="text-muted-foreground mb-8">Join thousands of solo travelers exploring India together.</p>
          <Button size="lg" className="bg-primary text-black font-bold hover:bg-primary/90 glow-gold" asChild>
            <Link href="/signup">Start Your Journey <ArrowRight className="ml-2 h-5 w-5" /></Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-border">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-xl font-black">
              <span className="text-primary">UN</span><span className="text-foreground">SOLO</span>
            </span>
            <p className="text-xs text-muted-foreground mt-1">Change the way you travel.</p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <Link href="/explore" className="hover:text-white transition-colors">Explore</Link>
            <Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
            <Link href="/community" className="hover:text-white transition-colors">Community</Link>
            <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
            <a href="mailto:hello@unsolo.in" className="hover:text-primary transition-colors">hello@unsolo.in</a>
          </div>
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} UnSOLO. All rights reserved.</p>
        </div>
      </footer>

      {/* Chat notification widget + floating button (for logged-in users) */}
      {profile && <ChatNotificationWidget userId={profile.id} />}
      {profile && <PresenceTracker userId={profile.id} />}
    </div>
  )
}
