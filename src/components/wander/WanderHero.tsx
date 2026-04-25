import Link from 'next/link'
import type { ReactNode } from 'react'
import { Star, ShieldCheck } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import type { WanderRatingHero } from '@/lib/wander/wanderQueries'
import type { WanderStats } from '@/lib/wander/wanderQueries'

export function WanderHero({
  rating,
  stats,
  heroImageUrl,
  trustBadgeText,
  children,
}: {
  rating: WanderRatingHero
  stats: Pick<WanderStats, 'soloTravelers'>
  /** From Admin platform_settings `wander_hero_image_url` */
  heroImageUrl: string
  /** From Admin `wander_trust_badge_text`; product default when empty */
  trustBadgeText: string
  /** Search / filter bar — placed inside hero so its bottom aligns with the rating card */
  children?: ReactNode
}) {
  const trustLine =
    stats.soloTravelers >= 1000
      ? `${Math.floor(stats.soloTravelers / 1000)}K+`
      : stats.soloTravelers > 0
        ? `${stats.soloTravelers}+`
        : '10K+'

  return (
    <section className="relative w-full min-h-0 overflow-hidden bg-background">
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL from admin; any HTTPS host */}
        <img
          src={heroImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-88"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/30 to-background/50" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[min(100%,1920px)] px-4 pb-4 pt-5 sm:px-6 md:pb-5 md:pt-6 lg:px-10">
        <div className="grid min-h-[min(100%,clamp(300px,48vh,560px))] grid-cols-1 gap-4 lg:min-h-[clamp(300px,44vh,520px)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch">
          <div className="flex min-h-0 min-w-0 flex-col justify-between gap-3">
            <div className="min-w-0 self-start max-w-3xl">
              <p
                className="mb-3 inline-flex w-fit max-w-[min(100%,42rem)] items-start gap-2 rounded-lg border border-primary/30 bg-primary/8 px-3 py-2 text-left text-xs font-medium leading-snug text-white shadow-sm backdrop-blur-md ring-1 ring-white/5 sm:text-[13px]"
                style={{ WebkitBackdropFilter: 'blur(14px)' }}
              >
                <ShieldCheck
                  className="h-4 w-4 shrink-0 text-[#fcba03] mt-0.5"
                  strokeWidth={2}
                  aria-hidden
                />
                <span>{trustBadgeText}</span>
              </p>
              <h1 className="text-3xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl md:leading-[1.02]">
                Travelling solo?
                <br />
                Find your <span className="text-primary">people</span>.
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-white/80 md:text-base">
                Trips, stays, experiences and a community for solo travelers.
              </p>
            </div>
            {children ? (
              <div className="w-full min-w-0 max-w-[min(100%,52.8rem)] pt-0">{children}</div>
            ) : null}
          </div>

          <div className="flex min-w-0 items-end justify-end self-stretch sm:min-h-[7rem]">
            <div className="w-[8.5rem] shrink-0 rounded-xl border border-white/15 bg-background/50 p-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md flex flex-col justify-between gap-2.5 ring-1 ring-white/10 [aspect-ratio:1/1.12] min-h-[9.5rem] sm:min-h-[10rem]">
              <div className="flex items-start gap-1.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/25">
                  <Star className="h-4 w-4 text-primary fill-primary" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-black text-white leading-none tabular-nums">
                    {rating.overall.toFixed(1)}
                    <span className="text-xs font-semibold text-white/50">/5</span>
                  </p>
                </div>
              </div>
              <p className="text-[11px] font-bold leading-tight text-white sm:text-xs">
                <span className="block">Trusted by {trustLine}</span>
                <span className="block">solo travelers</span>
              </p>
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-2">
                  {rating.recentRaters.slice(0, 5).map(r => (
                    <Link
                      key={r.userId}
                      href={`/profile/${r.username}`}
                      className="relative inline-block ring-2 ring-background/90 rounded-full hover:z-10 hover:ring-primary/60 transition-all"
                      title={r.full_name || r.username}
                    >
                      <Avatar className="h-6 w-6 border-2 border-background sm:h-7 sm:w-7">
                        <AvatarImage src={r.avatar_url || ''} alt="" />
                        <AvatarFallback className="bg-primary/20 text-[9px] font-bold text-primary">
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
      </div>
    </section>
  )
}
