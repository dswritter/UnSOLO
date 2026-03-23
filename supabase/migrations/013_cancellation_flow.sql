-- ============================================================
-- 013: Booking cancellation requests + date change before confirm
-- ============================================================

-- Add cancellation fields to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_status TEXT CHECK (cancellation_status IN ('requested', 'approved', 'denied'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_amount_paise INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_note TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_cancellation_note TEXT;

-- Allow date change on pending bookings (no schema change needed, just business logic)
-- The booking.travel_date can be updated when status = 'pending'
