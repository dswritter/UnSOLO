-- Hosts can read bookings for trips they host (dashboard stats), same pattern as service listings.

CREATE POLICY "Host read trip package bookings" ON bookings
  FOR SELECT USING (
    booking_type = 'trip'
    AND package_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM packages p
      WHERE p.id = bookings.package_id
        AND p.host_id = auth.uid()
    )
  );
