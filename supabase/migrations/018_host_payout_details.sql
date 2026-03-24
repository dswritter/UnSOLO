-- ============================================================
-- 018: Host Payout Details
-- ============================================================

-- Add UPI ID to profiles for host payouts
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS upi_id TEXT;

-- Add bank details as optional alternative
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_account_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;

-- Add payout preference
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_method TEXT DEFAULT 'upi' CHECK (payout_method IN ('upi', 'bank'));
