-- ============================================================
-- 048: service_listings can belong to multiple destinations.
-- Keep `destination_id` as the primary (for joins/back-compat);
-- `destination_ids` is the full set (first entry = primary).
-- ============================================================

ALTER TABLE service_listings
  ADD COLUMN IF NOT EXISTS destination_ids UUID[] NOT NULL DEFAULT '{}';

-- Backfill: every existing listing gets its one destination in the array.
UPDATE service_listings
SET destination_ids = ARRAY[destination_id]
WHERE (destination_ids IS NULL OR array_length(destination_ids, 1) IS NULL)
  AND destination_id IS NOT NULL;

-- Fast containment filtering (.contains('destination_ids', [id])).
CREATE INDEX IF NOT EXISTS idx_service_listings_destination_ids
  ON service_listings USING GIN (destination_ids);
