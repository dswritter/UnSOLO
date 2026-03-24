export const revalidate = 3600 // 1 hour

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Users, Star, MessageCircle, Trophy, Shield, ArrowRight, Mountain } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
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
  const supabase = await createClient()
  const [{ count: travelers }, { count: trips }, { count: destinations }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
    supabase.from('destinations').select('*', { count: 'exact', head: true }),
  ])
  return { travelers: travelers || 0, trips: trips || 0, destinations: destinations || 0 }
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400',
  moderate: 'bg-yellow-500/20 text-yellow-400',
  challenging: 'bg-red-500/20 text-red-400',
}

export default async function HomePage() {
  const [packages, profile, stats] = await Promise.all([
    getFeaturedPackages(),
    getCurrentProfile(),
    getStats(),
  ])

  const displayTravelers = stats.travelers > 0 ? `${stats.travelers}+` : '2,400+'
  const displayTrips = stats.trips > 0 ? `${stats.trips}+` : '500+'
  const displayDestinations = stats.destinations > 0 ? stats.destinations.toString() : '6'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar user={profile} />

      {/* Hero */}
      <section className="relative overflow-hidden py-24 md:py-36 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-black to-[#1a0f00] pointer-events-none" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative mx-auto max-w-4xl text-center">
          <Badge className="mb-6 bg-primary/20 text-primary border-primary/30 text-sm px-4 py-1">
            India&apos;s #1 Solo Travel Community
          </Badge>
          <h1 className="text-5xl md:text-7xl font-black leading-none tracking-tight mb-6">
            <span className="text-primary">UN</span><span className="text-foreground">SOLO</span>
          </h1>
          <p className="text-xl md:text-2xl text-white/90 font-medium mb-3">
            Change the way you travel.
          </p>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Book curated solo trips across India, connect with fellow explorers in real-time,
            earn badges, and climb the leaderboard. Travel solo — never alone.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-primary text-black font-bold hover:bg-primary/90 glow-gold" asChild>
              <Link href="/explore">Explore Trips <ArrowRight className="ml-2 h-5 w-5" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="border-border text-white hover:bg-secondary" asChild>
              <Link href="/signup">Join the Community</Link>
            </Button>
          </div>
        </div>
      </section>

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

      {/* Featured Packages */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-3xl md:text-4xl font-black">
                <span className="text-primary">Featured</span> Trips
              </h2>
              <p className="text-muted-foreground mt-2">Handpicked solo adventures across India</p>
            </div>
            <Button variant="outline" className="hidden sm:flex border-border" asChild>
              <Link href="/explore">View All <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {packages.length > 0 ? packages.map((pkg) => (
              <Link key={pkg.id} href={`/packages/${pkg.slug}`}>
                <Card className="bg-card border-border overflow-hidden card-hover cursor-pointer h-full">
                  <div className="relative h-48 bg-secondary overflow-hidden">
                    {pkg.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pkg.images[0]} alt={pkg.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                        <Mountain className="h-12 w-12 text-primary/40" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <Badge className={`text-xs ${DIFFICULTY_COLORS[pkg.difficulty] || 'bg-primary/20 text-primary'}`}>
                        {pkg.difficulty}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <MapPin className="h-3 w-3" />
                      {pkg.destination?.name}, {pkg.destination?.state}
                    </div>
                    <h3 className="font-bold text-white text-lg leading-tight mb-2">{pkg.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{pkg.short_description}</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-primary font-black text-lg">{formatPrice(pkg.price_paise)}</span>
                        <span className="text-muted-foreground text-xs ml-1">/ person</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{pkg.duration_days} days</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )) : (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="bg-card border-border overflow-hidden h-full">
                  <div className="h-48 bg-gradient-to-br from-secondary to-muted flex items-center justify-center">
                    <Mountain className="h-12 w-12 text-primary/40" />
                  </div>
                  <CardContent className="p-4 space-y-2">
                    <div className="h-3 w-24 bg-secondary rounded animate-pulse" />
                    <div className="h-5 w-48 bg-secondary rounded animate-pulse" />
                    <div className="h-3 w-full bg-secondary rounded animate-pulse" />
                  </CardContent>
                </Card>
              ))
            )}
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
              { step: '01', title: 'Discover & Book', desc: 'Browse curated solo trips. Pick your destination and book securely with Stripe.', icon: MapPin },
              { step: '02', title: 'Connect & Chat', desc: 'Get added to your trip\'s chat room automatically. Meet your fellow travelers before you leave.', icon: MessageCircle },
              { step: '03', title: 'Travel & Earn', desc: 'Complete trips, write reviews, and earn badges. Climb the leaderboard and build your legacy.', icon: Trophy },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div key={step} className="text-center space-y-4">
                <div className="relative mx-auto w-16 h-16">
                  <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
                    <Icon className="h-7 w-7 text-primary" />
                  </div>
                  <span className="absolute -top-2 -right-2 text-xs font-black text-primary bg-black px-1">{step}</span>
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
            <Link href="/chat" className="hover:text-white transition-colors">Community</Link>
            <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
            <a href="mailto:unsolo.in@gmail.com" className="hover:text-primary transition-colors">unsolo.in@gmail.com</a>
          </div>
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} UnSOLO. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
