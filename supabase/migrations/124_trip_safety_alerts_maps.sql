-- 124: trip safety (SOS, live location), saved-trip alerts, review requests, map coordinates.

-- Emergency contact (private: only you and the server see it).
ALTER TABLE profile_private ADD COLUMN IF NOT EXISTS emergency_name TEXT;
ALTER TABLE profile_private ADD COLUMN IF NOT EXISTS emergency_phone TEXT;

-- Destination coordinates for the Explore map (filled in from OpenStreetMap by the server).
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

-- ── SOS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sos_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
  package_id  UUID REFERENCES packages(id) ON DELETE SET NULL,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  accuracy_m  REAL,
  note        TEXT CHECK (char_length(note) <= 500),
  notified    JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS sos_alerts_open_idx ON sos_alerts (status, created_at DESC);
ALTER TABLE sos_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sos_alerts_read ON sos_alerts;
CREATE POLICY sos_alerts_read ON sos_alerts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_any_staff());
-- Writes go through the API (service role).

-- ── Live location in a trip group ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_locations (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  room_id    UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  accuracy_m REAL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, room_id)
);
CREATE INDEX IF NOT EXISTS live_locations_room_idx ON live_locations (room_id, expires_at);
ALTER TABLE live_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS live_locations_read ON live_locations;
CREATE POLICY live_locations_read ON live_locations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_room_members m WHERE m.room_id = live_locations.room_id AND m.user_id = auth.uid()));
DROP POLICY IF EXISTS live_locations_own ON live_locations;
CREATE POLICY live_locations_own ON live_locations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Saved trips (server copy, for price-drop and seats-left alerts) ─────
CREATE TABLE IF NOT EXISTS saved_trips (
  user_id                UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_id             UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  price_paise            INTEGER,
  alerted_price_paise    INTEGER,
  alerted_low_seats_date DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, package_id)
);
CREATE INDEX IF NOT EXISTS saved_trips_package_idx ON saved_trips (package_id);
ALTER TABLE saved_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_trips_own ON saved_trips;
CREATE POLICY saved_trips_own ON saved_trips FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── "How was your trip?" (one ask per booking) ─────────────────────────
CREATE TABLE IF NOT EXISTS review_requests (
  booking_id UUID PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
-- Server only (no policies).
