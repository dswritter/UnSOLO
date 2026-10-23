import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDestinations } from '@/actions/admin'
import { getRequestAuth } from '@/lib/auth/request-session'
import { HostServiceListingTabs } from '@/components/hosting/HostServiceListingTabs'
import { GETTING_AROUND_ENABLED } from '@/lib/service-listing-filters'
import { cn } from '@/lib/utils'
import type { ServiceListingType } from '@/types'
import { ServiceListingForm } from '../ServiceListingForm'

const TYPES: { type: ServiceListingType; label: string }[] = [
  { type: 'stays', label: 'Stay' },
  { type: 'activities', label: 'Activity' },
  { type: 'rentals', label: 'Rental' },
  ...(GETTING_AROUND_ENABLED ? [{ type: 'getting_around' as const, label: 'Transport' }] : []),
]

export default async function CreateServiceListingPage({ searchParams }: {
  searchParams: Promise<{ type?: string; mode?: string }>
}) {
  const [{ type: rawType, mode }, destinations, { user }] = await Promise.all([searchParams, getDestinations(), getRequestAuth()])
  if (!user) redirect('/login?redirectTo=/admin/service-listings/create')

  // Listings without a host keep the original admin form.
  if (mode === 'platform') {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-bold">Create platform listing</h1>
        <Link href="/admin/service-listings/create" className="mb-6 inline-block text-sm text-primary hover:underline">
          ← Create for a host instead
        </Link>
        <ServiceListingForm destinations={destinations} />
      </div>
    )
  }

  const type = TYPES.find(t => t.type === rawType)?.type ?? 'stays'
  return (
    <div>
      <h1 className="text-2xl font-bold">Create a service listing for a host</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Uses the same form hosts use, including multiple items with hourly, daily, weekly or monthly pricing.
      </p>
      <nav aria-label="Listing category" className="my-5 flex flex-wrap items-center gap-2">
        {TYPES.map(t => (
          <Link key={t.type} href={`/admin/service-listings/create?type=${t.type}`}
            aria-current={t.type === type ? 'page' : undefined}
            className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              t.type === type ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>
            {t.label}
          </Link>
        ))}
        <Link href="/admin/service-listings/create?mode=platform" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          Platform listing without a host
        </Link>
      </nav>
      <HostServiceListingTabs key={type} mode="create" staffCreate type={type} destinations={destinations} userId={user.id} />
    </div>
  )
}
