import type { SupabaseClient } from '@supabase/supabase-js'

export type PromoScopeListingType = 'all' | 'trips' | 'stays' | 'activities' | 'rentals' | 'getting_around'

export type PromoScopeContext = {
  listingType: Exclude<PromoScopeListingType, 'all'>
  packageId?: string | null
  serviceListingId?: string | null
  hostId?: string | null
}

export type DiscountKind = 'fixed' | 'percent' | 'free_guests'

/** Describes how a discount is computed, independent of any particular booking. */
export type PromoDiscountSpec = {
  kind: DiscountKind
  fixedPaise: number | null
  percent: number | null
  percentCapPaise: number | null
  freeGuestCount: number
}

/** Booking amount a discount spec is applied against. */
export type PromoAmountContext = {
  /** Total before discounts (unit price × quantity, incl. rental days etc.). */
  grossPaise: number
  /** Price of a single unit/guest — used by free_guests. */
  unitPricePaise: number
  /** Number of guests / units in the booking. */
  quantity: number
}

export type CheckoutPromoRow = {
  code: string
  name: string
  /** Computed amount for fixed offers; 0 for percent/free_guests — compute from `spec`. */
  discountPaise: number
  spec: PromoDiscountSpec
}

type ScopedDiscountOfferRow = {
  id: string
  name: string | null
  discount_paise: number | null
  discount_kind: DiscountKind | null
  discount_percent: number | null
  discount_percent_cap_paise: number | null
  free_guest_count: number | null
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

const OFFER_SELECT =
  'id, name, discount_paise, discount_kind, discount_percent, discount_percent_cap_paise, free_guest_count, promo_code, max_uses, used_count, valid_from, valid_until, checkout_visibility, scope_listing_type, scope_host_id, scope_package_id, scope_service_listing_id'

/** Human-readable label for a discount offer (e.g. "₹500 off", "10% off (up to ₹2,000)", "1 guest free"). */
export function formatDiscountLabel(offer: {
  discount_kind?: DiscountKind | null
  discount_paise?: number | null
  discount_percent?: number | null
  discount_percent_cap_paise?: number | null
  free_guest_count?: number | null
}): string {
  const kind = offer.discount_kind ?? 'fixed'
  if (kind === 'percent') {
    const cap = offer.discount_percent_cap_paise
      ? ` (up to ₹${(offer.discount_percent_cap_paise / 100).toLocaleString('en-IN')})`
      : ''
    return `${offer.discount_percent ?? 0}% off${cap}`
  }
  if (kind === 'free_guests') {
    const n = offer.free_guest_count ?? 1
    return `${n} guest${n > 1 ? 's' : ''} free`
  }
  return `₹${((offer.discount_paise ?? 0) / 100).toLocaleString('en-IN')} off`
}

export function specFromRow(offer: ScopedDiscountOfferRow): PromoDiscountSpec {
  return {
    kind: offer.discount_kind ?? 'fixed',
    fixedPaise: offer.discount_paise ?? null,
    percent: offer.discount_percent ?? null,
    percentCapPaise: offer.discount_percent_cap_paise ?? null,
    freeGuestCount: offer.free_guest_count ?? 1,
  }
}

/**
 * Resolve a discount spec to an actual paise amount for a given booking.
 * Always clamped to the gross so a discount never exceeds the bill.
 */
export function computeDiscountPaise(spec: PromoDiscountSpec, amount: PromoAmountContext): number {
  const gross = Math.max(0, Math.round(amount.grossPaise))
  if (gross <= 0) return 0

  if (spec.kind === 'percent') {
    const pct = spec.percent ?? 0
    if (pct <= 0) return 0
    let d = Math.floor((gross * pct) / 100)
    if (spec.percentCapPaise != null) d = Math.min(d, spec.percentCapPaise)
    return Math.min(d, gross)
  }

  if (spec.kind === 'free_guests') {
    // Pay for (quantity − k); always leave at least one paid unit.
    const freeQty = Math.min(spec.freeGuestCount, Math.max(0, amount.quantity - 1))
    return Math.min(freeQty * Math.max(0, amount.unitPricePaise), gross)
  }

  // fixed
  return Math.min(spec.fixedPaise ?? 0, gross)
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
    .select(OFFER_SELECT)
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
    .map((offer) => {
      const spec = specFromRow(offer)
      return {
        code: offer.promo_code!.toUpperCase(),
        name: offer.name ?? '',
        // Fixed offers have a self-contained amount; percent/free_guests
        // depend on the booking, so the client computes them from `spec`.
        discountPaise: spec.kind === 'fixed' ? spec.fixedPaise ?? 0 : 0,
        spec,
      }
    })
}

export async function validateScopedPromoCode(
  supabase: SupabaseClient,
  code: string,
  context: PromoScopeContext,
  amount?: PromoAmountContext,
): Promise<
  { discountPaise: number; spec: PromoDiscountSpec; offerId: string; name: string } | { error: string }
> {
  const trimmed = code.toUpperCase().trim()
  if (!trimmed) return { error: 'Enter a promo code' }

  const { data: offer, error } = await supabase
    .from('discount_offers')
    .select(OFFER_SELECT)
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

  const spec = specFromRow(typedOffer)
  return {
    discountPaise: amount ? computeDiscountPaise(spec, amount) : 0,
    spec,
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
