import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BedDouble, Bike, Bus, Compass, Mountain, type LucideIcon } from 'lucide-react'
import { getDestinations } from '@/actions/admin'
import { getRequestAuth } from '@/lib/auth/request-session'
import { HostServiceListingTabs } from '@/components/hosting/HostServiceListingTabs'
import { GETTING_AROUND_ENABLED } from '@/lib/service-listing-filters'
import type { ServiceListingType } from '@/types'
import { ServiceListingForm } from '../ServiceListingForm'

type Category = { label: string; icon: LucideIcon; href: string; type?: ServiceListingType }

const CATEGORIES: Category[] = [
  { label: 'Trip', icon: Mountain, href: '/admin/community-trips/create' },
  { label: 'Stay', icon: BedDouble, href: '/admin/service-listings/create?type=stays', type: 'stays' },
  { label: 'Activity', icon: Compass, href: '/admin/service-listings/create?type=activities', type: 'activities' },
  { label: 'Rental', icon: Bike, href: '/admin/service-listings/create?type=rentals', type: 'rentals' },
  ...(GETTING_AROUND_ENABLED
    ? [{ label: 'Transport', icon: Bus, href: '/admin/service-listings/create?type=getting_around', type: 'getting_around' as const }]
    : []),
]

export default async function CreateServiceListingPage({ searchParams }: {
  searchParams: Promise<{ type?: string; mode?: string }>
}) {
  const { type: rawType, mode } = await searchParams

  if (mode === 'platform') {
    const destinations = await getDestinations()
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Platform listing</h1>
        <ServiceListingForm destinations={destinations} />
      </div>
    )
  }

  const category = CATEGORIES.find(c => c.type && c.type === rawType)
  if (!category?.type) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">What are you listing?</h1>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map(({ label, icon: Icon, href }) => (
            <Link key={label} href={href}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm font-semibold transition-colors hover:border-primary hover:bg-primary/5">
              <Icon aria-hidden className="h-7 w-7 text-primary" />
              {label}
            </Link>
          ))}
        </div>
        <Link href="/admin/service-listings/create?mode=platform" className="mt-6 inline-block text-xs text-muted-foreground hover:text-foreground">
          Platform listing without a host
        </Link>
      </div>
    )
  }

  const [destinations, { user }] = await Promise.all([getDestinations(), getRequestAuth()])
  if (!user) redirect('/login?redirectTo=/admin/service-listings/create')
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-2xl font-bold">New {category.label.toLowerCase()}</h1>
        <Link href="/admin/service-listings/create" className="text-sm text-primary hover:underline">Change</Link>
      </div>
      <HostServiceListingTabs key={category.type} mode="create" staffCreate type={category.type} destinations={destinations} userId={user.id} />
    </div>
  )
}
