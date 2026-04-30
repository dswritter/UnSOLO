CREATE TABLE IF NOT EXISTS service_listing_item_unavailability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_listing_item_id UUID NOT NULL REFERENCES service_listing_items(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_service_listing_item_unavailability_item_dates
  ON service_listing_item_unavailability(service_listing_item_id, start_date, end_date);

ALTER TABLE service_listing_item_unavailability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public view unavailability of approved listing items"
  ON service_listing_item_unavailability FOR SELECT
  USING (
    service_listing_item_id IN (
      SELECT sli.id
      FROM service_listing_items sli
      JOIN service_listings sl ON sl.id = sli.service_listing_id
      WHERE sli.is_active = true
        AND sl.is_active = true
        AND sl.status = 'approved'
    )
  );

CREATE POLICY "Hosts view own item unavailability"
  ON service_listing_item_unavailability FOR SELECT
  USING (
    service_listing_item_id IN (
      SELECT sli.id
      FROM service_listing_items sli
      JOIN service_listings sl ON sl.id = sli.service_listing_id
      WHERE sl.host_id = auth.uid()
    )
  );

CREATE POLICY "Hosts insert own item unavailability"
  ON service_listing_item_unavailability FOR INSERT
  WITH CHECK (
    service_listing_item_id IN (
      SELECT sli.id
      FROM service_listing_items sli
      JOIN service_listings sl ON sl.id = sli.service_listing_id
      WHERE sl.host_id = auth.uid()
    )
  );

CREATE POLICY "Hosts update own item unavailability"
  ON service_listing_item_unavailability FOR UPDATE
  USING (
    service_listing_item_id IN (
      SELECT sli.id
      FROM service_listing_items sli
      JOIN service_listings sl ON sl.id = sli.service_listing_id
      WHERE sl.host_id = auth.uid()
    )
  )
  WITH CHECK (
    service_listing_item_id IN (
      SELECT sli.id
      FROM service_listing_items sli
      JOIN service_listings sl ON sl.id = sli.service_listing_id
      WHERE sl.host_id = auth.uid()
    )
  );

CREATE POLICY "Hosts delete own item unavailability"
  ON service_listing_item_unavailability FOR DELETE
  USING (
    service_listing_item_id IN (
      SELECT sli.id
      FROM service_listing_items sli
      JOIN service_listings sl ON sl.id = sli.service_listing_id
      WHERE sl.host_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage all item unavailability"
  ON service_listing_item_unavailability FOR ALL
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
