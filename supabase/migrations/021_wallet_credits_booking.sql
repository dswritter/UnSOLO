-- Add wallet_deducted_paise to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wallet_deducted_paise INTEGER DEFAULT 0;
