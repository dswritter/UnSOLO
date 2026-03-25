-- ============================================================
-- 019: Chat Read Receipts + @Mentions
-- ============================================================

-- ── Read Receipts ───────────────────────────────────────────
-- Tracks which user read which message and when
CREATE TABLE IF NOT EXISTS message_read_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_read_receipts_message ON message_read_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_read_receipts_user ON message_read_receipts(user_id, read_at DESC);

ALTER TABLE message_read_receipts ENABLE ROW LEVEL SECURITY;

-- Anyone in the chat room can see read receipts
CREATE POLICY "Members can see read receipts" ON message_read_receipts
  FOR SELECT USING (true);

-- Users can mark messages as read
CREATE POLICY "Users mark own reads" ON message_read_receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable realtime for read receipts
ALTER PUBLICATION supabase_realtime ADD TABLE message_read_receipts;

-- ── Function to mark all messages in a room as read ─────────
CREATE OR REPLACE FUNCTION mark_room_messages_read(p_room_id UUID, p_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO message_read_receipts (message_id, user_id)
  SELECT m.id, p_user_id
  FROM messages m
  WHERE m.room_id = p_room_id
    AND m.user_id != p_user_id
    AND m.message_type != 'system'
    AND NOT EXISTS (
      SELECT 1 FROM message_read_receipts r
      WHERE r.message_id = m.id AND r.user_id = p_user_id
    )
  ON CONFLICT (message_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
