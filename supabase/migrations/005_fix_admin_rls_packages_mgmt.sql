-- ============================================================
-- Fix: Admins can read all custom_date_requests
-- ============================================================

-- Allow admins/staff to SELECT all custom_date_requests
CREATE POLICY "Staff read all requests" ON custom_date_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'social_media_manager', 'field_person', 'chat_responder')
    )
  );

-- Allow admins to SELECT all bookings (existing policy may only allow own)
-- Check if there's a restrictive select policy on bookings
DO $$
BEGIN
  -- Drop the old restrictive select policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND policyname = 'bookings_select_own'
  ) THEN
    DROP POLICY "bookings_select_own" ON bookings;
  END IF;
END $$;

-- Ensure public can read bookings (for package pages showing availability)
-- and staff can read ALL bookings
CREATE POLICY "Anyone can read bookings" ON bookings
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'social_media_manager', 'field_person', 'chat_responder')
    )
  );

-- ============================================================
-- Package Management: allow admins to INSERT/UPDATE/DELETE packages
-- ============================================================

-- Allow admins to insert new packages
CREATE POLICY "Admins insert packages" ON packages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to update packages
CREATE POLICY "Admins update packages" ON packages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to delete packages (soft-delete preferred via is_active)
CREATE POLICY "Admins delete packages" ON packages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to insert new destinations
CREATE POLICY "Admins insert destinations" ON destinations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to update destinations
CREATE POLICY "Admins update destinations" ON destinations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
