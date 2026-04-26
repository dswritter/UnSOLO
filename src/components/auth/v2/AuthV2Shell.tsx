import type { ReactNode } from 'react'
import Image from 'next/image'
import { AuthV2Stats } from '@/components/auth/v2/AuthV2Stats'
import { AuthV2TopBar } from '@/components/auth/v2/AuthV2TopBar'
import { cn } from '@/lib/utils'

/** Night camp / starfield — Unsplash (allowed in `next.config` remotePatterns). */
const HERO_SRC =
  'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=2000&q=80'

type Mode = 'login' | 'signup'

const HERO: Record<Mode, { kicker: ReactNode; title: ReactNode }> = {
  login: {
    kicker: null,
    title: (
      <span className="text-[1.35rem] font-extrabold leading-snug text-white sm:text-3xl md:text-4xl">
        Welcome back to <span className="text-[#fcba03]">Unsolo</span>.
      </span>
    ),
  },
  signup: {
    kicker: null,
    title: (
      <span className="text-[1.35rem] font-extrabold leading-snug text-white sm:text-3xl md:text-4xl">
        Create your <span className="text-[#fcba03]">Unsolo</span> account.
      </span>
    ),
  },
}

export function AuthV2Shell({ mode, children }: { mode: Mode; children: ReactNode }) {
  const h = HERO[mode]
  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-black text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1920px] flex-col md:flex-row">
        {/* Visual column */}
        <div className="relative min-h-[min(52vh,520px)] w-full flex-shrink-0 md:min-h-dvh md:w-1/2 lg:w-[52%]">
          <Image
            src={HERO_SRC}
            alt=""
            fill
            className="object-cover"
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/20 md:bg-gradient-to-r md:from-black/25 md:via-black/20 md:to-black/45"
            aria-hidden
          />
          <div className="absolute inset-0 flex flex-col p-4 sm:p-5 md:p-8 lg:p-10">
            <AuthV2TopBar />
            <div className="mt-6 min-w-0 sm:mt-8 md:mt-10 lg:mt-12">
              {h.kicker}
              <h1 className="text-balance pr-1">{h.title}</h1>
            </div>
            {/* Mobile: stats in vertical middle, left; desktop: bottom */}
            <div className="mt-4 flex min-h-0 flex-1 flex-col justify-center md:mt-0 md:flex-none md:justify-end">
              <AuthV2Stats className="pt-2 md:mt-auto md:pt-0" />
            </div>
          </div>
        </div>

        {/* Form column */}
        <div
          className={cn(
            'relative z-10 -mt-8 flex w-full flex-1 flex-col justify-stretch md:mt-0',
            'bg-black px-4 pb-10 pt-0 md:min-h-dvh md:justify-center md:px-8 md:py-10 lg:px-12',
          )}
        >
          <div
            className={cn(
              'mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/90 p-5 shadow-2xl shadow-black/50 backdrop-blur-md',
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
