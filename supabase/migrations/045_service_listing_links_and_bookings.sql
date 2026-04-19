-- Link service listings to packages (for cross-sell/related services)
CREATE TABLE service_listing_package_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  service_listing_id UUID NOT NULL REFERENCES service_listings(id) ON DELETE CASCADE,

  link_type TEXT NOT NULL CHECK (link_type IN ('curated', 'auto_geo')),
  -- 'curated': admin/host manually linked; shows "Recommended for this trip"
  -- 'auto_geo': auto-generated from geo proximity; shows "Near this trip"

  position_order INTEGER, -- for sorting manual curation

  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(package_id, service_listing_id)
);

CREATE INDEX idx_service_links_package ON service_listing_package_links(package_id, link_type);
CREATE INDEX idx_service_links_service ON service_listing_package_links(service_listing_id);

-- Row-Level Security for links (public can view, admins can manage)
ALTER TABLE service_listing_package_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view service listing links"
  ON service_listing_package_links FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage service listing links"
  ON service_listing_package_links FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'admin'
  ));

---

-- Extend bookings table to support service listing bookings
ALTER TABLE bookings
ADD COLUMN service_listing_id UUID REFERENCES service_listings(id) ON DELETE RESTRICT,
ADD COLUMN booking_type TEXT DEFAULT 'trip' CHECK (booking_type IN ('trip', 'service')),
ADD COLUMN check_in_date DATE,
ADD COLUMN check_out_date DATE;

-- Update booking status constraint to allow additional statuses
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'pending_approval'));

-- Enforce mutual exclusivity: either package_id or service_listing_id (not both)
ALTER TABLE bookings ADD CONSTRAINT booking_type_consistency CHECK (
  (booking_type = 'trip' AND package_id IS NOT NULL AND service_listing_id IS NULL) OR
  (booking_type = 'service' AND service_listing_id IS NOT NULL AND package_id IS NULL)
);

-- Index for service listing bookings
CREATE INDEX idx_bookings_service_listing ON bookings(service_listing_id, status);
CREATE INDEX idx_bookings_type ON bookings(booking_type);

-- Trigger to validate travel_date for service listings
-- For stays: use check_in_date; for activities/rentals: use travel_date
-- (Application logic should handle this)
