-- Clarify inclusive fee for admins (Settings UI description)
UPDATE platform_settings
SET description = 'Platform fee % included in the list price travelers see (not added again at checkout). Host payout = list price minus this percentage.'
WHERE key = 'platform_fee_percent';
