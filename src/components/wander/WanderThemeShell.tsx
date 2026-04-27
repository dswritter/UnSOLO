import type { ReactNode } from 'react'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { cn } from '@/lib/utils'

const wanderSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-wander',
})

/**
 * Forest + gold tokens + texture (see globals.css `.wander-theme`, `.wander-textured`).
 * Used by /wander, /packages/*, /listings/* so detail pages match the discovery surface.
 */
export function WanderThemeShell({
  children,
  className,
}: {
  children: ReactNode
  /** e.g. flex-1 min-h-0 when nested inside a flex main column */
  className?: string
}) {
  return (
    <div
      className={cn(
        `wander-theme wander-textured ${wanderSans.variable} w-full min-h-full min-h-dvh text-foreground [color-scheme:dark]`,
        className,
      )}
    >
      {children}
    </div>
  )
}
