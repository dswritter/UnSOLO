-- ============================================================
-- 047: Allow `per_month` in service_listings.unit (rentals, mostly)
-- ============================================================

ALTER TABLE service_listings DROP CONSTRAINT IF EXISTS service_listings_unit_check;

ALTER TABLE service_listings
  ADD CONSTRAINT service_listings_unit_check
  CHECK (unit IN ('per_night', 'per_person', 'per_day', 'per_hour', 'per_week', 'per_month'));
