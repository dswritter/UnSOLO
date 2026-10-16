export const dynamic = 'force-dynamic'

import { getOfferAdminSnapshot } from '@/actions/offers'
import { OffersAdminClient } from './OffersAdminClient'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

export default async function AdminOffersPage() {
  const snapshot = await getOfferAdminSnapshot()

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Offers page" description="Section order, pinned discounts and auto-built travel bundles." className="mb-0" />
      <OffersAdminClient
        sections={snapshot.sections}
        offers={snapshot.offers}
        sectionItems={snapshot.sectionItems}
      />
    </div>
  )
}
