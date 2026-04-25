import Image from 'next/image'
import Link from 'next/link'
import { Star } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import type { WanderRatingHero } from '@/lib/wander/wanderQueries'
import type { WanderStats } from '@/lib/wander/wanderQueries'

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=85&w=2400&auto=format&fit=crop'

export function WanderHero({
  rating,
  stats,
}: {
  rating: WanderRatingHero
  stats: Pick<WanderStats, 'soloTravelers'>
}) {
  const trustLine =
    stats.soloTravelers >= 1000
      ? `${Math.floor(stats.soloTravelers / 1000)}K+`
      : stats.soloTravelers > 0
        ? `${stats.soloTravelers}+`
        : '10K+'

  return (
    <section className="relative w-full min-h-[clamp(420px,58vh,680px)] overflow-hidden bg-black">
      <div className="absolute inset-0">
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          className="object-cover object-center opacity-85"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-black/40" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-10 pb-16 md:pt-14 md:pb-20">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-4 inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
              India&apos;s most trusted solo travel community
            </p>
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-white md:text-6xl md:leading-[1.02]">
              Travel solo.
              <br />
              Find your <span className="text-primary">people</span>.
            </h1>
            <p className="mt-5 max-w-xl text-base text-white/75 md:text-lg">
              Trips, stays, experiences and a community for solo travelers.
            </p>
          </div>

          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/50 p-5 shadow-2xl backdrop-blur-md lg:mt-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20">
                <Star className="h-7 w-7 text-primary fill-primary" aria-hidden />
              </div>
              <div>
                <p className="text-2xl font-black text-white tabular-nums">
                  {rating.overall.toFixed(1)}
                  <span className="text-base font-semibold text-white/50">/5</span>
                </p>
                <p className="text-xs text-white/60">Overall from {rating.reviewCount || 'community'} reviews</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-white/80">Trusted by {trustLine} solo travelers</p>
            <div className="mt-4 flex items-center gap-2">
              <div className="flex -space-x-2">
                {rating.recentRaters.slice(0, 5).map(r => (
                  <Link
                    key={r.userId}
                    href={`/profile/${r.username}`}
                    className="relative inline-block ring-2 ring-black/80 rounded-full hover:z-10 hover:ring-primary/60 transition-all"
                    title={r.full_name || r.username}
                  >
                    <Avatar className="h-9 w-9 border-2 border-background">
                      <AvatarImage src={r.avatar_url || ''} alt="" />
                      <AvatarFallback className="bg-primary/20 text-[10px] font-bold text-primary">
                        {getInitials(r.full_name || r.username)}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
