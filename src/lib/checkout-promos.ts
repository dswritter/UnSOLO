import type { SupabaseClient } from '@supabase/supabase-js'

export type PromoScopeListingType = 'all' | 'trips' | 'stays' | 'activities' | 'rentals' | 'getting_around'

export type PromoScopeContext = {
  listingType: Exclude<PromoScopeListingType, 'all'>
  packageId?: string | null
  serviceListingId?: string | null
  hostId?: string | null
}

export type CheckoutPromoRow = {
  code: string
  name: string
  discountPaise: number
}

type ScopedDiscountOfferRow = {
  id: string
  name: string | null
  discount_paise: number
  promo_code: string | null
  max_uses: number | null
  used_count: number | null
  valid_from: string | null
  valid_until: string | null
  checkout_visibility: 'auto' | 'manual_only' | null
  scope_listing_type: PromoScopeListingType | null
  scope_host_id: string | null
  scope_package_id: string | null
  scope_service_listing_id: string | null
}

function isOfferCurrentlyValid(offer: ScopedDiscountOfferRow) {
  const now = new Date()
  if (offer.valid_from && new Date(offer.valid_from) > now) return false
  if (offer.max_uses != null && (offer.used_count ?? 0) >= offer.max_uses) return false
  if (offer.valid_until && new Date(offer.valid_until) < now) return false
  return true
}

function doesOfferMatchScope(offer: ScopedDiscountOfferRow, context: PromoScopeContext) {
  const listingScope = offer.scope_listing_type ?? 'all'
  if (listingScope !== 'all' && listingScope !== context.listingType) return false
  if (offer.scope_host_id && offer.scope_host_id !== context.hostId) return false
  if (offer.scope_package_id && offer.scope_package_id !== context.packageId) return false
  if (offer.scope_service_listing_id && offer.scope_service_listing_id !== context.serviceListingId) return false
  return true
}

async function fetchScopedDiscountOfferRows(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('discount_offers')
    .select(
      'id, name, discount_paise, promo_code, max_uses, used_count, valid_from, valid_until, checkout_visibility, scope_listing_type, scope_host_id, scope_package_id, scope_service_listing_id',
    )
    .eq('is_active', true)
    .in('type', ['promo', 'custom'])
    .not('promo_code', 'is', null)

  if (error) {
    console.error('fetchScopedDiscountOfferRows', error.message)
    return []
  }

  return (data || []) as ScopedDiscountOfferRow[]
}

/**
 * Active promo codes to show at checkout. Manual-only codes are intentionally excluded.
 */
export async function fetchCheckoutPromoList(
  supabase: SupabaseClient,
  context: PromoScopeContext,
): Promise<CheckoutPromoRow[]> {
  const rows = await fetchScopedDiscountOfferRows(supabase)

  return rows
    .filter((offer) => offer.checkout_visibility !== 'manual_only')
    .filter(isOfferCurrentlyValid)
    .filter((offer) => doesOfferMatchScope(offer, context))
    .map((offer) => ({
      code: offer.promo_code!.toUpperCase(),
      name: offer.name ?? '',
      discountPaise: offer.discount_paise,
    }))
}

export async function validateScopedPromoCode(
  supabase: SupabaseClient,
  code: string,
  context: PromoScopeContext,
): Promise<{ discountPaise: number; offerId: string; name: string } | { error: string }> {
  const trimmed = code.toUpperCase().trim()
  if (!trimmed) return { error: 'Enter a promo code' }

  const { data: offer, error } = await supabase
    .from('discount_offers')
    .select(
      'id, name, discount_paise, promo_code, max_uses, used_count, valid_from, valid_until, checkout_visibility, scope_listing_type, scope_host_id, scope_package_id, scope_service_listing_id',
    )
    .eq('promo_code', trimmed)
    .eq('is_active', true)
    .single()

  if (error || !offer) return { error: 'Invalid promo code' }

  const typedOffer = offer as ScopedDiscountOfferRow
  if (!isOfferCurrentlyValid(typedOffer)) {
    return { error: 'This promo code has expired' }
  }
  if (!doesOfferMatchScope(typedOffer, context)) {
    return { error: 'This promo code is not valid for this booking' }
  }

  return {
    discountPaise: typedOffer.discount_paise,
    offerId: typedOffer.id,
    name: typedOffer.name ?? '',
  }
}

export async function incrementPromoOfferUsed(supabase: SupabaseClient, offerId: string) {
  const { data: row } = await supabase
    .from('discount_offers')
    .select('used_count')
    .eq('id', offerId)
    .single()
  if (!row) return
  await supabase
    .from('discount_offers')
    .update({ used_count: (row.used_count ?? 0) + 1 })
    .eq('id', offerId)
}
