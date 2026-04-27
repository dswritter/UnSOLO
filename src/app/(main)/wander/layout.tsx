import type { ReactNode } from 'react'
import { WanderThemeShell } from '@/components/wander/WanderThemeShell'

/**
 * /wander uses a fixed forest-green brand shell so it does not follow system
 * light/dark. Tokens are scoped in globals.css (`.wander-theme`).
 * Typography: Plus Jakarta Sans (see `WanderThemeShell`).
 */
export default function WanderLayout({ children }: { children: ReactNode }) {
  return <WanderThemeShell>{children}</WanderThemeShell>
}
