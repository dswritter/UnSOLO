-- Traveler can hide service bookings from /bookings after abandoning payment or to clear cancelled rows.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN bookings.user_dismissed_at IS
  'Set when the traveler dismisses a service booking from My Trips; row stays for admin/audit.';

CREATE INDEX IF NOT EXISTS idx_bookings_user_dismissed
  ON bookings (user_id)
  WHERE user_dismissed_at IS NOT NULL;
