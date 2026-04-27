import type { ReactNode } from 'react'
import { HostAppShell } from '@/components/host/HostAppShell'

export default function HostLayout({ children }: { children: ReactNode }) {
  return <HostAppShell>{children}</HostAppShell>
}
