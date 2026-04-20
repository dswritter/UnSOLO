-- 051_first_approved_at.sql
--
-- Track when each trip/listing was *first* approved by an admin. This column
-- is set once (on first approval) and never cleared, so when a host edits an
-- approved listing and the moderation status bounces back to 'pending', we can
-- still tell "this content was vetted before" vs. "this is brand-new, never
-- reviewed". Public pages and booking actions use that distinction to keep
-- previously-approved listings bookable during re-review instead of hiding
-- them the moment a typo fix lands.

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS first_approved_at timestamptz;

ALTER TABLE service_listings
  ADD COLUMN IF NOT EXISTS first_approved_at timestamptz;

-- Backfill: any listing currently in the approved state was clearly approved
-- at some point — stamp the column so existing approved content continues to
-- behave identically after the migration.
-- packages has no updated_at column — fall back to created_at.
UPDATE packages
   SET first_approved_at = COALESCE(created_at, now())
 WHERE moderation_status = 'approved'
   AND first_approved_at IS NULL;

UPDATE service_listings
   SET first_approved_at = COALESCE(updated_at, created_at, now())
 WHERE status = 'approved'
   AND first_approved_at IS NULL;

-- Index the common "pending re-review" query: public discovery unions
-- approved listings with pending-but-previously-approved ones.
CREATE INDEX IF NOT EXISTS idx_packages_first_approved_at
  ON packages(first_approved_at)
  WHERE first_approved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_listings_first_approved_at
  ON service_listings(first_approved_at)
  WHERE first_approved_at IS NOT NULL;
