import { Suspense } from 'react'
import { WanderThemeShell } from '@/components/wander/WanderThemeShell'
import { AdminShell } from './AdminShell'
import { AdminRouteSkeleton } from './AdminRouteSkeleton'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <WanderThemeShell>
      <Suspense fallback={<AdminRouteSkeleton />}>
        <AdminShell>{children}</AdminShell>
      </Suspense>
    </WanderThemeShell>
  )
}
