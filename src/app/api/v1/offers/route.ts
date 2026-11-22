import { getApiContext } from '@/lib/api/context'
import { ok, route } from '@/lib/api/http'
import { formatDiscountLabel } from '@/lib/checkout-promos'
import { getCachedPublicOfferSections } from '@/lib/offers/public-offers-cache'

/**
 * GET /offers: the live deals sections (same as unsolo.in/offers): promo offers with a ready
 * label ("15% off (up to ₹2,000)") and combos pairing two listings. Public.
 */
export const GET = route(async (req: Request) => {
  await getApiContext(req)
  const sections = await getCachedPublicOfferSections()
  return ok({
    sections: sections.map((s) => ({
      id: String(s.id),
      title: s.title,
      subtitle: s.subtitle ?? null,
      badge: s.hero_badge ?? null,
      offers: s.offers.map((o) => ({
        id: String(o.id), name: o.name, label: formatDiscountLabel(o), type: o.type ?? null,
        promoCode: o.promo_code ?? null, validUntil: o.valid_until ?? null,
      })),
      combos: s.combos.map((c) => ({
        id: String(c.id), title: c.title, subtitle: c.subtitle ?? null,
        primary: { label: c.primaryLabel, path: c.primaryHref }, secondary: { label: c.secondaryLabel, path: c.secondaryHref },
      })),
    })),
  }, { cache: 'public', req })
})
