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
 *
 * Note: `data-wander-shell-season` and `.wander-textured` are on the SAME element here.
 * The textured-background rules in wander-shell-season.css were written with a descendant
 * combinator (`[data-wander-shell-season='X'] .wander-textured`) — which silently fails
 * when both live on one element. Each season block now also has a same-element
 * selector (`[data-wander-shell-season='X'].wander-textured`) to support this layout.
 * Without both, the body's `bg-background` shows through (cream in light mode → admin
 * pages become unreadable).
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
