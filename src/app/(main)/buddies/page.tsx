export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import { WanderThemeShell } from '@/components/wander/WanderThemeShell'
import { BuddiesList } from '@/components/trips/BuddiesList'

export const metadata: Metadata = { title: 'Travel buddies · UnSOLO' }

export default async function BuddiesPage() {
  const { user } = await getRequestAuth()
  if (!user) redirect('/login?redirectTo=%2Fbuddies')
  return (
    <WanderThemeShell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl text-foreground">Travel buddies</h1>
        <p className="mt-1 text-muted-foreground">People on your departures, planning the same place around your dates, or saving the same trips.</p>
        <div className="mt-6"><BuddiesList /></div>
      </div>
    </WanderThemeShell>
  )
}
