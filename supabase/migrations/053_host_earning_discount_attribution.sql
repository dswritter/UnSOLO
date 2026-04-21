-- ============================================================
-- 053: Protect host earnings from discounts
-- Host share is always list_price × (1 − platform_fee%).
-- Promo/referral/wallet credits come out of the platform's share only.
-- ============================================================

-- List price × quantity, before any promo/wallet/referral credits.
-- Source of truth for host earning computation.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gross_paise INTEGER;

COMMENT ON COLUMN bookings.gross_paise IS
  'List price × quantity before any promo / wallet / referral credits. Used to compute host earnings.';

-- Backfill from existing fields so historical reports still work.
-- For community-trip bookings total_amount_paise is the list price;
-- for service-listing bookings amount_paise is post-discount, so add back.
UPDATE bookings
SET gross_paise = COALESCE(
  total_amount_paise,
  COALESCE(amount_paise, 0)
    + COALESCE(wallet_deducted_paise, 0)
    + COALESCE(discount_paise, 0),
  0
)
WHERE gross_paise IS NULL;

-- Platform's NET share after discounts (can be < 0 when promo > platform fee).
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS platform_net_paise INTEGER;

-- Itemised discount attribution for reporting / accounting.
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS promo_paise INTEGER DEFAULT 0;
ALTER TABLE host_earnings ADD COLUMN IF NOT EXISTS wallet_paise INTEGER DEFAULT 0;

COMMENT ON COLUMN host_earnings.platform_fee_paise IS
  'Platform GROSS cut = gross_paise × fee%. Does not account for discounts.';
COMMENT ON COLUMN host_earnings.platform_net_paise IS
  'Platform NET cut = platform_fee_paise − promo − wallet credits. Can be negative when discounts exceed the platform share.';
