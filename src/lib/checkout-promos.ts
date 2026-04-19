import type { SupabaseClient } from '@supabase/supabase-js'

export type CheckoutPromoRow = {
  code: string
  name: string
  discountPaise: number
}

/**
 * Active UnSOLO promo codes to show at checkout (same rules as validatePromoCode).
 * Includes `promo` and `custom` type offers that have a promo_code.
 */
export async function fetchCheckoutPromoList(supabase: SupabaseClient): Promise<CheckoutPromoRow[]> {
  const { data, error } = await supabase
    .from('discount_offers')
    .select('promo_code, name, discount_paise, max_uses, used_count, valid_until, valid_from')
    .eq('is_active', true)
    .in('type', ['promo', 'custom'])
    .not('promo_code', 'is', null)

  if (error) {
    console.error('fetchCheckoutPromoList', error.message)
    return []
  }

  const now = new Date()
  if (!data?.length) return []

  return data
    .filter((d) => {
      if (d.valid_from && new Date(d.valid_from) > now) return false
      if (d.max_uses != null && (d.used_count ?? 0) >= d.max_uses) return false
      if (d.valid_until && new Date(d.valid_until) <= now) return false
      return true
    })
    .map((d) => ({
      code: d.promo_code!.toUpperCase(),
      name: d.name ?? '',
      discountPaise: d.discount_paise,
    }))
}
