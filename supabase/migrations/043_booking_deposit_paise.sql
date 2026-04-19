-- Partial payments for host "token to book" trips: cumulative amount paid toward total_amount_paise.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_paise INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN bookings.deposit_paise IS
  'Cumulative paid toward total_amount_paise (wallet + Razorpay). Equals total when fully paid.';

-- Historical full payments were always for the full trip total.
UPDATE bookings SET deposit_paise = total_amount_paise WHERE status IN ('confirmed', 'completed');
