-- Add missing payment and service-booking columns to the bookings table.
-- These were referenced in code but never tracked in migrations (likely
-- added manually via the Supabase dashboard at some point).

-- Allow service bookings to have package_id = NULL
ALTER TABLE bookings ALTER COLUMN package_id DROP NOT NULL;

-- Allow service bookings to have travel_date = NULL (service bookings use check_in_date)
ALTER TABLE bookings ALTER COLUMN travel_date DROP NOT NULL;

-- Razorpay payment columns
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_order_id   TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status      TEXT DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));

-- Amount tracking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_paise  INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gross_paise   INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quantity      INTEGER DEFAULT 1;

-- Promo code tracking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_code TEXT;
