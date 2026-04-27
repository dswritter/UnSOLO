import type { ReactNode } from 'react'
import { WanderThemeShell } from '@/components/wander/WanderThemeShell'

export default function BookingsLayout({ children }: { children: ReactNode }) {
  return <WanderThemeShell>{children}</WanderThemeShell>
}
