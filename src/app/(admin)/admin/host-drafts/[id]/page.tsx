import { getListingDraftForStaff } from '@/actions/listing-drafts'
import { getDestinationsPublic } from '@/actions/hosting'
import { HostTripForm } from '@/components/hosting/HostTripForm'
import { HostServiceListingTabs } from '@/components/hosting/HostServiceListingTabs'
import type { HostTripDraftPayload } from '@/lib/host-trip-create-draft'
import type { HostServiceListingPreviewPayload } from '@/lib/host-service-listing-preview-session'
import type { ServiceListingType } from '@/types'

export const dynamic = 'force-dynamic'

export default async function EditHostDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getListingDraftForStaff(id)
  if ('error' in res) {
    return <p className="text-sm text-red-400">{res.error}</p>
  }
  const draft = res.draft

  // Both kinds open in the FULL host form (staff cloud-draft mode); saves go to the
  // host's draft and they finish/submit it.
  if (draft.kind === 'trip') {
    return <HostTripForm staffDraftId={draft.id} staffDraftPayload={draft.payload as unknown as HostTripDraftPayload} />
  }

  const payload = draft.payload as unknown as HostServiceListingPreviewPayload
  const destinations = await getDestinationsPublic()
  return (
    <HostServiceListingTabs
      mode="create"
      type={(payload.type as ServiceListingType) || 'stays'}
      destinations={destinations}
      userId={draft.host_id}
      staffDraftId={draft.id}
      staffDraftPayload={payload}
    />
  )
}
