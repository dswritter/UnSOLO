-- Speeds up the common host-dashboard query pattern:
--   WHERE package_id = $1 AND travel_date = $2 AND status IN (...)
CREATE INDEX IF NOT EXISTS idx_bookings_package_date_status
  ON bookings (package_id, travel_date, status)
  WHERE package_id IS NOT NULL;
