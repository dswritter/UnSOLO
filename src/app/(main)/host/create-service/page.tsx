import { redirect } from 'next/navigation'
import { checkIsHost, getDestinationsPublic } from '@/actions/hosting'
import { getMyLatestServiceDraft } from '@/actions/listing-drafts'
import { hasPayoutConfigured } from '@/actions/payout'
import type { HostServiceListingPreviewPayload } from '@/lib/host-service-listing-preview-session'
import { getRequestAuth } from '@/lib/auth/request-session'
import { HostServiceListingTabs } from '@/components/hosting/HostServiceListingTabs'
import type { ServiceListingType } from '@/types'
import { GETTING_AROUND_ENABLED } from '@/lib/service-listing-filters'

interface CreateServiceListingPageProps {
  searchParams: Promise<{ type?: string }>
}

const VALID_TYPES: ServiceListingType[] = [
  'stays',
  'activities',
  'rentals',
  ...(GETTING_AROUND_ENABLED ? (['getting_around'] as ServiceListingType[]) : []),
]

export default async function CreateServiceListingPage({
  searchParams,
}: CreateServiceListingPageProps) {
  // Check if user is authenticated and is a host
  const hostStatus = await checkIsHost()
  if (!hostStatus.authenticated) redirect('/login')
  if (!hostStatus.isHost) redirect('/host/verify')

  // Get current user ID
  const { user } = await getRequestAuth()
  if (!user) redirect('/login')

  // Get type from params
  const params = await searchParams
  const type = params.type as ServiceListingType | undefined

  // Require payout details before letting the host build a listing
  if (!(await hasPayoutConfigured(user.id))) {
    const returnTo = `/host/create-service${type ? `?type=${type}` : ''}`
    redirect(`/host/payout?returnTo=${encodeURIComponent(returnTo)}`)
  }

  // Validate type
  if (!type || !VALID_TYPES.includes(type)) {
    redirect('/host')
  }

  // Fetch destinations
  const destinations = await getDestinationsPublic()

  // Resume the host's most recent in-progress draft of this type (also picks up any
  // edits our onboarding team made to it).
  const resume = await getMyLatestServiceDraft(type)

  const typeLabels: Record<ServiceListingType, string> = {
    stays: 'Stay',
    activities: 'Activity',
    rentals: 'Rental',
    getting_around: 'Transport Service',
  }
  const label = typeLabels[type]
  const article = /^[aeiou]/i.test(label) ? 'an' : 'a'

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-black mb-2">
            Create {article} <span className="text-primary">{label}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {type === 'stays' && 'List your property or room for travelers to book'}
            {type === 'activities' && 'Share your expertise by hosting guided tours or experiences'}
            {type === 'rentals' && 'List gear, sports equipment, vehicles, or anything travelers can rent'}
            {type === 'getting_around' && 'Offer transportation and getting around services'}
          </p>
        </div>

        {/* Tabbed form */}
        <HostServiceListingTabs
          mode="create"
          type={type}
          destinations={destinations}
          userId={user.id}
          resumeLocalId={resume?.localId}
          resumePayload={resume ? (resume.payload as unknown as HostServiceListingPreviewPayload) : undefined}
        />
    </div>
  )
}
