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

/** Northern-lights / aurora-style deep green base + glowing mint bands */
const auroraLayerClass =
  'pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_90%_55%_at_15%_15%,rgba(34,197,94,0.2),transparent_55%),radial-gradient(ellipse_70%_50%_at_85%_20%,rgba(16,185,129,0.16),transparent_50%),radial-gradient(ellipse_100%_60%_at_50%_85%,rgba(6,78,59,0.5),transparent_55%),linear-gradient(180deg,rgba(1,8,4,0.4)_0%,transparent_40%,rgba(1,8,4,0.5)_100%)]'

type ShellProps = {
  mode: Mode
  children: ReactNode
  stats: WanderStats
  rating: Pick<WanderRatingHero, 'overall' | 'reviewCount'>
}

export function AuthV2Shell({ mode, children, stats, rating }: ShellProps) {
  const h = HERO[mode]
  return (
    <div
      className={cn(
        'relative flex min-h-dvh w-full flex-col overflow-x-hidden text-white',
        'bg-[#020a07]',
      )}
    >
      <div className={auroraLayerClass} aria-hidden />
      <div className="relative z-[1] mx-auto flex min-h-dvh w-full max-w-[1920px] flex-1 flex-col md:flex-row">
        {/* Visual column — stats sit on frosted glass at bottom of photo only */}
        <div className="relative min-h-[min(52vh,520px)] w-full flex-shrink-0 md:min-h-dvh md:w-1/2 lg:w-[52%]">
          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            className="object-cover object-center"
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-[#010806] via-[#010806]/25 to-[#010806]/30 md:bg-gradient-to-r md:from-[#010806]/35 md:via-[#010806]/15 md:to-[#010806]/5"
            aria-hidden
          />
          <div className="absolute inset-0 flex min-h-0 flex-col p-4 sm:p-5 md:p-8 lg:p-10">
            <AuthV2TopBar />
            <div className="mt-6 min-w-0 sm:mt-8 md:mt-10 lg:mt-12">
              <h1 className="text-balance pr-1">{h.title}</h1>
            </div>
            <div className="mt-auto w-full min-w-0 pt-6 md:pt-8">
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
        </div>

        {/* Form column */}
        <div
          className={cn(
            'relative z-[1] -mt-8 flex w-full flex-1 flex-col justify-stretch md:mt-0',
            'px-4 pb-6 pt-0 md:min-h-0 md:justify-center md:px-8 md:py-8 lg:px-12',
            'min-h-0',
          )}
        >
          <div
            className={cn(
              'mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/75 p-5 shadow-2xl shadow-black/40 backdrop-blur-md',
              'md:mx-0 md:max-w-lg md:rounded-3xl md:p-8 md:py-9',
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
