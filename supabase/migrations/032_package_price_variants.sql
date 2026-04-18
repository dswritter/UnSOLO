-- Optional tiered per-person pricing (accommodation / facility tiers).
-- price_paise remains the minimum tier for filters, explore, and legacy code paths.

ALTER TABLE packages ADD COLUMN IF NOT EXISTS price_variants jsonb DEFAULT NULL;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_variant_label TEXT DEFAULT NULL;

COMMENT ON COLUMN packages.price_variants IS 'When set: array of {description, price_paise} with 2+ tiers; price_paise column must be min(tiers).';
