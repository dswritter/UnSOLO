import Image from 'next/image'
import Link from 'next/link'
import { Star, ShieldCheck } from 'lucide-react'
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
    <section className="relative w-full min-h-[clamp(220px,34vh,380px)] overflow-hidden bg-black">
      <div className="absolute inset-0">
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          className="object-cover object-center opacity-88"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/25" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/20 to-black/35" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-10 pt-6 pb-5 md:pt-8 md:pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between lg:gap-10">
          <div className="min-w-0 max-w-3xl flex-1">
            <p
              className="mb-3 inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/12 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-[0_6px_28px_rgba(0,0,0,0.35)] backdrop-blur-xl ring-1 ring-white/15 sm:text-[11px]"
              style={{ WebkitBackdropFilter: 'blur(16px)' }}
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
              <span className="leading-tight">India&apos;s most trusted solo travel community</span>
            </p>
            <h1 className="text-3xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl md:leading-[1.02]">
              Travel solo.
              <br />
              Find your <span className="text-primary">people</span>.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/80 md:text-base">
              Trips, stays, experiences and a community for solo travelers.
            </p>
          </div>

          <div className="w-full max-w-[240px] shrink-0 self-start rounded-xl border border-white/15 bg-black/45 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl md:min-h-[220px] md:max-w-[260px] md:p-5 flex flex-col justify-between ring-1 ring-white/10">
            <div className="flex items-start gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/25">
                <Star className="h-6 w-6 text-primary fill-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-3xl font-black text-white leading-none tabular-nums md:text-[2rem]">
                  {rating.overall.toFixed(1)}
                  <span className="text-sm font-semibold text-white/50">/5</span>
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-white/85 leading-snug">Trusted by {trustLine} solo travelers</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex -space-x-2">
                {rating.recentRaters.slice(0, 5).map(r => (
                  <Link
                    key={r.userId}
                    href={`/profile/${r.username}`}
                    className="relative inline-block ring-2 ring-black/80 rounded-full hover:z-10 hover:ring-primary/60 transition-all"
                    title={r.full_name || r.username}
                  >
                    <Avatar className="h-8 w-8 border-2 border-background sm:h-9 sm:w-9">
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
