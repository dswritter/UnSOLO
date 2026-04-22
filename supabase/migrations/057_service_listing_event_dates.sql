-- ============================================================
-- 057: Date-specific activities + slots + co-host collaboration
-- ============================================================

-- ── Event schedule on service_listings ──────────────────────
-- Shape (all fields optional — NULL column means "ongoing"):
--   [
--     { "date": "2026-05-10", "slots": null },                      -- all-day event
--     { "date": "2026-05-11", "slots": [
--         { "start": "10:00", "end": "12:00" },
--         { "start": "15:00", "end": "17:00" }
--     ]}
--   ]
-- Discovery hides the listing once every date is in the past, and surfaces
-- it again when the host adds a new future date.
ALTER TABLE service_listings
  ADD COLUMN IF NOT EXISTS event_schedule JSONB;

COMMENT ON COLUMN service_listings.event_schedule IS
  'Activities only. Array of { date: YYYY-MM-DD, slots: [{start,end}]|null }. NULL = ongoing.';

-- Expression index over the max date in the schedule, for discovery filtering.
CREATE INDEX IF NOT EXISTS idx_service_listings_event_schedule
  ON service_listings USING GIN (event_schedule);

-- ── Booking: remember the chosen slot ───────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_slot_start TEXT,
  ADD COLUMN IF NOT EXISTS booking_slot_end TEXT;

COMMENT ON COLUMN bookings.booking_slot_start IS
  'Activities only. HH:MM start of the chosen slot (null when no slots defined).';
COMMENT ON COLUMN bookings.booking_slot_end IS
  'Activities only. HH:MM end of the chosen slot.';

-- ── Co-host collaboration ───────────────────────────────────
-- A listing has exactly one primary host (service_listings.host_id) plus up
-- to 10 accepted co-hosts. Invitations flow: primary host inserts a row with
-- status='pending' → notification fired → invitee updates their own row to
-- 'accepted' or 'declined'. Only 'accepted' rows grant edit access.
CREATE TABLE IF NOT EXISTS service_listing_collaborators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES service_listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  notify_on_booking BOOLEAN NOT NULL DEFAULT false,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_slc_listing ON service_listing_collaborators(listing_id, status);
CREATE INDEX IF NOT EXISTS idx_slc_user ON service_listing_collaborators(user_id, status);

-- Cap at 10 accepted co-hosts per listing.
CREATE OR REPLACE FUNCTION enforce_max_collaborators()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' THEN
    IF (
      SELECT COUNT(*) FROM service_listing_collaborators
      WHERE listing_id = NEW.listing_id AND status = 'accepted' AND id <> NEW.id
    ) >= 10 THEN
      RAISE EXCEPTION 'A listing can have at most 10 accepted co-hosts';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_max_collaborators ON service_listing_collaborators;
CREATE TRIGGER trg_enforce_max_collaborators
  BEFORE INSERT OR UPDATE ON service_listing_collaborators
  FOR EACH ROW EXECUTE FUNCTION enforce_max_collaborators();

ALTER TABLE service_listing_collaborators ENABLE ROW LEVEL SECURITY;

-- Host, the invitee, and any accepted co-host can see the row.
CREATE POLICY "Collab participants can read"
  ON service_listing_collaborators
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.uid() = added_by
    OR EXISTS (
      SELECT 1 FROM service_listings sl
      WHERE sl.id = listing_id AND sl.host_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM service_listing_collaborators c2
      WHERE c2.listing_id = service_listing_collaborators.listing_id
        AND c2.user_id = auth.uid()
        AND c2.status = 'accepted'
    )
  );

-- Only the primary host may invite.
CREATE POLICY "Primary host can invite"
  ON service_listing_collaborators
  FOR INSERT
  WITH CHECK (
    status = 'pending'
    AND auth.uid() = added_by
    AND EXISTS (
      SELECT 1 FROM service_listings sl
      WHERE sl.id = listing_id AND sl.host_id = auth.uid()
    )
  );

-- Invitee can accept/decline (transition pending → accepted|declined).
-- Primary host can toggle notify_on_booking for any collaborator row on their listing.
CREATE POLICY "Invitee responds or host toggles notify"
  ON service_listing_collaborators
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM service_listings sl
      WHERE sl.id = listing_id AND sl.host_id = auth.uid()
    )
  );

-- Primary host or the collaborator themselves can delete (remove / leave).
CREATE POLICY "Host or self can remove collaborator"
  ON service_listing_collaborators
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM service_listings sl
      WHERE sl.id = listing_id AND sl.host_id = auth.uid()
    )
  );

-- ── Extend service_listings RLS so accepted co-hosts can update ─
-- We don't drop the existing host-only update policy; we add a parallel one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Accepted co-hosts can update listing'
      AND tablename = 'service_listings'
  ) THEN
    CREATE POLICY "Accepted co-hosts can update listing"
      ON service_listings
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM service_listing_collaborators c
          WHERE c.listing_id = service_listings.id
            AND c.user_id = auth.uid()
            AND c.status = 'accepted'
        )
      );
  END IF;
END $$;

-- Same for items: accepted co-hosts can manage inventory items.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Accepted co-hosts can manage items'
      AND tablename = 'service_listing_items'
  ) THEN
    CREATE POLICY "Accepted co-hosts can manage items"
      ON service_listing_items
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM service_listing_collaborators c
          WHERE c.listing_id = service_listing_items.service_listing_id
            AND c.user_id = auth.uid()
            AND c.status = 'accepted'
        )
      );
  END IF;
END $$;
