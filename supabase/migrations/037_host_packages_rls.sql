-- Hosts submit community trips with the authenticated Supabase client (createHostedTrip / updateHostedTrip).
-- Previously only "Admins insert/update packages" existed, so INSERT failed with RLS.

DROP POLICY IF EXISTS "Hosts insert own community packages" ON packages;
CREATE POLICY "Hosts insert own community packages"
  ON packages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    host_id = auth.uid()
    AND host_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND COALESCE(is_host, false) = true
    )
    AND moderation_status = 'pending'
    AND is_active IS false
    AND COALESCE(is_featured, false) IS false
  );

DROP POLICY IF EXISTS "Hosts update own community packages" ON packages;
CREATE POLICY "Hosts update own community packages"
  ON packages
  FOR UPDATE
  TO authenticated
  USING (
    host_id = auth.uid()
    AND host_id IS NOT NULL
  )
  WITH CHECK (
    host_id = auth.uid()
    AND host_id IS NOT NULL
  );
