-- Repair: host/admin inserts may set price_variants on packages.
-- Error: "Could not find the 'price_variants' column of 'packages' in the schema cache"
-- means migration 032 was not applied. Idempotent if 032 already ran.

ALTER TABLE packages ADD COLUMN IF NOT EXISTS price_variants jsonb DEFAULT NULL;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_variant_label TEXT DEFAULT NULL;

COMMENT ON COLUMN packages.price_variants IS 'When set: array of {description, price_paise} with 2+ tiers; price_paise column must be min(tiers).';

NOTIFY pgrst, 'reload schema';
