-- Repair: host trip insert uses departure_time, return_time, trip_days, etc.
-- If you see "Could not find the 'departure_time' column of 'packages' in the schema cache",
-- this migration (or 031) was not applied on the remote database. Idempotent if 031 already ran.

ALTER TABLE packages ADD COLUMN IF NOT EXISTS trip_days INTEGER;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS trip_nights INTEGER;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS exclude_first_day_travel BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS return_dates DATE[];
ALTER TABLE packages ADD COLUMN IF NOT EXISTS departure_time TEXT DEFAULT 'morning';
ALTER TABLE packages ADD COLUMN IF NOT EXISTS return_time TEXT DEFAULT 'morning';

UPDATE packages SET trip_days = duration_days WHERE trip_days IS NULL;
UPDATE packages SET trip_nights = GREATEST(duration_days - 1, 0) WHERE trip_nights IS NULL;

UPDATE packages p
SET return_dates = sub.arr
FROM (
  SELECT
    id,
    ARRAY(
      SELECT (u + (p_inner.duration_days - 1))::date
      FROM unnest(p_inner.departure_dates) AS u
    ) AS arr
  FROM packages p_inner
  WHERE p_inner.departure_dates IS NOT NULL
    AND cardinality(p_inner.departure_dates) > 0
) sub
WHERE p.id = sub.id
  AND (p.return_dates IS NULL OR cardinality(p.return_dates) = 0);

UPDATE packages SET departure_time = 'morning' WHERE departure_time IS NULL;
UPDATE packages SET return_time = 'morning' WHERE return_time IS NULL;

ALTER TABLE packages ALTER COLUMN trip_days SET NOT NULL;
ALTER TABLE packages ALTER COLUMN trip_nights SET NOT NULL;

ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_departure_time_check;
ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_return_time_check;
ALTER TABLE packages ADD CONSTRAINT packages_departure_time_check
  CHECK (departure_time IN ('morning', 'evening'));
ALTER TABLE packages ADD CONSTRAINT packages_return_time_check
  CHECK (return_time IN ('morning', 'evening'));

NOTIFY pgrst, 'reload schema';
