-- Host-marked "full" per departure start date (subset of departure_dates).
ALTER TABLE packages  ADD COLUMN IF NOT EXISTS departure_dates_closed DATE[] NOT NULL DEFAULT '{}'::date[];

COMMENT ON COLUMN packages.departure_dates_closed IS
  'Departure start dates the host closed to new bookings; travelers see them as full.';

NOTIFY pgrst, 'reload schema';
