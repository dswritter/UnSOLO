import type { ReactNode } from 'react'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { cn } from '@/lib/utils'

const wanderSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-wander',
})

/** Alpine shell surface (font + backdrop). Colours come from the global day/dusk tokens. */
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
      data-wander-shell=""
      className={cn(
        `wander-theme wander-textured ${wanderSans.variable} w-full min-h-full min-h-dvh text-foreground`,
        className,
      )}
    >
      {children}
    </div>
  )
}
