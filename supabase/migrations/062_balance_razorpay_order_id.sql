-- Add a dedicated column for the second Razorpay order (balance payment).
-- The original stripe_session_id column has a UNIQUE constraint and already
-- holds the first-payment order ID; overwriting it would cause a conflict.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS balance_razorpay_order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_balance_razorpay_order_id
  ON bookings (balance_razorpay_order_id)
  WHERE balance_razorpay_order_id IS NOT NULL;
