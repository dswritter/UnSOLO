-- General chat rooms: allow admin + social_media_manager to INSERT/UPDATE with user JWT
-- (fixes updates when SUPABASE_SERVICE_ROLE_KEY is missing or misconfigured on the server)
-- Admins only for DELETE on general rooms.

ALTER TABLE message_reactions REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "chat_rooms_insert_auth" ON chat_rooms;

CREATE POLICY "chat_rooms_insert_authenticated" ON chat_rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      (type IS DISTINCT FROM 'general')
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'social_media_manager')
      )
    )
  );

CREATE POLICY "chat_rooms_update_general_staff" ON chat_rooms
  FOR UPDATE TO authenticated
  USING (
    type = 'general'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'social_media_manager')
    )
  )
  WITH CHECK (
    type = 'general'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'social_media_manager')
    )
  );

CREATE POLICY "chat_rooms_delete_general_admin" ON chat_rooms
  FOR DELETE TO authenticated
  USING (
    type = 'general'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
