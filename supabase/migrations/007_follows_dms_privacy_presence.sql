-- ============================================================
-- 007: Follows, DMs, Privacy Settings, Online Presence
-- ============================================================

-- ── Follows table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK(follower_id != following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can see follows" ON follows FOR SELECT USING (true);
CREATE POLICY "Users can follow" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON follows FOR DELETE USING (auth.uid() = follower_id);

-- ── Privacy settings on profiles ────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trips_private BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS states_private BOOLEAN DEFAULT false;

-- ── Online presence table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS user_presence (
  user_id    UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  last_seen  TIMESTAMPTZ DEFAULT now(),
  is_online  BOOLEAN DEFAULT false
);

ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can see presence" ON user_presence FOR SELECT USING (true);
CREATE POLICY "Users update own presence" ON user_presence FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own presence upd" ON user_presence FOR UPDATE USING (auth.uid() = user_id);

-- Upsert function for presence
CREATE OR REPLACE FUNCTION upsert_presence(p_user_id UUID, p_online BOOLEAN)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_presence (user_id, last_seen, is_online)
  VALUES (p_user_id, now(), p_online)
  ON CONFLICT (user_id)
  DO UPDATE SET last_seen = now(), is_online = p_online;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Direct message rooms helper ─────────────────────────────
-- Function to get or create a DM room between two users
CREATE OR REPLACE FUNCTION get_or_create_dm_room(user_a UUID, user_b UUID)
RETURNS UUID AS $$
DECLARE
  room_id UUID;
BEGIN
  -- Look for existing DM room where both are members
  SELECT cr.id INTO room_id
  FROM chat_rooms cr
  WHERE cr.type = 'direct'
    AND EXISTS (SELECT 1 FROM chat_room_members WHERE room_id = cr.id AND user_id = user_a)
    AND EXISTS (SELECT 1 FROM chat_room_members WHERE room_id = cr.id AND user_id = user_b);

  IF room_id IS NOT NULL THEN
    RETURN room_id;
  END IF;

  -- Create new DM room
  INSERT INTO chat_rooms (name, type, created_by, is_active)
  VALUES ('Direct Message', 'direct', user_a, true)
  RETURNING id INTO room_id;

  -- Add both members
  INSERT INTO chat_room_members (room_id, user_id) VALUES (room_id, user_a);
  INSERT INTO chat_room_members (room_id, user_id) VALUES (room_id, user_b);

  RETURN room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Add followers/following counts as a view for efficiency ──
CREATE OR REPLACE VIEW profile_follow_counts AS
SELECT
  p.id,
  COALESCE(fr.cnt, 0)::INT AS followers_count,
  COALESCE(fg.cnt, 0)::INT AS following_count
FROM profiles p
LEFT JOIN (SELECT following_id, COUNT(*) AS cnt FROM follows GROUP BY following_id) fr ON fr.following_id = p.id
LEFT JOIN (SELECT follower_id, COUNT(*) AS cnt FROM follows GROUP BY follower_id) fg ON fg.follower_id = p.id;
