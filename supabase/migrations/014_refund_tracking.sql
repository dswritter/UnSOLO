-- ============================================================
-- 014: Refund tracking columns
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_status TEXT CHECK (refund_status IN ('pending', 'processing', 'completed'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_razorpay_id TEXT;
