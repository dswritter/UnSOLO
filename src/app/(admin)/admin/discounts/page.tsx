import { getDiscountOffers, createDiscountOffer, toggleDiscountOffer, grantUserCredits, editDiscountOffer } from '@/actions/admin'
import { DiscountsClient } from './DiscountsClient'

export default async function AdminDiscountsPage() {
  const offers = await getDiscountOffers()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-black">Discounts & <span className="text-primary">Offers</span></h1>
        <p className="text-sm text-muted-foreground mt-1">Manage promo codes, loyalty rewards, and user credits</p>
      </div>
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
