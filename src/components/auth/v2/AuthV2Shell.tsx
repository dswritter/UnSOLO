import { Suspense, type ReactNode } from 'react'
import { AuthNightScene } from '@/components/auth/v2/AuthNightScene'
import { ColorModeToggle } from '@/components/layout/ColorModeToggle'
import { AuthMetrics, AuthMetricsSkeleton } from '@/components/auth/v2/AuthMetrics'
import { AuthV2TopBar } from '@/components/auth/v2/AuthV2TopBar'
import { cn } from '@/lib/utils'

type Mode = 'login' | 'signup'

const HERO: Record<Mode, { eyebrow: string; title: ReactNode }> = {
  login: {
    eyebrow: 'Good to see you again',
    title: <>Welcome back to <span className="brand-gold">Unsolo</span></>,
  },
  signup: {
    eyebrow: 'Your next trip starts here',
    title: <>Create your <span className="brand-gold">Unsolo</span> account</>,
  },
}

export function AuthV2Shell({ mode, children }: { mode: Mode; children: ReactNode }) {
  const h = HERO[mode]
  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden text-foreground">
      <AuthNightScene />
      <ColorModeToggle className="absolute right-4 top-3.5 z-20 h-9 w-9 bg-card/70 backdrop-blur-md sm:right-6 sm:top-5" />
      <div className="absolute inset-0 hidden bg-gradient-to-r from-transparent via-transparent to-background/50 lg:block" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1920px] flex-col lg:flex-row">
        {/* Mobile: sized so the campfire stays visible above the card. */}
        <div className="flex h-[19rem] w-full min-w-0 flex-none flex-col px-4 pt-5 sm:px-5 lg:h-auto lg:min-h-dvh lg:w-[48%] lg:max-w-[52%] lg:flex-1 lg:p-8 lg:py-10 lg:pr-4">
          <AuthV2TopBar />
          <div className="mt-4 min-w-0 lg:mt-14">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/55 lg:text-xs">{h.eyebrow}</p>
            <h1 className="mt-1 text-balance text-[1.7rem] font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-3xl md:text-4xl lg:text-5xl">
              {h.title}
            </h1>
          </div>
          <div className="mt-3 w-full lg:mt-auto lg:max-w-xl">
            <Suspense fallback={<AuthMetricsSkeleton />}>
              <AuthMetrics />
            </Suspense>
          </div>
        </div>

        <div className={cn(
          'flex w-full flex-1 flex-col px-4 pb-6 pt-0',
          'lg:min-h-dvh lg:w-[52%] lg:min-w-0 lg:justify-center lg:px-10 lg:py-8 xl:px-14',
        )}>
          <div className={cn(
            'mx-auto w-full max-w-md rounded-2xl border border-foreground/10 bg-card/90 p-4 shadow-2xl shadow-black/20 backdrop-blur-md dark:shadow-black/50',
            'lg:mx-0 lg:ml-auto lg:max-w-lg lg:rounded-3xl lg:p-8 lg:py-9',
          )}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
