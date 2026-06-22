import { getListingDraftForStaff } from '@/actions/listing-drafts'
import { StaffDraftEditor } from '../StaffDraftEditor'
import { HostTripForm } from '@/components/hosting/HostTripForm'
import type { HostTripDraftPayload } from '@/lib/host-trip-create-draft'

export const dynamic = 'force-dynamic'

export default async function EditHostDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getListingDraftForStaff(id)
  if ('error' in res) {
    return <p className="text-sm text-red-400">{res.error}</p>
  }
  const draft = res.draft
  // Trips open in the full host form (staff cloud-draft mode). Service listings use
  // the focused editor for now (full-form service editing is wired next).
  if (draft.kind === 'trip') {
    return <HostTripForm staffDraftId={draft.id} staffDraftPayload={draft.payload as unknown as HostTripDraftPayload} />
  }
  return <StaffDraftEditor draft={draft} />
}
