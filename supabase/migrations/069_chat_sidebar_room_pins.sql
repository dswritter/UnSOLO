-- Per-user pinned chats in Tribe sidebar (order: most recently pinned first)

CREATE TABLE IF NOT EXISTS chat_sidebar_room_pins (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_sidebar_room_pins_user ON chat_sidebar_room_pins(user_id);

ALTER TABLE chat_sidebar_room_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_sidebar_room_pins_select_own"
  ON chat_sidebar_room_pins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "chat_sidebar_room_pins_insert_own"
  ON chat_sidebar_room_pins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_sidebar_room_pins_delete_own"
  ON chat_sidebar_room_pins FOR DELETE
  USING (auth.uid() = user_id);
