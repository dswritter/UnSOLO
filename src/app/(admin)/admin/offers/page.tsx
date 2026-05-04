export const dynamic = 'force-dynamic'

import { getOfferAdminSnapshot } from '@/actions/offers'
import { OffersAdminClient } from './OffersAdminClient'

export default async function AdminOffersPage() {
  const snapshot = await getOfferAdminSnapshot()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">Offers Page</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control section order, pin manual discount rows, and surface auto-populated host-linked travel bundles.
        </p>
      </div>
      <OffersAdminClient
        sections={snapshot.sections}
        offers={snapshot.offers}
        sectionItems={snapshot.sectionItems}
      />
    </div>
  )
}
