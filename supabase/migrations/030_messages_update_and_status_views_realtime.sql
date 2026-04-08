-- Authors can update their own text messages (used for edit within 1h; app enforces window)
DROP POLICY IF EXISTS "messages_update_own" ON messages;
CREATE POLICY "messages_update_own" ON messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND message_type = 'text')
  WITH CHECK (auth.uid() = user_id AND message_type = 'text');

-- Live updates for "Seen by" list when viewers open a story
ALTER PUBLICATION supabase_realtime ADD TABLE status_story_views;
