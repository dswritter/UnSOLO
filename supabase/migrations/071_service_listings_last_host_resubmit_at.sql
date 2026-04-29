-- Track last time a host used “Resubmit for review” so we can require edits before another resubmit.

ALTER TABLE service_listings
  ADD COLUMN IF NOT EXISTS last_host_resubmit_at TIMESTAMPTZ;

COMMENT ON COLUMN service_listings.last_host_resubmit_at IS
  'Set when the host resubmits a rejected/archived listing. Further resubmits require listing or item changes after this time.';
