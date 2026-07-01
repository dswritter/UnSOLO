/**
 * Shared `unstable_cache` tag constants. Kept in a leaf module (no imports) so
 * both the cached read wrappers and the mutation actions that bust them can
 * import a tag without creating a circular dependency.
 */
export const SERVICE_LISTINGS_TAG = 'service-listings'
export const OFFER_SECTIONS_TAG = 'offer-sections'
