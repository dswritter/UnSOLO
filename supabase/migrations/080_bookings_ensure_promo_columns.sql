-- ============================================================
-- Catch-up migration for production databases that missed earlier migrations.
-- All ADD COLUMN IF NOT EXISTS — safe to re-run.
--
-- Symptoms this fixes:
--   "Failed to create booking: Could not find the 'promo_offer_id'
--    column of 'bookings' in the schema cache"
-- ============================================================

-- promo_offer_id (originally migration 039)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS promo_offer_id UUID REFERENCES discount_offers(id) ON DELETE SET NULL;

-- promo_code (originally migration 061)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS promo_code TEXT;

-- payment columns from migration 061 (re-asserted in case any are missing)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- only add the CHECK constraint if it isn't already defined — avoid the
-- "constraint already exists" error on databases that ran 061 cleanly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND conname = 'bookings_payment_status_check'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_payment_status_check
      CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));
  END IF;
END $$;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_paise          INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gross_paise           INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_paise        INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wallet_deducted_paise INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quantity              INTEGER DEFAULT 1;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_order_id     TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_payment_id   TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_slot_start    TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_slot_end      TEXT;

-- service-listing references
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_listing_id      UUID REFERENCES service_listings(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_listing_item_id UUID REFERENCES service_listing_items(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_date           DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_out_date          DATE;

-- Ask PostgREST to refresh its schema cache after column changes
NOTIFY pgrst, 'reload schema';
