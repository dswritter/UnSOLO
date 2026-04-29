-- Hosts and accepted co-hosts can read bookings tied to their service listings
-- (dashboard stats, notifications). Travelers and staff retain existing policies.

CREATE POLICY "Host and co-host read service bookings" ON bookings
  FOR SELECT USING (
    booking_type = 'service'
    AND service_listing_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM service_listings sl
        WHERE sl.id = bookings.service_listing_id
          AND sl.host_id = auth.uid()
      )
      OR is_accepted_cohost(service_listing_id, auth.uid())
    )
  );
