import type { ReactNode } from 'react'
import { Plus_Jakarta_Sans } from 'next/font/google'

const wanderSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-wander',
})

/**
 * Forest + gold tokens + texture (see globals.css `.wander-theme`, `.wander-textured`).
 * Used by /wander, /packages/*, /listings/* so detail pages match the discovery surface.
 */
export function WanderThemeShell({ children }: { children: ReactNode }) {
  return (
    <div
      className={`wander-theme wander-textured ${wanderSans.variable} w-full min-h-full min-h-dvh text-foreground [color-scheme:dark]`}
    >
      {children}
    </div>
  )
}
