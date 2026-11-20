-- 119 · Tribe community: posts (plan / story / ask), media, comments, reactions,
-- tags, plan members, host offers, saved posts.
-- Product spec: docs/revamp/product-spec.md §3. All tables have RLS.

-- ── Profile additions used by Tribe + suggestions ─────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT
  CHECK (gender IN ('woman', 'man', 'nonbinary', 'prefer_not'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_city TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_lat DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_lng DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_id_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Users must not self-grant ID verification (staff / service role only).
CREATE OR REPLACE FUNCTION public.protect_profile_trust_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF NEW.is_id_verified IS DISTINCT FROM OLD.is_id_verified
     AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') THEN
    NEW.is_id_verified := OLD.is_id_verified;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_profile_trust_fields ON profiles;
CREATE TRIGGER trg_protect_profile_trust_fields BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_trust_fields();

-- ── Helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staff(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = p_uid
      AND p.role IN ('admin', 'social_media_manager', 'chat_responder', 'field_person',
                     'host_onboarding_staff', 'custom')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_phone_verified(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_phone_verified FROM profiles WHERE id = p_uid), false);
$$;

-- Internal writes (counter/notification triggers, SECURITY DEFINER workflows, cron with the
-- service role) bypass the user-facing guard triggers below.
CREATE OR REPLACE FUNCTION public.tribe_internal_write()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth.role() = 'service_role'
      OR pg_trigger_depth() > 1
      OR coalesce(current_setting('unsolo.internal', true), '') = 'on';
$$;

-- ── posts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL CHECK (kind IN ('plan', 'story', 'ask')),
  author_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Client-generated UUID so offline-queued posts are idempotent across retries.
  client_id        UUID,
  title            TEXT CHECK (char_length(title) <= 120),
  body             TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  place_name       TEXT CHECK (char_length(place_name) <= 120),
  place_slug       TEXT,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  -- Plan-only fields
  starts_on        DATE,
  ends_on          DATE,
  spots_total      SMALLINT CHECK (spots_total BETWEEN 2 AND 30),
  audience         TEXT NOT NULL DEFAULT 'anyone' CHECK (audience IN ('anyone', 'women', 'verified')),
  est_cost_text    TEXT CHECK (char_length(est_cost_text) <= 120),
  meeting_point    TEXT CHECK (char_length(meeting_point) <= 300),  -- revealed to approved members only (API)
  -- Story-only
  trip_package_id  UUID REFERENCES packages(id) ON DELETE SET NULL,
  show_on_trip_page BOOLEAN NOT NULL DEFAULT false,
  -- Ask-only: poll stored inline (small, fixed)
  poll_options     JSONB,  -- [{ "id": "a", "label": "..." }]
  accepted_comment_id UUID,
  status           TEXT NOT NULL DEFAULT 'live'
                   CHECK (status IN ('live', 'held', 'hidden', 'removed', 'cancelled', 'past')),
  moderation_flags TEXT[] NOT NULL DEFAULT '{}',
  -- Denormalised counters maintained by triggers (feed renders without joins)
  comment_count    INTEGER NOT NULL DEFAULT 0,
  reaction_counts  JSONB NOT NULL DEFAULT '{"want_to_go":0,"helpful":0,"love":0}',
  member_count     INTEGER NOT NULL DEFAULT 1,
  report_count     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT posts_plan_fields CHECK (
    kind <> 'plan' OR (starts_on IS NOT NULL AND spots_total IS NOT NULL AND place_name IS NOT NULL)
  ),
  CONSTRAINT posts_dates_order CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT posts_client_id_unique UNIQUE (author_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_kind_feed ON posts (kind, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_place ON posts (place_slug, starts_on) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS idx_posts_trip ON posts (trip_package_id) WHERE trip_package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_updated ON posts (updated_at);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS posts_select ON posts;
CREATE POLICY posts_select ON posts FOR SELECT USING (
  status IN ('live', 'past', 'cancelled')
  OR author_id = auth.uid()
  OR public.is_staff()
);
DROP POLICY IF EXISTS posts_insert ON posts;
CREATE POLICY posts_insert ON posts FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid() AND public.is_phone_verified()
  AND status IN ('live', 'held')
);
DROP POLICY IF EXISTS posts_update ON posts;
CREATE POLICY posts_update ON posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff())
  WITH CHECK (author_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS posts_delete ON posts;
CREATE POLICY posts_delete ON posts FOR DELETE TO authenticated USING (author_id = auth.uid());

-- Authors cannot un-hide / un-remove their own post or edit counters.
CREATE OR REPLACE FUNCTION public.guard_post_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF public.tribe_internal_write() OR public.is_staff() THEN RETURN NEW; END IF;
  IF OLD.status IN ('hidden', 'removed', 'held') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'post is under review';
  END IF;
  IF NEW.status NOT IN ('live', 'cancelled', 'past') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'invalid status change';
  END IF;
  NEW.comment_count := OLD.comment_count;
  NEW.reaction_counts := OLD.reaction_counts;
  NEW.member_count := OLD.member_count;
  NEW.report_count := OLD.report_count;
  NEW.moderation_flags := OLD.moderation_flags;
  NEW.author_id := OLD.author_id;
  NEW.kind := OLD.kind;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_post_update ON posts;
CREATE TRIGGER trg_guard_post_update BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_post_update();

-- ── post_media ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_media (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position   SMALLINT NOT NULL DEFAULT 0,
  url        TEXT NOT NULL,
  thumb_url  TEXT,
  lqip       TEXT CHECK (char_length(lqip) <= 2000),   -- tiny base64 webp placeholder
  width      INTEGER,
  height     INTEGER,
  bytes      INTEGER CHECK (bytes <= 2097152),        -- uploads are compressed to ≤ 2 MB
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media (post_id, position);
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_media_select ON post_media;
CREATE POLICY post_media_select ON post_media FOR SELECT USING (
  EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id)  -- inherits posts RLS
);
DROP POLICY IF EXISTS post_media_write ON post_media;
CREATE POLICY post_media_write ON post_media FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.author_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.author_id = auth.uid()));

-- ── post_comments (one reply level) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id  UUID,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  poll_choice TEXT,
  status     TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'hidden', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT post_comments_client_unique UNIQUE (author_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments (parent_id) WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_comment_depth()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM post_comments c WHERE c.id = NEW.parent_id
      AND (c.parent_id IS NOT NULL OR c.post_id <> NEW.post_id)
  ) THEN
    RAISE EXCEPTION 'replies are one level deep';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_comment_depth ON post_comments;
CREATE TRIGGER trg_enforce_comment_depth BEFORE INSERT ON post_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_comment_depth();

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_comments_select ON post_comments;
CREATE POLICY post_comments_select ON post_comments FOR SELECT USING (
  (status = 'live' AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id))
  OR author_id = auth.uid() OR public.is_staff()
);
DROP POLICY IF EXISTS post_comments_insert ON post_comments;
CREATE POLICY post_comments_insert ON post_comments FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid() AND public.is_phone_verified() AND status = 'live'
  AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.status = 'live')
);
DROP POLICY IF EXISTS post_comments_update ON post_comments;
CREATE POLICY post_comments_update ON post_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff())
  WITH CHECK (author_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS post_comments_delete ON post_comments;
CREATE POLICY post_comments_delete ON post_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());

-- ── post_reactions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_reactions (
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('want_to_go', 'helpful', 'love')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_post_reactions_user ON post_reactions (user_id, created_at DESC);
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_reactions_select ON post_reactions;
CREATE POLICY post_reactions_select ON post_reactions FOR SELECT USING (true);
DROP POLICY IF EXISTS post_reactions_insert ON post_reactions;
CREATE POLICY post_reactions_insert ON post_reactions FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.status = 'live')
);
DROP POLICY IF EXISTS post_reactions_delete ON post_reactions;
CREATE POLICY post_reactions_delete ON post_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── post_tags (story co-travellers; consent required) ─────────────────────
CREATE TABLE IF NOT EXISTS post_tags (
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  state      TEXT NOT NULL DEFAULT 'asked' CHECK (state IN ('asked', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_tags_select ON post_tags;
CREATE POLICY post_tags_select ON post_tags FOR SELECT USING (
  state = 'accepted' OR user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.author_id = auth.uid())
);
DROP POLICY IF EXISTS post_tags_insert ON post_tags;
CREATE POLICY post_tags_insert ON post_tags FOR INSERT TO authenticated WITH CHECK (
  state = 'asked' AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.author_id = auth.uid())
);
DROP POLICY IF EXISTS post_tags_answer ON post_tags;
CREATE POLICY post_tags_answer ON post_tags FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS post_tags_delete ON post_tags;
CREATE POLICY post_tags_delete ON post_tags FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.author_id = auth.uid())
);

-- ── plan_members ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_members (
  post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('organiser', 'member')),
  state       TEXT NOT NULL DEFAULT 'requested'
              CHECK (state IN ('requested', 'approved', 'declined', 'withdrawn', 'expired', 'removed')),
  intro       TEXT CHECK (char_length(intro) <= 500),
  expires_at  TIMESTAMPTZ DEFAULT (now() + interval '72 hours'),
  decided_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_members_user ON plan_members (user_id, state);
CREATE INDEX IF NOT EXISTS idx_plan_members_pending ON plan_members (expires_at) WHERE state = 'requested';

CREATE OR REPLACE FUNCTION public.is_plan_member(p_post UUID, p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM plan_members m
                 WHERE m.post_id = p_post AND m.user_id = p_uid AND m.state = 'approved');
$$;
CREATE OR REPLACE FUNCTION public.is_plan_organiser(p_post UUID, p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM posts p WHERE p.id = p_post AND p.author_id = p_uid AND p.kind = 'plan');
$$;

ALTER TABLE plan_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_members_select ON plan_members;
CREATE POLICY plan_members_select ON plan_members FOR SELECT USING (
  state = 'approved'                       -- approved roster is public (the seat row)
  OR user_id = auth.uid()
  OR public.is_plan_organiser(post_id)
  OR public.is_staff()
);
DROP POLICY IF EXISTS plan_members_request ON plan_members;
CREATE POLICY plan_members_request ON plan_members FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND role = 'member' AND state = 'requested'
  AND public.is_phone_verified()
  AND char_length(coalesce(intro, '')) >= 10
);
DROP POLICY IF EXISTS plan_members_update ON plan_members;
CREATE POLICY plan_members_update ON plan_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_plan_organiser(post_id))
  WITH CHECK (user_id = auth.uid() OR public.is_plan_organiser(post_id));

-- State machine: requester may only withdraw; organiser may approve/decline/remove.
CREATE OR REPLACE FUNCTION public.guard_plan_member_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_post posts%ROWTYPE; v_gender TEXT; v_verified BOOLEAN;
BEGIN
  IF public.tribe_internal_write() THEN RETURN NEW; END IF;
  SELECT * INTO v_post FROM posts WHERE id = NEW.post_id;
  IF public.is_plan_organiser(NEW.post_id) AND NEW.user_id <> auth.uid() THEN
    IF NEW.state NOT IN ('approved', 'declined', 'removed') THEN RAISE EXCEPTION 'invalid decision'; END IF;
    IF NEW.state = 'approved' THEN
      IF (SELECT count(*) FROM plan_members WHERE post_id = NEW.post_id AND state = 'approved') >= v_post.spots_total THEN
        RAISE EXCEPTION 'plan is full';
      END IF;
      IF v_post.audience IN ('women', 'verified') THEN
        SELECT gender, is_id_verified INTO v_gender, v_verified FROM profiles WHERE id = NEW.user_id;
        IF NOT coalesce(v_verified, false) THEN RAISE EXCEPTION 'joiner must be ID-verified'; END IF;
        IF v_post.audience = 'women' AND v_gender IS DISTINCT FROM 'woman' THEN
          RAISE EXCEPTION 'women-only plan';
        END IF;
      END IF;
    END IF;
    NEW.decided_at := now();
  ELSIF NEW.user_id = auth.uid() THEN
    IF NEW.state <> 'withdrawn' THEN RAISE EXCEPTION 'you can only withdraw'; END IF;
  ELSE
    RAISE EXCEPTION 'not allowed';
  END IF;
  NEW.role := OLD.role; NEW.intro := OLD.intro;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_plan_member_update ON plan_members;
CREATE TRIGGER trg_guard_plan_member_update BEFORE UPDATE ON plan_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_plan_member_update();

-- Organiser seat is created automatically with the plan.
CREATE OR REPLACE FUNCTION public.add_plan_organiser()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'plan' THEN
    INSERT INTO plan_members (post_id, user_id, role, state, expires_at, decided_at)
    VALUES (NEW.id, NEW.author_id, 'organiser', 'approved', NULL, now())
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_add_plan_organiser ON posts;
CREATE TRIGGER trg_add_plan_organiser AFTER INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION public.add_plan_organiser();

-- ── host_offers ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS host_offers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  host_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  price_paise  INTEGER NOT NULL CHECK (price_paise > 0),
  includes     TEXT[] NOT NULL DEFAULT '{}',
  notes        TEXT CHECK (char_length(notes) <= 1000),
  extra_seats  SMALLINT NOT NULL DEFAULT 0 CHECK (extra_seats BETWEEN 0 AND 20),
  state        TEXT NOT NULL DEFAULT 'pending'
               CHECK (state IN ('pending', 'accepted', 'declined', 'expired', 'withdrawn')),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  package_id   UUID REFERENCES packages(id) ON DELETE SET NULL,
  pay_by       TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, host_id)
);
CREATE INDEX IF NOT EXISTS idx_host_offers_post ON host_offers (post_id, state);
CREATE INDEX IF NOT EXISTS idx_host_offers_host ON host_offers (host_id, created_at DESC);
ALTER TABLE host_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS host_offers_select ON host_offers;
CREATE POLICY host_offers_select ON host_offers FOR SELECT USING (
  host_id = auth.uid() OR public.is_plan_organiser(post_id) OR public.is_plan_member(post_id)
  OR public.is_staff()
);
DROP POLICY IF EXISTS host_offers_insert ON host_offers;
CREATE POLICY host_offers_insert ON host_offers FOR INSERT TO authenticated WITH CHECK (
  host_id = auth.uid() AND state = 'pending'
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_host = true)
  AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.kind = 'plan' AND p.status = 'live'
              AND p.author_id <> auth.uid())
);
DROP POLICY IF EXISTS host_offers_update ON host_offers;
CREATE POLICY host_offers_update ON host_offers FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR public.is_plan_organiser(post_id))
  WITH CHECK (host_id = auth.uid() OR public.is_plan_organiser(post_id));

CREATE OR REPLACE FUNCTION public.guard_host_offer_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF public.tribe_internal_write() THEN RETURN NEW; END IF;
  IF OLD.state <> 'pending' THEN RAISE EXCEPTION 'offer is closed'; END IF;
  IF NEW.host_id = auth.uid() THEN
    -- host may edit terms or withdraw
    IF NEW.state NOT IN ('pending', 'withdrawn') THEN RAISE EXCEPTION 'not allowed'; END IF;
  ELSIF public.is_plan_organiser(NEW.post_id) THEN
    -- organiser may only decline here; accept goes through accept_host_offer()
    IF NEW.state <> 'declined' THEN RAISE EXCEPTION 'use accept_host_offer'; END IF;
    NEW.price_paise := OLD.price_paise; NEW.includes := OLD.includes; NEW.notes := OLD.notes;
    NEW.extra_seats := OLD.extra_seats;
  END IF;
  NEW.package_id := OLD.package_id; NEW.pay_by := OLD.pay_by;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_host_offer_update ON host_offers;
CREATE TRIGGER trg_guard_host_offer_update BEFORE UPDATE ON host_offers
  FOR EACH ROW EXECUTE FUNCTION public.guard_host_offer_update();

-- ── saved_posts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_posts (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_posts_own ON saved_posts;
CREATE POLICY saved_posts_own ON saved_posts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Counter triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_post_comment_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'live' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'live' THEN
    UPDATE posts SET comment_count = greatest(comment_count - 1, 0) WHERE id = OLD.post_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE posts SET comment_count = greatest(comment_count + CASE WHEN NEW.status = 'live' THEN 1 ELSE -1 END, 0)
    WHERE id = NEW.post_id AND (OLD.status = 'live' OR NEW.status = 'live');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_bump_post_comment_count ON post_comments;
CREATE TRIGGER trg_bump_post_comment_count AFTER INSERT OR UPDATE OF status OR DELETE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION public.bump_post_comment_count();

CREATE OR REPLACE FUNCTION public.bump_post_reaction_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_post UUID; v_kind TEXT; v_delta INT;
BEGIN
  IF TG_OP = 'INSERT' THEN v_post := NEW.post_id; v_kind := NEW.kind; v_delta := 1;
  ELSE v_post := OLD.post_id; v_kind := OLD.kind; v_delta := -1; END IF;
  UPDATE posts SET reaction_counts = jsonb_set(
    reaction_counts, ARRAY[v_kind],
    to_jsonb(greatest(coalesce((reaction_counts ->> v_kind)::int, 0) + v_delta, 0)))
  WHERE id = v_post;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_bump_post_reaction_count ON post_reactions;
CREATE TRIGGER trg_bump_post_reaction_count AFTER INSERT OR DELETE ON post_reactions
  FOR EACH ROW EXECUTE FUNCTION public.bump_post_reaction_count();

CREATE OR REPLACE FUNCTION public.bump_plan_member_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_post UUID;
BEGIN
  v_post := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE posts SET member_count = (
    SELECT count(*) FROM plan_members WHERE post_id = v_post AND state = 'approved')
  WHERE id = v_post;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_bump_plan_member_count ON plan_members;
CREATE TRIGGER trg_bump_plan_member_count AFTER INSERT OR UPDATE OF state OR DELETE ON plan_members
  FOR EACH ROW EXECUTE FUNCTION public.bump_plan_member_count();

-- ── Notifications for Tribe events (in-app; push fan-out reads notifications) ──
CREATE OR REPLACE FUNCTION public.notify_tribe_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_post posts%ROWTYPE; v_actor TEXT;
BEGIN
  IF TG_TABLE_NAME = 'plan_members' THEN
    SELECT * INTO v_post FROM posts WHERE id = NEW.post_id;
    SELECT coalesce(full_name, username) INTO v_actor FROM profiles WHERE id = NEW.user_id;
    IF TG_OP = 'INSERT' AND NEW.role = 'member' THEN
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      VALUES (v_post.author_id, 'tribe_join_request', v_actor || ' asked to join your plan',
              left(NEW.intro, 140), '/tribe/p/' || NEW.post_id,
              jsonb_build_object('post_id', NEW.post_id, 'actor_id', NEW.user_id, 'category', 'plans'));
    ELSIF TG_OP = 'UPDATE' AND NEW.state IS DISTINCT FROM OLD.state AND NEW.state IN ('approved', 'declined') THEN
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      VALUES (NEW.user_id, 'tribe_join_' || NEW.state,
              CASE WHEN NEW.state = 'approved' THEN 'You''re in: ' || coalesce(v_post.title, v_post.place_name)
                   ELSE 'Your request for ' || coalesce(v_post.title, v_post.place_name) || ' wasn''t accepted' END,
              CASE WHEN NEW.state = 'approved' THEN 'The plan chat and meeting point are open now.' ELSE NULL END,
              '/tribe/p/' || NEW.post_id,
              jsonb_build_object('post_id', NEW.post_id, 'category', 'plans'));
    END IF;
  ELSIF TG_TABLE_NAME = 'post_comments' THEN
    SELECT * INTO v_post FROM posts WHERE id = NEW.post_id;
    SELECT coalesce(full_name, username) INTO v_actor FROM profiles WHERE id = NEW.author_id;
    IF v_post.author_id <> NEW.author_id THEN
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      VALUES (v_post.author_id, 'tribe_comment', v_actor || ' replied to your ' || v_post.kind,
              left(NEW.body, 140), '/tribe/p/' || NEW.post_id || '#c-' || NEW.id,
              jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'category', 'replies'));
    END IF;
    IF NEW.parent_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      SELECT c.author_id, 'tribe_reply', v_actor || ' replied to you', left(NEW.body, 140),
             '/tribe/p/' || NEW.post_id || '#c-' || NEW.id,
             jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'category', 'replies')
      FROM post_comments c WHERE c.id = NEW.parent_id
        AND c.author_id <> NEW.author_id AND c.author_id <> v_post.author_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'host_offers' AND TG_OP = 'INSERT' THEN
    SELECT * INTO v_post FROM posts WHERE id = NEW.post_id;
    SELECT coalesce(full_name, username) INTO v_actor FROM profiles WHERE id = NEW.host_id;
    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    VALUES (v_post.author_id, 'tribe_host_offer', v_actor || ' offered to host your plan',
            '₹' || to_char(NEW.price_paise / 100, 'FM99,99,999') || ' each · reply within 7 days',
            '/tribe/p/' || NEW.post_id || '/offers/' || NEW.id,
            jsonb_build_object('post_id', NEW.post_id, 'offer_id', NEW.id, 'category', 'plans'));
  ELSIF TG_TABLE_NAME = 'post_tags' AND TG_OP = 'INSERT' THEN
    SELECT * INTO v_post FROM posts WHERE id = NEW.post_id;
    SELECT coalesce(full_name, username) INTO v_actor FROM profiles WHERE id = v_post.author_id;
    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    VALUES (NEW.user_id, 'tribe_tag_request', v_actor || ' wants to tag you in a story',
            'Nothing shows until you say yes.', '/tribe/p/' || NEW.post_id,
            jsonb_build_object('post_id', NEW.post_id, 'category', 'tags'));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_notify_plan_members ON plan_members;
CREATE TRIGGER trg_notify_plan_members AFTER INSERT OR UPDATE OF state ON plan_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_tribe_event();
DROP TRIGGER IF EXISTS trg_notify_post_comments ON post_comments;
CREATE TRIGGER trg_notify_post_comments AFTER INSERT ON post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_tribe_event();
DROP TRIGGER IF EXISTS trg_notify_host_offers ON host_offers;
CREATE TRIGGER trg_notify_host_offers AFTER INSERT ON host_offers
  FOR EACH ROW EXECUTE FUNCTION public.notify_tribe_event();
DROP TRIGGER IF EXISTS trg_notify_post_tags ON post_tags;
CREATE TRIGGER trg_notify_post_tags AFTER INSERT ON post_tags
  FOR EACH ROW EXECUTE FUNCTION public.notify_tribe_event();

-- ── Plan chat room on first approval (reuses chat_rooms) ──────────────────
-- type 'trip' = members-only (type 'general' rooms are public community rooms).
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES posts(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_rooms_post ON chat_rooms (post_id) WHERE post_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_plan_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_room UUID; v_post posts%ROWTYPE;
BEGIN
  IF NEW.state <> 'approved' THEN
    IF TG_OP = 'UPDATE' AND OLD.state = 'approved' THEN
      DELETE FROM chat_room_members m USING chat_rooms r
       WHERE r.post_id = NEW.post_id AND m.room_id = r.id AND m.user_id = NEW.user_id;
    END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO v_post FROM posts WHERE id = NEW.post_id;
  SELECT id INTO v_room FROM chat_rooms WHERE post_id = NEW.post_id;
  IF v_room IS NULL THEN
    INSERT INTO chat_rooms (name, type, created_by, post_id)
    VALUES (coalesce(v_post.title, v_post.place_name || ' plan'), 'trip', v_post.author_id, NEW.post_id)
    RETURNING id INTO v_room;
  END IF;
  INSERT INTO chat_room_members (room_id, user_id) VALUES (v_room, NEW.user_id)
  ON CONFLICT (room_id, user_id) DO NOTHING;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_sync_plan_chat ON plan_members;
CREATE TRIGGER trg_sync_plan_chat AFTER INSERT OR UPDATE OF state ON plan_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_plan_chat();

-- ── Realtime for live counters in feed/detail ─────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE posts;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE post_comments;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;
