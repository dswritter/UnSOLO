-- Link a booking to a discount offer when a promo code was applied (used_count incremented on confirm).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_offer_id UUID REFERENCES discount_offers(id) ON DELETE SET NULL;
