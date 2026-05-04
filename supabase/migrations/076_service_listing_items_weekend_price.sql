-- ============================================================
-- 076: Optional weekend rate per service-listing item.
--
-- Stays (and any per-day priced listing) often charge more on
-- Saturday/Sunday nights. We let the host enter a single
-- `weekend_price_paise`; when null the booking flow falls back to
-- `price_paise` for every night. NULL is the safe default so we
-- don't break existing listings.
-- ============================================================

ALTER TABLE service_listing_items
  ADD COLUMN IF NOT EXISTS weekend_price_paise INTEGER NULL CHECK (weekend_price_paise IS NULL OR weekend_price_paise >= 0);

COMMENT ON COLUMN service_listing_items.weekend_price_paise IS
  'Optional Sat/Sun price per unit. NULL means use price_paise for every night.';
