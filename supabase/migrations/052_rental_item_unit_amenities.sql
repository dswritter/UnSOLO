-- ============================================================
-- 052: Per-item pricing unit + amenities for rental listings.
-- Previously stored at master level; moved down to each item so a
-- shop can list vehicles with different units (per_hour bike,
-- per_day car) and different amenity sets (one bike has GPS,
-- another doesn't). Other listing types (stays/activities/
-- getting_around) continue to use master-level unit/amenities.
-- ============================================================

ALTER TABLE service_listing_items
  ADD COLUMN IF NOT EXISTS unit TEXT;

ALTER TABLE service_listing_items
  ADD COLUMN IF NOT EXISTS amenities TEXT[];

-- Backfill existing rental items from their parent listing so
-- already-approved rentals render identically post-migration.
UPDATE service_listing_items sli
SET
  unit = sl.unit,
  amenities = sl.amenities
FROM service_listings sl
WHERE sli.service_listing_id = sl.id
  AND sl.type = 'rentals'
  AND sli.unit IS NULL;
