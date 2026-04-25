-- Add missing payment and service-booking columns to the bookings table.
-- These were referenced in code but never tracked in migrations.

-- Allow service bookings to have package_id = NULL
-- (migration 045 added a CHECK that requires package_id IS NULL for service
-- bookings, but the original schema had package_id NOT NULL — mutually exclusive)
ALTER TABLE bookings ALTER COLUMN package_id DROP NOT NULL;

-- Allow service bookings to have travel_date = NULL (they use check_in_date instead)
ALTER TABLE bookings ALTER COLUMN travel_date DROP NOT NULL;

-- Service listing references
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_listing_id      UUID REFERENCES service_listings(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_listing_item_id UUID REFERENCES service_listing_items(id);

-- Date fields for service bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_date  DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_out_date DATE;

-- Razorpay payment columns
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_order_id   TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status      TEXT DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));

-- Amount tracking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_paise          INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gross_paise           INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_paise        INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wallet_deducted_paise INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quantity              INTEGER DEFAULT 1;

-- Activity slot tracking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_slot_start TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_slot_end   TEXT;

-- Promo code tracking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_code TEXT;
