-- ============================================================
-- 055: Pro-rata refund split (host + platform share the refund)
-- ============================================================
-- Refund columns on host_earnings so we can trace who funded what
-- when a booking is cancelled.
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS host_refund_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS platform_refund_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS platform_writeoff_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS refund_tier_percent INTEGER;

COMMENT ON COLUMN host_earnings.host_refund_paise IS
  'Host''s share of the refund on cancellation (hostPaise × tier%).';
COMMENT ON COLUMN host_earnings.platform_refund_paise IS
  'Platform''s share of the refund on cancellation (platformPaise × tier%).';
COMMENT ON COLUMN host_earnings.platform_writeoff_paise IS
  'Host refund shortfall the platform absorbed when the host had already been paid an advance.';
COMMENT ON COLUMN host_earnings.refund_tier_percent IS
  'Snapshot of the refund tier % applied at cancellation.';

-- Category-level tier keys: stays / activities / rentals.
-- unsolo + host keys already exist from prior migrations.
INSERT INTO platform_settings (key, value, description) VALUES
  ('refund_tiers_stays', '', 'Refund tier schedule for Stays listings (JSON array). Blank = use code default.'),
  ('refund_tiers_activities', '', 'Refund tier schedule for Activities listings (JSON array). Blank = use code default.'),
  ('refund_tiers_rentals', '', 'Refund tier schedule for Rentals / Getting-around listings (JSON array). Blank = use code default.')
ON CONFLICT (key) DO NOTHING;
