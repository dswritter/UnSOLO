import { getListingDraftForStaff } from '@/actions/listing-drafts'
import { StaffDraftEditor } from '../StaffDraftEditor'

export const dynamic = 'force-dynamic'

export default async function EditHostDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getListingDraftForStaff(id)
  if ('error' in res) {
    return <p className="text-sm text-red-400">{res.error}</p>
  }
  return <StaffDraftEditor draft={res.draft} />
}
