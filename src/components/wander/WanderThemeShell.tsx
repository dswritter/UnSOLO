import type { ReactNode } from 'react'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { getResolvedWanderShellSeason } from '@/lib/wander/wander-season-theme'
import { cn } from '@/lib/utils'

const wanderSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-wander',
})

/**
 * Forest + gold tokens + texture (see `wander-shell-season.css` via `data-wander-shell-season`).
 * Used by /wander, /packages/*, /listings/* so detail pages match the discovery surface.
 */
export async function WanderThemeShell({
  children,
  className,
}: {
  children: ReactNode
  /** e.g. flex-1 min-h-0 when nested inside a flex main column */
  className?: string
}) {
  const season = await getResolvedWanderShellSeason()
  return (
    <div
      data-wander-shell-season={season}
      className={cn(
        `wander-theme wander-textured ${wanderSans.variable} w-full min-h-full min-h-dvh text-foreground [color-scheme:dark]`,
        className,
      )}
    >
      {children}
    </div>
  )
}
