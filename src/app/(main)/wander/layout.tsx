import type { ReactNode } from 'react'
import { Plus_Jakarta_Sans } from 'next/font/google'

const wanderSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-wander',
})

/**
 * /wander uses a fixed forest-green brand shell so it does not follow system
 * light/dark. Tokens are scoped in globals.css (`.wander-theme`).
 * Typography: Plus Jakarta Sans (clean geometric sans, similar to mockup).
 */
export default function WanderLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`wander-theme ${wanderSans.variable} w-full min-h-full bg-background text-foreground [color-scheme:dark]`}
    >
      {children}
    </div>
  )
}
