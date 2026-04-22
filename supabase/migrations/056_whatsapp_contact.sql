-- 056: Per-listing WhatsApp contact with a platform-wide default.
--
-- Adds a nullable `whatsapp_number` column to `packages` and
-- `service_listings`. NULL means "use the platform default" — admins can
-- flip one setting and update every unset listing. Explicit values are
-- per-listing overrides that admins manage from /admin/whatsapp.

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

ALTER TABLE service_listings
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- Platform default. Blank means "fall back to the string hardcoded in
-- lib/constants (kept for disaster recovery if settings table is wiped)".
INSERT INTO platform_settings (key, value, description) VALUES
  ('support_whatsapp_number', '919760778373', 'Default WhatsApp number shown on trip/service detail pages when a listing has no per-listing override. Digits only, country code first.')
ON CONFLICT (key) DO NOTHING;
