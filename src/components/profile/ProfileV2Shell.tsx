import type { ReactNode } from 'react'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { cn } from '@/lib/utils'

const wanderSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-wander',
})

/**
 * Forest + gold surfaces aligned with the main wander shell (`WanderThemeShell`).
 * Uses shared `.wander-theme` tokens from globals — no separate `.app-profile-v2` overrides.
 */
export function ProfileV2Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        wanderSans.variable,
        'wander-theme wander-textured relative min-h-dvh w-full text-foreground [color-scheme:dark]',
      )}
    >
      {children}
    </div>
  )
}
