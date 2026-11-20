-- 120 · Trust & safety: reports, moderation actions, blocks, sanctions, rate limits,
-- block / mute enforcement on every write path, chat membership and notification hardening.
-- Rules: docs/revamp/product-spec.md §4.

-- ── reports ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'user', 'message')),
  target_id    UUID NOT NULL,
  target_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL CHECK (reason IN ('spam', 'scam_money', 'harassment', 'unsafe_meetup',
                                               'fake_profile', 'hate', 'sexual', 'other')),
  details      TEXT CHECK (char_length(details) <= 1000),
  priority     TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('safety', 'normal')),
  state        TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'in_review', 'actioned', 'dismissed')),
  assigned_to  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution   TEXT,
  due_at       TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_reports_queue ON reports (state, priority, due_at);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports (target_type, target_id);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reports_insert ON reports;
CREATE POLICY reports_insert ON reports FOR INSERT TO authenticated WITH CHECK (
  reporter_id = auth.uid() AND state = 'open' AND assigned_to IS NULL AND resolution IS NULL
);
DROP POLICY IF EXISTS reports_select ON reports;
CREATE POLICY reports_select ON reports FOR SELECT USING (reporter_id = auth.uid() OR public.is_moderator());
DROP POLICY IF EXISTS reports_staff_update ON reports;
CREATE POLICY reports_staff_update ON reports FOR UPDATE TO authenticated
  USING (public.is_moderator()) WITH CHECK (public.is_moderator());

-- Priority + SLA; target owner resolved server-side (never trusted from the client).
CREATE OR REPLACE FUNCTION public.on_report_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.priority := CASE WHEN NEW.reason IN ('harassment', 'unsafe_meetup', 'sexual') THEN 'safety' ELSE 'normal' END;
  NEW.due_at := now() + CASE WHEN NEW.priority = 'safety' THEN interval '2 hours' ELSE interval '24 hours' END;
  NEW.state := 'open'; NEW.created_at := now();
  IF NEW.target_type = 'post' THEN
    SELECT author_id INTO NEW.target_user_id FROM posts WHERE id = NEW.target_id;
  ELSIF NEW.target_type = 'comment' THEN
    SELECT author_id INTO NEW.target_user_id FROM post_comments WHERE id = NEW.target_id;
  ELSIF NEW.target_type = 'user' THEN
    NEW.target_user_id := NEW.target_id;
  ELSIF NEW.target_type = 'message' THEN
    SELECT user_id INTO NEW.target_user_id FROM messages WHERE id = NEW.target_id;
  END IF;
  IF NEW.target_user_id = NEW.reporter_id THEN RAISE EXCEPTION 'cannot report yourself'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_on_report_insert ON reports;
CREATE TRIGGER trg_on_report_insert BEFORE INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION public.on_report_insert();

-- Auto-hide threshold: 3 distinct reporters, or 1 unsafe-meetup report on a women-only plan.
CREATE OR REPLACE FUNCTION public.after_report_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT; v_audience TEXT;
BEGIN
  SELECT count(DISTINCT reporter_id) INTO v_count FROM reports
   WHERE target_type = NEW.target_type AND target_id = NEW.target_id AND state IN ('open', 'in_review');
  IF NEW.target_type = 'post' THEN
    UPDATE posts SET report_count = v_count WHERE id = NEW.target_id;
    SELECT audience INTO v_audience FROM posts WHERE id = NEW.target_id;
    IF v_count >= 3 OR (NEW.reason = 'unsafe_meetup' AND v_audience = 'women') THEN
      UPDATE posts SET status = 'hidden',
             moderation_flags = array_append(moderation_flags, 'auto_hidden_reports')
       WHERE id = NEW.target_id AND status = 'live';
    END IF;
  ELSIF NEW.target_type = 'comment' AND v_count >= 3 THEN
    UPDATE post_comments SET status = 'hidden' WHERE id = NEW.target_id AND status = 'live';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_after_report_insert ON reports;
CREATE TRIGGER trg_after_report_insert AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION public.after_report_insert();

-- Reported content can't be hard-deleted by its author while reports are open (evidence).
CREATE OR REPLACE FUNCTION public.has_open_reports(p_type TEXT, p_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM reports WHERE target_type = p_type AND target_id = p_id AND state IN ('open', 'in_review'));
$$;
DROP POLICY IF EXISTS posts_delete ON posts;
CREATE POLICY posts_delete ON posts FOR DELETE TO authenticated USING (
  author_id = auth.uid() AND status IN ('live', 'cancelled', 'past') AND NOT public.has_open_reports('post', id)
);
DROP POLICY IF EXISTS post_comments_delete ON post_comments;
CREATE POLICY post_comments_delete ON post_comments FOR DELETE TO authenticated USING (
  author_id = auth.uid() AND status = 'live' AND NOT public.has_open_reports('comment', id)
);

-- ── moderation_actions (audit trail) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS moderation_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    UUID REFERENCES reports(id) ON DELETE SET NULL,
  actor_id     UUID NOT NULL REFERENCES profiles(id),
  target_type  TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'user', 'message')),
  target_id    UUID NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('hide', 'remove', 'restore', 'warn', 'mute',
                                               'suspend', 'ban', 'unban', 'dismiss', 'verify_id')),
  note         TEXT CHECK (char_length(note) <= 2000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_target ON moderation_actions (target_type, target_id, created_at DESC);
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS moderation_actions_staff ON moderation_actions;
CREATE POLICY moderation_actions_staff ON moderation_actions FOR SELECT USING (public.is_moderator());
DROP POLICY IF EXISTS moderation_actions_insert ON moderation_actions;
CREATE POLICY moderation_actions_insert ON moderation_actions FOR INSERT TO authenticated
  WITH CHECK (public.is_moderator() AND actor_id = auth.uid());

-- ── user_blocks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks (blocked_id);
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_blocks_own ON user_blocks;
CREATE POLICY user_blocks_own ON user_blocks FOR ALL TO authenticated
  USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_blocked_between(a UUID, b UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_blocks
                 WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a));
$$;

-- ── user_sanctions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sanctions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('warn', 'mute', 'suspend', 'ban')),
  reason     TEXT,
  until      TIMESTAMPTZ,            -- NULL = permanent (ban) or informational (warn)
  created_by UUID REFERENCES profiles(id),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_sanctions_active ON user_sanctions (user_id) WHERE revoked_at IS NULL;
ALTER TABLE user_sanctions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_sanctions_select ON user_sanctions;
CREATE POLICY user_sanctions_select ON user_sanctions FOR SELECT USING (user_id = auth.uid() OR public.is_moderator());
DROP POLICY IF EXISTS user_sanctions_admin ON user_sanctions;
CREATE POLICY user_sanctions_admin ON user_sanctions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.is_muted(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_sanctions s
                 WHERE s.user_id = p_uid AND s.revoked_at IS NULL
                   AND s.kind IN ('mute', 'suspend', 'ban')
                   AND (s.until IS NULL OR s.until > now()));
$$;

-- ── Client write paths that stay direct: all respect blocks + mutes ────────
-- Reactions
DROP POLICY IF EXISTS post_reactions_insert ON post_reactions;
CREATE POLICY post_reactions_insert ON post_reactions FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND NOT public.is_muted()
  AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.status = 'live'
              AND NOT public.is_blocked_between(p.author_id, auth.uid()))
);
-- Join requests (intro required; closed / converted / own / blocked plans refused)
DROP POLICY IF EXISTS plan_members_request ON plan_members;
CREATE POLICY plan_members_request ON plan_members FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND role = 'member' AND state = 'requested'
  AND public.is_phone_verified() AND NOT public.is_muted()
  AND char_length(coalesce(intro, '')) >= 10
  AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.kind = 'plan' AND p.status = 'live'
              AND p.converted_package_id IS NULL AND p.author_id <> auth.uid()
              AND NOT public.is_blocked_between(p.author_id, auth.uid()))
);
-- Restrictive (AND-ed) guards for paths whose permissive policies live elsewhere.
DROP POLICY IF EXISTS plan_members_not_muted_update ON plan_members;
CREATE POLICY plan_members_not_muted_update ON plan_members AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_muted()) WITH CHECK (NOT public.is_muted());
DROP POLICY IF EXISTS host_offers_not_muted ON host_offers;
CREATE POLICY host_offers_not_muted ON host_offers AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_muted()
              AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND public.is_blocked_between(p.author_id, auth.uid())));
DROP POLICY IF EXISTS post_tags_not_muted ON post_tags;
CREATE POLICY post_tags_not_muted ON post_tags AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_muted()) WITH CHECK (NOT public.is_muted());
-- Chat: muted / suspended / banned people can't send; nobody can message across a block in a DM.
DROP POLICY IF EXISTS messages_not_muted ON messages;
CREATE POLICY messages_not_muted ON messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.is_muted()
    AND NOT EXISTS (
      SELECT 1 FROM chat_rooms r JOIN chat_room_members m ON m.room_id = r.id
      WHERE r.id = messages.room_id AND r.type = 'direct' AND m.user_id <> auth.uid()
        AND public.is_blocked_between(m.user_id, auth.uid()))
  );

-- ── SECURITY FIX: chat membership ─────────────────────────────────────────
-- 001 let any signed-in user add themselves to ANY room (including trip and plan groups) and
-- then read its messages. Self-join is now limited to public community rooms; trip, plan and
-- DM membership is granted only by server code / SECURITY DEFINER triggers (service role).
DROP POLICY IF EXISTS "members_insert_auth" ON chat_room_members;
DROP POLICY IF EXISTS members_insert_self_general ON chat_room_members;
CREATE POLICY members_insert_self_general ON chat_room_members FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND NOT public.is_muted()
  AND EXISTS (SELECT 1 FROM chat_rooms r WHERE r.id = room_id AND r.type = 'general' AND r.is_active IS NOT FALSE)
);

-- ── rate_limits (fixed window; service role only, used by /api/v1) ───────
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;   -- no policies → service role only

CREATE OR REPLACE FUNCTION public.hit_rate_limit(p_key TEXT, p_window_seconds INT, p_max INT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_start TIMESTAMPTZ; v_count INT;
BEGIN
  v_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  INSERT INTO rate_limits (key, window_start, count) VALUES (p_key, v_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;
  RETURN v_count <= p_max;   -- true = allowed
END $$;
REVOKE ALL ON FUNCTION public.hit_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_rate_limit(TEXT, INT, INT) TO service_role;

-- ── SECURITY FIX: notifications ───────────────────────────────────────────
-- Previously anyone (even anon) could insert a notification for any user with any link
-- (phishing in the bell, and as a real push). Now: you may notify yourself; staff tools may
-- notify anyone; server code uses the service role. Links must be same-site paths: "/x" but not
-- "//host", "/\host" or anything containing whitespace or backslashes.
CREATE OR REPLACE FUNCTION public.is_internal_link(p_link TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT p_link IS NOT NULL AND p_link ~ '^/([^/\\[:space:][:cntrl:]][^\\[:space:][:cntrl:]]*)?$';
$$;

DROP POLICY IF EXISTS "System can create notifications" ON notifications;
DROP POLICY IF EXISTS notifications_insert_internal ON notifications;
CREATE POLICY notifications_insert_internal ON notifications FOR INSERT TO authenticated WITH CHECK (
  (user_id = auth.uid() OR public.is_any_staff())
  AND (link IS NULL OR public.is_internal_link(link))
);

CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID, p_type TEXT, p_title TEXT, p_body TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL, p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  IF auth.role() <> 'service_role' AND p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_any_staff() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF p_link IS NOT NULL AND NOT public.is_internal_link(p_link) THEN
    RAISE EXCEPTION 'notification links must be internal';
  END IF;
  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (p_user_id, p_type, left(p_title, 200), left(p_body, 1000), p_link, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION create_notification(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;

-- Push fan-out bookkeeping
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notifications_unpushed ON notifications (created_at) WHERE pushed_at IS NULL;
