-- 24h status photos / stories: visibility + RLS helper

CREATE TABLE IF NOT EXISTS status_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  audience JSONB NOT NULL DEFAULT '{"mode":"all"}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_status_stories_expires ON status_stories (expires_at);
CREATE INDEX IF NOT EXISTS idx_status_stories_author_created ON status_stories (author_id, created_at DESC);

CREATE OR REPLACE FUNCTION status_story_visible_to_reader(p_story_id UUID, p_reader UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s status_stories%ROWTYPE;
  mode text;
BEGIN
  SELECT * INTO s FROM status_stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF s.expires_at <= NOW() THEN
    RETURN false;
  END IF;
  IF s.author_id = p_reader THEN
    RETURN true;
  END IF;

  mode := COALESCE(NULLIF(TRIM(s.audience->>'mode'), ''), 'all');

  IF mode = 'all' THEN
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(s.audience->'exclude_user_ids', '[]'::jsonb)) ex(val)
      WHERE TRIM(ex.val) = p_reader::text
    ) THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  IF mode = 'followers' THEN
    RETURN EXISTS (
      SELECT 1 FROM follows f
      WHERE f.follower_id = p_reader AND f.following_id = s.author_id
    );
  END IF;

  IF mode = 'following' THEN
    RETURN EXISTS (
      SELECT 1 FROM follows f
      WHERE f.follower_id = s.author_id AND f.following_id = p_reader
    );
  END IF;

  IF mode = 'users' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(s.audience->'include_user_ids', '[]'::jsonb)) x(val)
      WHERE TRIM(x.val) = p_reader::text
    );
  END IF;

  IF mode = 'communities' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(s.audience->'include_room_ids', '[]'::jsonb)) r(room_id_text)
      INNER JOIN chat_room_members crm
        ON crm.room_id = TRIM(r.room_id_text)::uuid
       AND crm.user_id = p_reader
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION status_story_visible_to_reader(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION status_story_visible_to_reader(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION status_story_visible_to_reader(UUID, UUID) TO service_role;

ALTER TABLE status_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "status_stories_insert_own" ON status_stories
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "status_stories_select_visible" ON status_stories
  FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR status_story_visible_to_reader(id, auth.uid())
  );

CREATE POLICY "status_stories_delete_own" ON status_stories
  FOR DELETE TO authenticated
  USING (author_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE status_stories;
