-- ============================================================
-- 054: Partial payouts + RazorpayX payout tracking
-- Enables: advance releases once 0% refund window is reached,
--          actual payout via RazorpayX with webhook-driven status.
-- ============================================================

-- Profile-level IDs so we don't recreate contacts / fund accounts on every payout.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS razorpayx_contact_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS razorpayx_fund_account_id TEXT;

-- Host earnings: track partial releases, payout API ids, failure reasons.
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS released_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS razorpay_payout_id TEXT;
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS payout_mode TEXT
  CHECK (payout_mode IN ('UPI', 'IMPS', 'NEFT', 'RTGS'));
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- Widen payout_status to cover more states from RazorpayX webhook.
ALTER TABLE host_earnings DROP CONSTRAINT IF EXISTS host_earnings_payout_status_check;
ALTER TABLE host_earnings ADD CONSTRAINT host_earnings_payout_status_check
  CHECK (payout_status IN ('pending', 'queued', 'processing', 'processed', 'completed', 'failed', 'reversed', 'cancelled'));

COMMENT ON COLUMN host_earnings.released_paise IS
  'Cumulative amount released to the host so far. payable = host_paise − released_paise.';
COMMENT ON COLUMN host_earnings.razorpay_payout_id IS
  'RazorpayX payout id (pout_xxx) from the most recent payout attempt.';

-- Idempotency store for RazorpayX webhook events so we do not double-process.
CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL
);

ALTER TABLE razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
-- No public policies: only service role writes/reads.

-- Admin-side config: the RazorpayX current account number that holds the float we pay hosts from.
INSERT INTO platform_settings (key, value, description) VALUES
  ('razorpayx_account_number', '', 'RazorpayX virtual account number (source of host payouts). Leave blank to fall back to manual "mark paid" flow.'),
  ('razorpayx_default_mode', 'IMPS', 'Default payout rail when host has bank details: IMPS, NEFT, or RTGS. UPI is always used when host has a UPI ID.')
ON CONFLICT (key) DO NOTHING;
