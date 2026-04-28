-- Allow traveler self-service cancellations (policy-based) in addition to admin-reviewed flow.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_cancellation_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_cancellation_status_check
  CHECK (cancellation_status IS NULL OR cancellation_status IN ('requested', 'approved', 'denied', 'self_service'));
