import type { ReactNode } from 'react'
import Image from 'next/image'
import { AuthV2Stats } from '@/components/auth/v2/AuthV2Stats'
import { AuthV2TopBar } from '@/components/auth/v2/AuthV2TopBar'
import { cn } from '@/lib/utils'
import type { WanderRatingHero, WanderStats } from '@/lib/wander/wanderQueries'

const HERO_IMAGE = '/auth/dark-glowing-tent.png'

type Mode = 'login' | 'signup'

const HERO: Record<Mode, { title: ReactNode }> = {
  login: {
    title: (
      <span className="text-[1.35rem] font-extrabold leading-snug text-white sm:text-3xl md:text-4xl">
        Welcome back to <span className="text-[#fcba03]">Unsolo</span>.
      </span>
    ),
  },
  signup: {
    title: (
      <span className="text-[1.35rem] font-extrabold leading-snug text-white sm:text-3xl md:text-4xl">
        Create your <span className="text-[#fcba03]">Unsolo</span> account.
      </span>
    ),
  },
}

/** Subtle northern-lights wash over the photo (keeps forest-green theme). */
const auroraLayerClass =
  'pointer-events-none absolute inset-0 mix-blend-soft-light [background:radial-gradient(ellipse_90%_55%_at_15%_15%,rgba(34,197,94,0.12),transparent_55%),radial-gradient(ellipse_70%_50%_at_85%_20%,rgba(16,185,129,0.1),transparent_50%)]'

type ShellProps = {
  mode: Mode
  children: ReactNode
  stats: WanderStats
  rating: Pick<WanderRatingHero, 'overall' | 'reviewCount'>
}

export function AuthV2Shell({ mode, children, stats, rating }: ShellProps) {
  const h = HERO[mode]
  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden text-white">
      {/* Full-bleed hero — tent composition on the left; form sits on the right over the same image */}
      <Image
        src={HERO_IMAGE}
        alt=""
        fill
        className="object-cover object-left"
        priority
        sizes="100vw"
      />
      {/* Readability: light scrim on tent side, stronger on the right for the form */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-black/25 via-[#010806]/35 to-[#010806]/78 md:via-[#010806]/40 md:to-[#010806]/85"
        aria-hidden
      />
      <div className={auroraLayerClass} aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1920px] flex-col lg:flex-row">
        {/* Left: wordmark, headline, frosted stats — over tent */}
        <div
          className={cn(
            'flex min-h-[17rem] w-full min-w-0 flex-1 flex-col p-4 sm:p-5 md:p-8 lg:min-h-dvh lg:w-[48%] lg:max-w-[52%] lg:py-10',
            'lg:pr-4',
          )}
        >
          <AuthV2TopBar />
          <div className="mt-6 min-w-0 sm:mt-8 md:mt-10 lg:mt-12">
            <h1 className="text-balance pr-1">{h.title}</h1>
          </div>
          <div className="mt-auto w-full min-w-0 pt-6 lg:pt-8">
            <div
              className={cn(
                'w-full max-w-full rounded-2xl border border-white/20 bg-white/[0.08] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.35)]',
                'backdrop-blur-xl backdrop-saturate-150 [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.12)]',
                'ring-1 ring-white/10 sm:p-4 md:rounded-3xl md:p-5',
              )}
            >
              <AuthV2Stats
                stats={stats}
                rating={rating}
                className="!max-w-full gap-x-3 gap-y-3 sm:gap-4 md:gap-6 md:justify-center"
              />
            </div>
          </div>
        </div>

        {/* Right: auth form on the same full-bleed image */}
        <div
          className={cn(
            'flex w-full flex-1 flex-col justify-stretch',
            'px-4 pb-6 pt-3 lg:min-h-dvh lg:w-[52%] lg:min-w-0 lg:justify-center lg:px-10 lg:py-8 xl:px-14',
            'min-h-0',
          )}
        >
          <div
            className={cn(
              'mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl shadow-black/50 backdrop-blur-md',
              'lg:mx-0 lg:ml-auto lg:max-w-lg lg:rounded-3xl lg:p-8 lg:py-9',
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
