export const revalidate = 3600

import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { HeroSection } from '@/components/home/HeroSection'
import { HomeStatusRail } from '@/components/status/HomeStatusRail'
import { ChatNotificationWidget } from '@/components/chat/ChatNotificationWidget'
import { PresenceTracker } from '@/components/layout/PresenceTracker'
import { LandingPromoDock, type LandingPromoRow } from '@/components/home/LandingPromoDock'
import { formatPrice } from '@/lib/utils'
import { hasTieredPricing } from '@/lib/package-pricing'
import {
  Users, MapPin, Mountain, Star, ArrowRight,
  ShieldCheck, Headphones, BadgeCheck, Tag,
  Plane,
} from 'lucide-react'
import type { Package, Profile } from '@/types'

// ── Data fetchers ──────────────────────────────────────────────

async function getFeaturedPackages() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('packages')
    .select('*, destination:destinations(*)')
    .eq('is_featured', true)
    .eq('is_active', true)
    .limit(8)
  return (data || []) as Package[]
}

async function getCurrentProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  return data as Profile | null
}

async function getLandingPromos(): Promise<LandingPromoRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('landing_promo_cards')
    .select('id, title, body, href, link_label, image_url, variant, is_active, starts_at, ends_at')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  const now = Date.now()
  const rows = (data || []).filter(r => {
    if (r.starts_at && new Date(r.starts_at).getTime() > now) return false
    if (r.ends_at && new Date(r.ends_at).getTime() < now) return false
    return true
  })
  return rows.map(({ id, title, body, href, link_label, image_url, variant }) => ({
    id, title, body, href, link_label,
    image_url: image_url as string | null,
    variant: variant as LandingPromoRow['variant'],
  }))
}

async function getStats() {
  const { createClient: createSvc } = await import('@supabase/supabase-js')
  const supabase = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const [{ count: travelers }, { data: trips }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('guests, package:packages(destination_id)').in('status', ['confirmed', 'completed']),
  ])
  const totalTrips = (trips || []).reduce((s, b) => s + (b.guests || 1), 0)
  const uniqueDests = new Set((trips || []).map(b => (b.package as unknown as { destination_id: string } | null)?.destination_id).filter(Boolean)).size
  return { travelers: travelers || 0, trips: totalTrips, destinations: uniqueDests }
}

// ── Difficulty colours ─────────────────────────────────────────

const DIFF_BADGE: Record<string, string> = {
  easy:        'bg-emerald-600/90 text-white',
  moderate:    'bg-amber-500/90 text-black',
  challenging: 'bg-rose-600/90 text-white',
}
const DIFF_ICON: Record<string, string> = { easy: '✔', moderate: '⚠', challenging: '⚡' }

// ── Trip card ─────────────────────────────────────────────────

function TripCard({ pkg }: { pkg: Package }) {
  const image = pkg.images?.[0]
  const dest = pkg.destination as unknown as { name: string; state: string } | null
  const days  = pkg.trip_days ?? pkg.duration_days
  const nights = pkg.trip_nights ?? (days ? days - 1 : null)
  const isFromPrice = hasTieredPricing(pkg.price_variants)
  const isCommunity = !!pkg.host_id

  return (
    <Link href={`/packages/${pkg.slug}`} className="group block rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl" style={{ boxShadow: '0 4px 20px oklch(0 0 0 / 0.25)' }}>
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden">
        {image ? (
          <Image src={image} alt={pkg.title} fill className="object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, oklch(0.25 0.065 152), oklch(0.15 0.038 152))' }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* Badges top-left */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {pkg.is_featured && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground">Featured</span>
          )}
          {isCommunity && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-700/90 text-white">Community</span>
          )}
          {pkg.difficulty && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${DIFF_BADGE[pkg.difficulty] ?? 'bg-black/60 text-white'}`}>
              {DIFF_ICON[pkg.difficulty]} {pkg.difficulty.charAt(0).toUpperCase() + pkg.difficulty.slice(1)}
            </span>
          )}
        </div>

      </div>

      {/* Info */}
      <div className="p-4 space-y-2">
        <h3 className="font-bold text-base leading-snug line-clamp-1">{pkg.title}</h3>
        {dest && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{dest.name}, {dest.state}</span>
          </div>
        )}
        <div className="flex items-end justify-between pt-1">
          <div>
            <p className="text-xs text-muted-foreground">{isFromPrice ? 'From' : ''}</p>
            <p className="text-lg font-black text-primary">{formatPrice(pkg.price_paise)}<span className="text-xs font-normal text-muted-foreground"> /person</span></p>
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-0.5">
            {days && <p>{days}D{nights ? ` · ${nights}N` : ''}</p>}
            <div className="flex items-center gap-1 justify-end">
              <Star className="h-3 w-3 text-primary fill-primary" />
              <span className="text-foreground font-semibold">4.8</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────

export default async function HomePage() {
  let packages: Package[] = []
  let profile: Profile | null = null
  let stats = { travelers: 0, trips: 0, destinations: 0 }
  let landingPromos: LandingPromoRow[] = []

  try {
    ;[packages, profile, stats] = await Promise.all([
      getFeaturedPackages(),
      getCurrentProfile(),
      getStats(),
    ])
  } catch { /* Supabase down — show defaults */ }
  landingPromos = await getLandingPromos().catch(() => [])

  const displayTravelers   = stats.travelers   > 0 ? `${stats.travelers}+`   : '10K+'
  const displayDestinations = stats.destinations > 0 ? `${stats.destinations}` : '200+'
  const displayTrips       = stats.trips       > 0 ? `${stats.trips}+`       : '500+'

  const features = [
    { icon: Users,       title: 'Curated for solo travelers', desc: 'Handpicked trips just for you.' },
    { icon: BadgeCheck,  title: 'Trusted hosts & partners',   desc: 'Verified and community loved.' },
    { icon: Tag,         title: 'Best prices guaranteed',     desc: 'No hidden fees, ever.' },
    { icon: Headphones,  title: '24x7 support always here',   desc: 'We\'ve got your back anytime.' },
  ]

  const statItems = [
    { value: displayTravelers,    label: 'Solo Travelers',  icon: Users },
    { value: displayDestinations, label: 'Destinations',    icon: MapPin },
    { value: displayTrips,        label: 'Curated Trips',   icon: Plane },
    { value: '98%',               label: 'Happy Travelers', icon: Star },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar user={profile} />

      {/* ── Hero ─────────────────────────────────────────── */}
      <HeroSection packages={packages} />

      {/* ── Status rail (logged-in only) ─────────────────── */}
      {profile && <HomeStatusRail avatarUrl={profile.avatar_url} />}

      {/* ── Features + Stats bar ─────────────────────────── */}
      <section className="px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-7xl">
          <div
            className="rounded-2xl p-6 lg:p-8"
            style={{
              background: 'oklch(0.175 0.042 152 / 0.58)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid oklch(0.30 0.052 152 / 0.35)',
              boxShadow: '0 8px 40px oklch(0 0 0 / 0.22)',
            }}
          >
            {/* Feature cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {features.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'oklch(0.828 0.168 82 / 0.15)' }}>
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t mb-6" style={{ borderColor: 'oklch(0.30 0.052 152 / 0.30)' }} />

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statItems.map(({ value, label, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3">
                  <Icon className="h-6 w-6 text-primary shrink-0" />
                  <div>
                    <p className="text-xl font-black text-primary leading-none">{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Popular Trips ─────────────────────────────────── */}
      <section className="px-6 lg:px-8 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl lg:text-3xl font-black flex items-center gap-3">
              Popular Trips
              <span className="text-muted-foreground font-normal text-xl">—</span>
            </h2>
            <Link
              href="/explore"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              View all trips <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {packages.slice(0, 4).map(pkg => (
              <TripCard key={pkg.id} pkg={pkg} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Why UnSOLO ────────────────────────────────────── */}
      <section className="px-6 lg:px-8 py-12">
        <div className="mx-auto max-w-7xl">
          <div
            className="rounded-3xl p-8 lg:p-12 grid lg:grid-cols-2 gap-10 items-center"
            style={{
              background: 'linear-gradient(135deg, oklch(0.222 0.048 152 / 0.70) 0%, oklch(0.175 0.042 152 / 0.40) 100%)',
              border: '1px solid oklch(0.30 0.052 152 / 0.35)',
            }}
          >
            <div className="space-y-5">
              <h2 className="text-3xl lg:text-4xl font-black leading-tight">
                Why <span className="text-primary">UnSOLO?</span>
              </h2>
              <div className="space-y-4">
                {[
                  { icon: ShieldCheck, title: 'Solo First',        desc: 'Everything we do is designed for solo travelers.' },
                  { icon: Users,       title: 'Real Community',    desc: 'Connect, share and travel together.' },
                  { icon: BadgeCheck,  title: 'Verified & Safe',   desc: 'Trusted listings and secure bookings.' },
                  { icon: Tag,         title: 'Flexible & Easy',   desc: 'Plan, book and cancel with ease.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'oklch(0.828 0.168 82 / 0.15)' }}>
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{title}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div
                className="rounded-2xl p-6 space-y-3"
                style={{
                  background: 'oklch(0.148 0.038 152 / 0.60)',
                  border: '1px solid oklch(0.28 0.052 152 / 0.35)',
                }}
              >
                <p className="text-2xl font-black text-primary">Ready to explore?</p>
                <p className="text-sm text-muted-foreground">Join thousands of solo travelers discovering India together.</p>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors"
                >
                  Start Your Journey <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: displayTravelers,   label: 'Travelers' },
                  { value: displayDestinations, label: 'Destinations' },
                ].map(({ value, label }) => (
                  <div
                    key={label}
                    className="rounded-2xl p-4 text-center"
                    style={{ background: 'oklch(0.148 0.038 152 / 0.60)', border: '1px solid oklch(0.28 0.052 152 / 0.30)' }}
                  >
                    <p className="text-2xl font-black text-primary">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer
        className="mt-8 px-6 lg:px-8 py-10 border-t"
        style={{ borderColor: 'oklch(0.28 0.052 152 / 0.35)' }}
      >
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <span className="text-xl font-black">
              <span className="text-primary">UN</span><span className="text-foreground">SOLO</span>
            </span>
            <p className="text-xs text-muted-foreground mt-1">Change the way you travel.</p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground justify-center">
            <Link href="/explore"     className="hover:text-foreground transition-colors">Explore</Link>
            <Link href="/leaderboard" className="hover:text-foreground transition-colors">Leaderboard</Link>
            <Link href="/community"   className="hover:text-foreground transition-colors">Community</Link>
            <Link href="/host"        className="hover:text-foreground transition-colors">Host</Link>
            <a href="mailto:hello@unsolo.in" className="hover:text-primary transition-colors">hello@unsolo.in</a>
          </div>
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} UnSOLO</p>
        </div>
      </footer>

      {profile && <ChatNotificationWidget userId={profile.id} />}
      {profile && <PresenceTracker userId={profile.id} />}
      {landingPromos.length > 0 && <LandingPromoDock promos={landingPromos} liftForChatFab={!!profile} />}
    </div>
  )
}
