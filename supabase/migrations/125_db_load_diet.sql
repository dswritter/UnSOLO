-- 125: cut database disk IO (the free-tier Disk IO budget ran out and PostgREST timed out).

-- ── Presence: fewer writes, no realtime fan-out ─────────────────────────
-- Every heartbeat was a write, and every chat window listening on user_presence re-queried on
-- each one. Clients now poll; stop streaming this table through realtime.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_presence') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.user_presence;
  END IF;
END $$;

-- Only your own row (p_user_id was trusted before), and skip the write when nothing would change:
-- still online and seen in the last 90 seconds.
CREATE OR REPLACE FUNCTION upsert_presence(p_user_id UUID, p_online BOOLEAN)
RETURNS VOID AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  INSERT INTO user_presence (user_id, last_seen, is_online)
  VALUES (v_uid, now(), p_online)
  ON CONFLICT (user_id) DO UPDATE SET last_seen = now(), is_online = p_online
  WHERE user_presence.is_online IS DISTINCT FROM p_online OR user_presence.last_seen < now() - interval '90 seconds';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Mark read: only the new messages, not the whole room every time ───
-- This ran on every chat poll that brought a new message and scanned every message ever sent in
-- the room. Now it looks at messages since your last read (with a few minutes' slack).
CREATE OR REPLACE FUNCTION mark_room_messages_read(p_room_id UUID, p_user_id UUID)
RETURNS void AS $$
DECLARE v_since TIMESTAMPTZ;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  SELECT last_read INTO v_since FROM chat_room_members WHERE room_id = p_room_id AND user_id = p_user_id;
  INSERT INTO message_read_receipts (message_id, user_id)
  SELECT m.id, p_user_id
  FROM messages m
  WHERE m.room_id = p_room_id
    AND (v_since IS NULL OR m.created_at > v_since - interval '10 minutes')
    AND m.user_id != p_user_id
    AND m.message_type != 'system'
    AND NOT EXISTS (SELECT 1 FROM message_read_receipts r WHERE r.message_id = m.id AND r.user_id = p_user_id)
  ON CONFLICT (message_id, user_id) DO NOTHING;
  UPDATE chat_room_members SET last_read = now() WHERE room_id = p_room_id AND user_id = p_user_id
    AND (last_read IS NULL OR last_read < now() - interval '5 seconds');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Same index twice on messages (every insert paid for both) ──────────
-- idx_messages_room_created (room_id, created_at DESC) serves both directions.
DROP INDEX IF EXISTS idx_messages_room;

-- ── Realtime: stop streaming tables nobody listens to ──────────────────
-- Realtime decodes every change to a published table. No client subscribes to these.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['posts', 'post_comments', 'status_stories', 'chat_room_members'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ── Daily housekeeping (called by /api/cron/tribe) ──────────────────────
-- Rate-limit windows are already pruned by expire_tribe_items; this index makes that cheap.
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);
CREATE OR REPLACE FUNCTION public.prune_housekeeping() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a INT := 0; l INT := 0;
BEGIN
  -- Batched so one run never rewrites a huge chunk of the table at once.
  DELETE FROM analytics_events WHERE id IN (SELECT id FROM analytics_events WHERE ts < now() - interval '180 days' LIMIT 20000);
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM live_locations WHERE expires_at < now() - interval '1 hour'; GET DIAGNOSTICS l = ROW_COUNT;
  RETURN jsonb_build_object('analytics', a, 'liveLocations', l);
END $$;
REVOKE ALL ON FUNCTION public.prune_housekeeping() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_housekeeping() TO service_role;

NOTIFY pgrst, 'reload schema';
