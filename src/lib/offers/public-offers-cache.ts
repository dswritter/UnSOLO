import { unstable_cache } from 'next/cache'
import { getPublicOfferSections } from '@/actions/offers'
import { OFFER_SECTIONS_TAG } from '@/lib/cache-tags'

/**
 * Cached public offers page sections. The underlying query is cookieless, so it
 * is safe to memoize here. Busted on-demand via `revalidateTag(OFFER_SECTIONS_TAG)`
 * in the offer admin mutations, with a 120s time-based safety net.
 */
export const getCachedPublicOfferSections = unstable_cache(
  () => getPublicOfferSections(),
  ['public-offer-sections'],
  { tags: [OFFER_SECTIONS_TAG], revalidate: 120 },
)
