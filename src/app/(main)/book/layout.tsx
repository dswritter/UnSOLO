import type { ReactNode } from 'react'
import { WanderThemeShell } from '@/components/wander/WanderThemeShell'

export default function BookSuccessLayout({ children }: { children: ReactNode }) {
  return <WanderThemeShell>{children}</WanderThemeShell>
}
