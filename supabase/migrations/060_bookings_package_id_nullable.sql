-- Migration 045 added a booking_type_consistency CHECK that allows
-- package_id = NULL for service bookings, but the original bookings table
-- from migration 001 declared package_id NOT NULL. This mismatch causes
-- all service listing bookings to fail with a NOT NULL constraint violation.
-- Drop the NOT NULL constraint so service bookings can be created.
ALTER TABLE bookings ALTER COLUMN package_id DROP NOT NULL;
