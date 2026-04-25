-- Tribe: pinned message per room (admin staff), chat polls with votes

-- ── chat_rooms: optional pinned message (community + trip rooms) ───────────
ALTER TABLE chat_rooms
  ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_rooms_pinned_message ON chat_rooms(pinned_message_id)
  WHERE pinned_message_id IS NOT NULL;

-- ── messages: allow poll type ─────────────────────────────────────────────
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'system', 'poll'));

-- Last message per room (for sidebar ordering / preview) — single round-trip
CREATE OR REPLACE FUNCTION public.last_message_preview_for_rooms(p_room_ids UUID[])
RETURNS TABLE (
  room_id UUID,
  last_content TEXT,
  last_at TIMESTAMPTZ,
  last_message_type TEXT,
  last_user_id UUID
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (m.room_id)
    m.room_id,
    m.content,
    m.created_at,
    m.message_type::text,
    m.user_id
  FROM messages m
  WHERE m.room_id = ANY(p_room_ids)
  ORDER BY m.room_id, m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.last_message_preview_for_rooms(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.last_message_preview_for_rooms(UUID[]) TO service_role;

-- Insert policy: allow poll messages from members
DROP POLICY IF EXISTS "messages_insert_room_members" ON messages;
CREATE POLICY "messages_insert_room_members" ON messages FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM chat_room_members crm
    WHERE crm.room_id = messages.room_id AND crm.user_id = auth.uid()
  )
  AND (
    (message_type IN ('text', 'image', 'poll') AND user_id = auth.uid())
    OR (message_type = 'system' AND (user_id IS NULL OR user_id = auth.uid()))
  )
);

-- ── Polls (linked to a poll message) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  message_id      UUID NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  allow_multiple  BOOLEAN NOT NULL DEFAULT false,
  ends_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_polls_room ON chat_polls(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_polls_message ON chat_polls(message_id);

CREATE TABLE IF NOT EXISTS chat_poll_options (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id   UUID NOT NULL REFERENCES chat_polls(id) ON DELETE CASCADE,
  position  INT NOT NULL DEFAULT 0,
  label     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_poll_options_poll ON chat_poll_options(poll_id);

CREATE TABLE IF NOT EXISTS chat_poll_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id    UUID NOT NULL REFERENCES chat_polls(id) ON DELETE CASCADE,
  room_id    UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option_id  UUID NOT NULL REFERENCES chat_poll_options(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id, option_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_poll_votes_poll ON chat_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_chat_poll_votes_room ON chat_poll_votes(room_id);

-- RLS
ALTER TABLE chat_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_polls_select_room_members" ON chat_polls FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM chat_room_members crm
    WHERE crm.room_id = chat_polls.room_id AND crm.user_id = auth.uid()
  )
);

CREATE POLICY "chat_poll_options_select_room_members" ON chat_poll_options FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM chat_polls p
    JOIN chat_room_members crm ON crm.room_id = p.room_id AND crm.user_id = auth.uid()
    WHERE p.id = chat_poll_options.poll_id
  )
);

CREATE POLICY "chat_poll_votes_select_room_members" ON chat_poll_votes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM chat_room_members crm
    WHERE crm.room_id = chat_poll_votes.room_id AND crm.user_id = auth.uid()
  )
);

CREATE POLICY "chat_poll_votes_insert_room_members" ON chat_poll_votes FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM chat_room_members crm
    WHERE crm.room_id = chat_poll_votes.room_id AND crm.user_id = auth.uid()
  )
);

CREATE POLICY "chat_poll_votes_delete_own" ON chat_poll_votes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "chat_polls_insert_by_author" ON chat_polls FOR INSERT WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1 FROM chat_room_members crm
    WHERE crm.room_id = chat_polls.room_id AND crm.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = chat_polls.message_id
      AND m.room_id = chat_polls.room_id
      AND m.user_id = auth.uid()
      AND m.message_type = 'poll'
  )
);

CREATE POLICY "chat_poll_options_insert_by_poll_creator" ON chat_poll_options FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM chat_polls p
    WHERE p.id = chat_poll_options.poll_id AND p.created_by = auth.uid()
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE chat_poll_votes;
