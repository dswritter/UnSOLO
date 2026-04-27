import type { ReactNode } from 'react'
import { WanderThemeShell } from '@/components/wander/WanderThemeShell'

/**
 * Host tools use the same Wander forest + gold shell as /wander, /packages, and /admin
 * (see `WanderThemeShell`, `globals.css` `.wander-theme` / `.wander-textured`).
 */
export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <WanderThemeShell className="flex flex-1 min-h-0 flex-col">
      {children}
    </WanderThemeShell>
  )
}
