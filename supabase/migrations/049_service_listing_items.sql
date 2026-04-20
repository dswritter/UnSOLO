-- ============================================================
-- 049: Per-listing items for services (rentals, activities, stays,
-- getting_around). A listing can hold N items, each with its own
-- photos/price/quantity/max_per_booking. Existing single-item
-- listings stay as 1-item parents (no rows here = "legacy flat").
-- ============================================================

CREATE TABLE IF NOT EXISTS service_listing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_listing_id UUID NOT NULL REFERENCES service_listings(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,

  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  quantity_available INTEGER NOT NULL DEFAULT 1 CHECK (quantity_available >= 0),
  max_per_booking INTEGER NOT NULL DEFAULT 1 CHECK (max_per_booking >= 1),

  images TEXT[] NOT NULL DEFAULT '{}',

  position_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_listing_items_listing
  ON service_listing_items(service_listing_id, position_order);

ALTER TABLE service_listing_items ENABLE ROW LEVEL SECURITY;

-- Public can view active items whose parent listing is approved + active.
CREATE POLICY "Public view items of approved listings"
  ON service_listing_items FOR SELECT
  USING (
    is_active = true
    AND service_listing_id IN (
      SELECT id FROM service_listings
      WHERE is_active = true AND status = 'approved'
    )
  );

-- Hosts view items under their own listings (any status).
CREATE POLICY "Hosts view own items"
  ON service_listing_items FOR SELECT
  USING (
    service_listing_id IN (
      SELECT id FROM service_listings WHERE host_id = auth.uid()
    )
  );

-- Hosts insert items under their own listings.
CREATE POLICY "Hosts insert own items"
  ON service_listing_items FOR INSERT
  WITH CHECK (
    service_listing_id IN (
      SELECT id FROM service_listings WHERE host_id = auth.uid()
    )
  );

-- Hosts update items under their own listings.
CREATE POLICY "Hosts update own items"
  ON service_listing_items FOR UPDATE
  USING (
    service_listing_id IN (
      SELECT id FROM service_listings WHERE host_id = auth.uid()
    )
  )
  WITH CHECK (
    service_listing_id IN (
      SELECT id FROM service_listings WHERE host_id = auth.uid()
    )
  );

-- Hosts delete items under their own listings.
CREATE POLICY "Hosts delete own items"
  ON service_listing_items FOR DELETE
  USING (
    service_listing_id IN (
      SELECT id FROM service_listings WHERE host_id = auth.uid()
    )
  );

-- Admins manage all items.
CREATE POLICY "Admins manage all items"
  ON service_listing_items FOR ALL
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
