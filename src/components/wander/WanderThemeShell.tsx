import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

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
        'wander-theme wander-textured w-full min-h-full min-h-dvh text-foreground',
        className,
      )}
    >
      {children}
    </div>
  )
}
