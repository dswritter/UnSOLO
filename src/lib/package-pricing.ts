/** Tiered per-person pricing (accommodation / facilities). */

export type PriceVariant = { description: string; price_paise: number }

const MIN_PRICE_PAISE = 100 // ₹1

/** Parse DB jsonb into validated tiers (2+ rows), or null for single-tier packages. */
export function parsePriceVariants(raw: unknown): PriceVariant[] | null {
  if (raw == null) return null
  if (!Array.isArray(raw)) return null
  const out: PriceVariant[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const description = String((row as { description?: string }).description ?? '').trim()
    const price_paise = Number((row as { price_paise?: unknown }).price_paise)
    if (!description || !Number.isFinite(price_paise) || price_paise < MIN_PRICE_PAISE) continue
    out.push({ description, price_paise: Math.round(price_paise) })
  }
  return out.length >= 2 ? out : null
}

export function hasTieredPricing(raw: unknown): boolean {
  const v = parsePriceVariants(raw)
  return v != null && v.length >= 2
}

/** Effective per-person price and optional tier label for bookings. */
export function resolvePerPersonFromPackage(
  pkg: { price_paise: number; price_variants?: unknown },
  variantIndex: number | null | undefined,
): { perPerson: number; label: string | null } {
  const variants = parsePriceVariants(pkg.price_variants)
  if (!variants) {
    return { perPerson: pkg.price_paise, label: null }
  }
  const idx = variantIndex == null || Number.isNaN(variantIndex) ? 0 : variantIndex
  if (idx < 0 || idx >= variants.length) {
    throw new Error('Invalid price option')
  }
  return { perPerson: variants[idx].price_paise, label: variants[idx].description }
}

/** Build DB payload from form rows (multi-tier). Caller ensures length >= 2 and validates copy. */
export function priceVariantsFromFormRows(
  rows: { pricePaise: number; facilities: string }[],
): PriceVariant[] | null {
  if (rows.length < 2) return null
  const out: PriceVariant[] = []
  for (const r of rows) {
    const description = r.facilities.trim()
    if (!description || !Number.isFinite(r.pricePaise) || r.pricePaise < MIN_PRICE_PAISE) {
      throw new Error('Each price tier needs a facility description and a valid price.')
    }
    out.push({ description, price_paise: Math.round(r.pricePaise) })
  }
  return out
}

export function minPricePaiseFromVariants(variants: PriceVariant[]): number {
  return Math.min(...variants.map((v) => v.price_paise))
}
