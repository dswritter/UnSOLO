-- Link bookings to a specific service_listing_item (optional).
-- When a service_listing has multiple items, the booking must reference exactly
-- one item. Legacy / single-item listings still book against the parent listing
-- with item_id NULL, so this column is nullable.

ALTER TABLE bookings
ADD COLUMN service_listing_item_id UUID REFERENCES service_listing_items(id) ON DELETE SET NULL;

CREATE INDEX idx_bookings_service_listing_item ON bookings(service_listing_item_id);
