-- Per-departure booking cutoffs and a trip-level instant pause.
--
-- booking_cutoff_dates jsonb  — map of departure date key (YYYY-MM-DD) →
--   ISO date string of the last day bookings are accepted for that slot.
--   e.g. '{"2026-07-10": "2026-07-05"}' means bookings for the Jul 10
--   departure close at end-of-day Jul 5. Keys that are absent have no cutoff.
--
-- bookings_paused boolean  — when true the trip is still visible on Explore /
--   the landing but the booking button is replaced with "Not accepting bookings".
--   Unlike is_active=false this does NOT hide the listing.

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS booking_cutoff_dates jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bookings_paused       boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.packages.booking_cutoff_dates IS
  'Map of departure date key → last ISO date to accept bookings for that slot. Absent keys = no cutoff.';
COMMENT ON COLUMN public.packages.bookings_paused IS
  'When true, no new bookings are accepted but the listing stays visible.';
