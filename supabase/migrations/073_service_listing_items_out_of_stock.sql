ALTER TABLE service_listing_items
  ADD COLUMN IF NOT EXISTS is_out_of_stock BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_service_listing_items_stock
  ON service_listing_items(service_listing_id, is_active, is_out_of_stock, position_order);
