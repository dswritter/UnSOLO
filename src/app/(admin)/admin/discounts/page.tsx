import { getDiscountOffers, createDiscountOffer, toggleDiscountOffer, grantUserCredits, editDiscountOffer } from '@/actions/admin'
import { DiscountsClient } from './DiscountsClient'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

export default async function AdminDiscountsPage() {
  const offers = await getDiscountOffers()

  return (
    <div>
      <AdminPageHeader title="Discounts" description="Promo codes, loyalty rewards and user credits." />
      <DiscountsClient
        offers={offers}
        createOffer={createDiscountOffer}
        toggleOffer={toggleDiscountOffer}
        grantCredits={grantUserCredits}
        editOffer={editDiscountOffer}
      />
    </div>
  )
}
