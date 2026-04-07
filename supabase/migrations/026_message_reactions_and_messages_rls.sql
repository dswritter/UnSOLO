-- Message reactions + restrict message visibility to room members

-- ── Reactions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_room ON message_reactions(room_id);

-- Set room_id from parent message (client sends message_id + emoji only)
CREATE OR REPLACE FUNCTION set_message_reaction_room()
RETURNS TRIGGER AS $$
DECLARE
  rid uuid;
BEGIN
  SELECT m.room_id INTO rid FROM messages m WHERE m.id = NEW.message_id;
  IF rid IS NULL THEN
    RAISE EXCEPTION 'message not found';
  END IF;
  NEW.room_id := rid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_message_reactions_set_room ON message_reactions;
CREATE TRIGGER tr_message_reactions_set_room
  BEFORE INSERT ON message_reactions
  FOR EACH ROW EXECUTE FUNCTION set_message_reaction_room();

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_select_room_members" ON message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_room_members crm
      WHERE crm.room_id = message_reactions.room_id AND crm.user_id = auth.uid()
    )
  );

CREATE POLICY "reactions_insert_room_members" ON message_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM chat_room_members crm
      WHERE crm.room_id = message_reactions.room_id AND crm.user_id = auth.uid()
    )
  );

CREATE POLICY "reactions_delete_own" ON message_reactions
  FOR DELETE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;

-- ── Tighten messages: only room members can read ────────────
DROP POLICY IF EXISTS "messages_select_all" ON messages;

CREATE POLICY "messages_select_room_members" ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM chat_room_members crm
    WHERE crm.room_id = messages.room_id AND crm.user_id = auth.uid()
  )
);

-- ── Tighten messages insert: must be room member ─────────────
DROP POLICY IF EXISTS "messages_insert_auth" ON messages;

CREATE POLICY "messages_insert_room_members" ON messages FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM chat_room_members crm
    WHERE crm.room_id = messages.room_id AND crm.user_id = auth.uid()
  )
  AND (
    (message_type IN ('text', 'image') AND user_id = auth.uid())
    OR (message_type = 'system' AND (user_id IS NULL OR user_id = auth.uid()))
  )
);

-- ── Read receipts: only visible for messages in rooms you are in ──
DROP POLICY IF EXISTS "Members can see read receipts" ON message_read_receipts;

CREATE POLICY "read_receipts_select_room_members" ON message_read_receipts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN chat_room_members crm ON crm.room_id = m.room_id AND crm.user_id = auth.uid()
      WHERE m.id = message_read_receipts.message_id
    )
  );

-- Optional: enable Dashboard → Database → Replication for `chat_rooms` so sidebar live-updates when admins edit rooms.
