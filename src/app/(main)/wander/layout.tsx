import type { ReactNode } from 'react'

/**
 * /wander uses a fixed forest-green brand shell so it does not follow system
 * light/dark. Tokens are scoped in globals.css (`.wander-theme`).
 */
export default function WanderLayout({ children }: { children: ReactNode }) {
  return (
    <div className="wander-theme w-full min-h-full bg-background text-foreground [color-scheme:dark]">
      {children}
    </div>
  )
}
