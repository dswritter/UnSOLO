import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Forest + gold surfaces aligned with the main wander shell (`WanderThemeShell`).
 * Uses shared `.wander-theme` tokens from globals — no separate `.app-profile-v2` overrides.
 */
export function ProfileV2Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        'wander-theme wander-textured relative min-h-dvh w-full text-foreground',
      )}
    >
      {children}
    </div>
  )
}
