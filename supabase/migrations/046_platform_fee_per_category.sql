-- ============================================================
-- 046: Per-category platform commission settings
-- Existing `platform_fee_percent` remains the trips/community-trips fee.
-- Add per-category fees for service listings.
-- ============================================================

UPDATE platform_settings
SET description = 'Trips commission % — included in the list price travelers see (not added again at checkout). Host payout = list price minus this percentage.'
WHERE key = 'platform_fee_percent';

INSERT INTO platform_settings (key, value, description) VALUES
  ('platform_fee_percent_stays', '15', 'Stays commission % — platform share on stay bookings.'),
  ('platform_fee_percent_activities', '15', 'Activities commission % — platform share on activity bookings.'),
  ('platform_fee_percent_rentals', '15', 'Rentals commission % — platform share on rental bookings.'),
  ('platform_fee_percent_getting_around', '15', 'Getting Around commission % — platform share on transport bookings.')
ON CONFLICT (key) DO NOTHING;
