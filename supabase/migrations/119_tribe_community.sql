-- 119 · Tribe community: posts (plan / story / ask), media, comments, reactions,
-- tags, plan members, host offers, saved posts, private profile + plan fields.
-- Product spec: docs/revamp/product-spec.md §3. All tables have RLS.
--
-- Write model: posts and comments are created/edited only by the server (/api/v1 with the
-- service role) after screening, rate limits and ID checks. Clients may react, save, request to
-- join, answer tags and (organisers) decide on requests directly; guard triggers pin every
-- identity / time column so those direct writes can only change what they are meant to.

-- ── Profiles: public trust badge only. Private fields live in profile_private. ──
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_id_verified BOOLEAN NOT NULL DEFAULT false;

-- Users must not self-grant ID verification (admins / service role only).
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

-- Gender and approximate home location are private: readable by the owner (and moderators)
-- only — never part of the world-readable profiles row.
CREATE TABLE IF NOT EXISTS profile_private (
  user_id    UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  gender     TEXT CHECK (gender IN ('woman', 'man', 'nonbinary', 'prefer_not')),
  home_city  TEXT CHECK (char_length(home_city) <= 80),
  home_lat   DOUBLE PRECISION CHECK (home_lat BETWEEN -90 AND 90),
  home_lng   DOUBLE PRECISION CHECK (home_lng BETWEEN -180 AND 180),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE profile_private ENABLE ROW LEVEL SECURITY;

-- ── Role helpers (spec §4: moderation = social_media_manager, chat_responder; analytics = admin;
--    custom roles via team_members.custom_permissions) ────────────────────────
CREATE OR REPLACE FUNCTION public.has_staff_permission(p_key TEXT, p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_uid AND (
      p.role = 'admin'
      OR (p_key = 'moderation' AND p.role IN ('social_media_manager', 'chat_responder'))))
    OR EXISTS (SELECT 1 FROM team_members t WHERE t.user_id = p_uid AND t.is_active AND (
      t.role = 'admin'
      OR (p_key = 'moderation' AND t.role IN ('social_media_manager', 'chat_responder'))
      OR (t.role = 'custom' AND p_key = ANY (coalesce(t.custom_permissions, '{}'))))));
$$;
CREATE OR REPLACE FUNCTION public.is_moderator(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_staff_permission('moderation', p_uid);
$$;
CREATE OR REPLACE FUNCTION public.is_admin(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = p_uid AND role = 'admin');
$$;
-- Any staff role (used only to let staff tools notify people; never for content access).
CREATE OR REPLACE FUNCTION public.is_any_staff(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = p_uid AND role <> 'user')
      OR EXISTS (SELECT 1 FROM team_members WHERE user_id = p_uid AND is_active);
$$;

CREATE OR REPLACE FUNCTION public.is_phone_verified(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_phone_verified FROM profiles WHERE id = p_uid), false);
$$;
CREATE OR REPLACE FUNCTION public.gender_of(p_uid UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT gender FROM profile_private WHERE user_id = p_uid;
$$;
REVOKE ALL ON FUNCTION public.gender_of(UUID) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.viewer_is_woman()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT gender = 'woman' FROM profile_private WHERE user_id = auth.uid()), false);
$$;

-- Internal writes (counter/notification triggers, SECURITY DEFINER workflows, the API and cron
-- with the service role) bypass the user-facing guard triggers below. `unsolo.internal` can only
-- be set by SECURITY DEFINER functions in this schema (set_config is not exposed via PostgREST).
CREATE OR REPLACE FUNCTION public.tribe_internal_write()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth.role() = 'service_role'
      OR pg_trigger_depth() > 1
      OR coalesce(current_setting('unsolo.internal', true), '') = 'on';
$$;

DROP POLICY IF EXISTS profile_private_own ON profile_private;
CREATE POLICY profile_private_own ON profile_private FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS profile_private_moderators ON profile_private;
CREATE POLICY profile_private_moderators ON profile_private FOR SELECT TO authenticated
  USING (public.is_moderator());

-- Once a person is ID-verified, gender comes from the ID: only admins / the server change it.
CREATE OR REPLACE FUNCTION public.guard_profile_private()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.role() = 'service_role' OR public.is_admin() THEN RETURN NEW; END IF;
  IF (SELECT is_id_verified FROM profiles WHERE id = NEW.user_id)
     AND (TG_OP = 'INSERT' OR NEW.gender IS DISTINCT FROM OLD.gender) THEN
    IF TG_OP = 'INSERT' AND NEW.gender IS NULL THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'gender is set from your verified ID; contact support to change it';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_profile_private ON profile_private;
CREATE TRIGGER trg_guard_profile_private BEFORE INSERT OR UPDATE ON profile_private
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_private();

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
  -- Story-only
  trip_package_id  UUID REFERENCES packages(id) ON DELETE SET NULL,
  show_on_trip_page BOOLEAN NOT NULL DEFAULT false,
  -- Ask-only: poll stored inline (small, fixed)
  poll_options     JSONB,  -- [{ "id": "a", "label": "..." }]
  accepted_comment_id UUID,
  status           TEXT NOT NULL DEFAULT 'live'
                   CHECK (status IN ('live', 'held', 'hidden', 'removed', 'cancelled', 'past')),
  moderation_flags TEXT[] NOT NULL DEFAULT '{}',
  -- Set when a host offer is accepted: the plan became this hosted trip (no more joins/offers).
  converted_package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
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

-- Women-only plans are visible only to women (and their organiser / moderators) — enforced here,
-- not just in the feed, so /posts/:id, profiles and PostgREST all agree.
DROP POLICY IF EXISTS posts_select ON posts;
CREATE POLICY posts_select ON posts FOR SELECT USING (
  (status IN ('live', 'past', 'cancelled') AND (audience <> 'women' OR public.viewer_is_woman()))
  OR author_id = auth.uid()
  OR public.is_moderator()
);
-- No INSERT policy: posts are created by the API (service role) after screening + ID checks.
DROP POLICY IF EXISTS posts_insert ON posts;
DROP POLICY IF EXISTS posts_update ON posts;
CREATE POLICY posts_update ON posts FOR UPDATE TO authenticated
  USING (public.is_moderator()) WITH CHECK (public.is_moderator());
DROP POLICY IF EXISTS posts_delete ON posts;
CREATE POLICY posts_delete ON posts FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND status IN ('live', 'cancelled', 'past'));  -- tightened in 120

-- Non-internal updates (moderators via PostgREST) may change status / flags only.
CREATE OR REPLACE FUNCTION public.guard_post_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT; v_flags TEXT[];
BEGIN
  NEW.updated_at := now();
  IF public.tribe_internal_write() THEN RETURN NEW; END IF;
  v_status := NEW.status; v_flags := NEW.moderation_flags;
  NEW := OLD;
  NEW.status := v_status; NEW.moderation_flags := v_flags; NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_post_update ON posts;
CREATE TRIGGER trg_guard_post_update BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_post_update();

-- ── plan_private: exact meeting point (organiser + approved members only) ──
CREATE TABLE IF NOT EXISTS plan_private (
  post_id       UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  meeting_point TEXT CHECK (char_length(meeting_point) <= 300),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE plan_private ENABLE ROW LEVEL SECURITY;
-- (SELECT policy is created below once plan_members + helpers exist; writes: service role only.)

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
DROP POLICY IF EXISTS post_media_write ON post_media;   -- written by the API only

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
CREATE TRIGGER trg_enforce_comment_depth BEFORE INSERT OR UPDATE OF parent_id, post_id ON post_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_comment_depth();

-- Moderators may change status only; everything else is fixed (no moving / re-parenting).
CREATE OR REPLACE FUNCTION public.guard_comment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT;
BEGIN
  NEW.updated_at := now();
  IF public.tribe_internal_write() THEN RETURN NEW; END IF;
  v_status := NEW.status;
  NEW := OLD;
  NEW.status := v_status; NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_comment_update ON post_comments;
CREATE TRIGGER trg_guard_comment_update BEFORE UPDATE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_comment_update();

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_comments_select ON post_comments;
CREATE POLICY post_comments_select ON post_comments FOR SELECT USING (
  (status = 'live' AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id))
  OR author_id = auth.uid() OR public.is_moderator()
);
-- No INSERT policy: comments are created by the API after screening, block + mute checks.
DROP POLICY IF EXISTS post_comments_insert ON post_comments;
DROP POLICY IF EXISTS post_comments_update ON post_comments;
CREATE POLICY post_comments_update ON post_comments FOR UPDATE TO authenticated
  USING (public.is_moderator()) WITH CHECK (public.is_moderator());
DROP POLICY IF EXISTS post_comments_delete ON post_comments;
CREATE POLICY post_comments_delete ON post_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND status = 'live');  -- tightened in 120

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
CREATE POLICY post_reactions_select ON post_reactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id)
);
DROP POLICY IF EXISTS post_reactions_insert ON post_reactions;  -- created in 120 (needs block / mute helpers)
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
  (state = 'accepted' AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id))
  OR user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.author_id = auth.uid())
);
DROP POLICY IF EXISTS post_tags_insert ON post_tags;   -- created by the API with the post
DROP POLICY IF EXISTS post_tags_answer ON post_tags;
CREATE POLICY post_tags_answer ON post_tags FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS post_tags_delete ON post_tags;
CREATE POLICY post_tags_delete ON post_tags FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.author_id = auth.uid())
);
CREATE OR REPLACE FUNCTION public.guard_post_tag_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.tribe_internal_write() THEN RETURN NEW; END IF;
  IF NEW.state NOT IN ('accepted', 'declined') THEN RAISE EXCEPTION 'answer with accepted or declined'; END IF;
  NEW.post_id := OLD.post_id; NEW.user_id := OLD.user_id; NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_post_tag_update ON post_tags;
CREATE TRIGGER trg_guard_post_tag_update BEFORE UPDATE ON post_tags
  FOR EACH ROW EXECUTE FUNCTION public.guard_post_tag_update();

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
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_members_user ON plan_members (user_id, state);
CREATE INDEX IF NOT EXISTS idx_plan_members_pending ON plan_members (expires_at) WHERE state = 'requested';
CREATE INDEX IF NOT EXISTS idx_plan_members_updated ON plan_members (user_id, updated_at);

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
  (state = 'approved' AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id))  -- roster follows post visibility
  OR user_id = auth.uid()
  OR public.is_plan_organiser(post_id)
  OR public.is_moderator()
);
DROP POLICY IF EXISTS plan_members_request ON plan_members;  -- created in 120 (needs block / mute helpers)
DROP POLICY IF EXISTS plan_members_update ON plan_members;
CREATE POLICY plan_members_update ON plan_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_plan_organiser(post_id))
  WITH CHECK (user_id = auth.uid() OR public.is_plan_organiser(post_id));

-- Direct requests always get a fresh 72h window and start undecided.
CREATE OR REPLACE FUNCTION public.normalize_plan_member_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.tribe_internal_write() THEN RETURN NEW; END IF;
  NEW.role := 'member'; NEW.state := 'requested'; NEW.decided_at := NULL;
  NEW.expires_at := now() + interval '72 hours'; NEW.created_at := now(); NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_normalize_plan_member_insert ON plan_members;
CREATE TRIGGER trg_normalize_plan_member_insert BEFORE INSERT ON plan_members
  FOR EACH ROW EXECUTE FUNCTION public.normalize_plan_member_insert();

-- State machine. Organiser: requested → approved / declined (while unexpired), approved → removed.
-- Requester: requested / approved → withdrawn. Identity and time columns never change.
CREATE OR REPLACE FUNCTION public.guard_plan_member_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_post posts%ROWTYPE; v_verified BOOLEAN; v_count INT;
BEGIN
  NEW.updated_at := now();
  IF public.tribe_internal_write() THEN RETURN NEW; END IF;
  NEW.post_id := OLD.post_id; NEW.user_id := OLD.user_id; NEW.role := OLD.role; NEW.intro := OLD.intro;
  NEW.created_at := OLD.created_at; NEW.expires_at := OLD.expires_at;
  IF NEW.state = OLD.state THEN NEW.decided_at := OLD.decided_at; RETURN NEW; END IF;

  -- Lock the plan row so concurrent approvals can't overfill it.
  SELECT * INTO v_post FROM posts WHERE id = OLD.post_id FOR UPDATE;
  IF v_post.author_id = auth.uid() AND OLD.user_id <> auth.uid() THEN
    IF OLD.state = 'requested' AND NEW.state IN ('approved', 'declined') THEN
      IF OLD.expires_at IS NOT NULL AND OLD.expires_at <= now() THEN RAISE EXCEPTION 'this request has expired'; END IF;
    ELSIF NOT (OLD.state = 'approved' AND NEW.state = 'removed') THEN
      RAISE EXCEPTION 'invalid decision';
    END IF;
    IF NEW.state = 'approved' THEN
      IF v_post.status <> 'live' OR v_post.converted_package_id IS NOT NULL THEN RAISE EXCEPTION 'plan is closed'; END IF;
      SELECT count(*) INTO v_count FROM plan_members WHERE post_id = OLD.post_id AND state = 'approved';
      IF v_count >= v_post.spots_total THEN RAISE EXCEPTION 'plan is full'; END IF;
      IF v_post.audience IN ('women', 'verified') THEN
        SELECT is_id_verified INTO v_verified FROM profiles WHERE id = OLD.user_id;
        IF NOT coalesce(v_verified, false) THEN RAISE EXCEPTION 'joiner must be ID-verified'; END IF;
        IF v_post.audience = 'women' AND public.gender_of(OLD.user_id) IS DISTINCT FROM 'woman' THEN
          RAISE EXCEPTION 'women-only plan';
        END IF;
      END IF;
    END IF;
    NEW.decided_at := now();
  ELSIF OLD.user_id = auth.uid() AND OLD.role = 'member' THEN
    IF NOT (OLD.state IN ('requested', 'approved') AND NEW.state = 'withdrawn') THEN
      RAISE EXCEPTION 'you can only withdraw';
    END IF;
    NEW.decided_at := now();
  ELSE
    RAISE EXCEPTION 'not allowed';
  END IF;
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

DROP POLICY IF EXISTS plan_private_select ON plan_private;
CREATE POLICY plan_private_select ON plan_private FOR SELECT TO authenticated USING (
  public.is_plan_organiser(post_id) OR public.is_plan_member(post_id) OR public.is_moderator()
);

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
  OR public.is_moderator()
);
DROP POLICY IF EXISTS host_offers_insert ON host_offers;
CREATE POLICY host_offers_insert ON host_offers FOR INSERT TO authenticated WITH CHECK (
  host_id = auth.uid() AND state = 'pending'
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_host = true)
  AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.kind = 'plan' AND p.status = 'live'
              AND p.converted_package_id IS NULL AND p.author_id <> auth.uid())
);
DROP POLICY IF EXISTS host_offers_update ON host_offers;
CREATE POLICY host_offers_update ON host_offers FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR public.is_plan_organiser(post_id))
  WITH CHECK (host_id = auth.uid() OR public.is_plan_organiser(post_id));

-- New offers always get a fresh 7-day window.
CREATE OR REPLACE FUNCTION public.normalize_host_offer_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.tribe_internal_write() THEN RETURN NEW; END IF;
  NEW.state := 'pending'; NEW.expires_at := now() + interval '7 days'; NEW.package_id := NULL; NEW.pay_by := NULL;
  NEW.created_at := now(); NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_normalize_host_offer_insert ON host_offers;
CREATE TRIGGER trg_normalize_host_offer_insert BEFORE INSERT ON host_offers
  FOR EACH ROW EXECUTE FUNCTION public.normalize_host_offer_insert();

-- Host: edit terms or withdraw while pending. Organiser: decline only (accept → accept_host_offer).
CREATE OR REPLACE FUNCTION public.guard_host_offer_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF public.tribe_internal_write() THEN RETURN NEW; END IF;
  IF OLD.state <> 'pending' THEN RAISE EXCEPTION 'offer is closed'; END IF;
  NEW.post_id := OLD.post_id; NEW.host_id := OLD.host_id; NEW.expires_at := OLD.expires_at;
  NEW.created_at := OLD.created_at; NEW.package_id := OLD.package_id; NEW.pay_by := OLD.pay_by;
  IF OLD.host_id = auth.uid() THEN
    IF NEW.state NOT IN ('pending', 'withdrawn') THEN RAISE EXCEPTION 'not allowed'; END IF;
  ELSIF public.is_plan_organiser(OLD.post_id) THEN
    IF NEW.state <> 'declined' THEN RAISE EXCEPTION 'use accept_host_offer'; END IF;
    NEW.price_paise := OLD.price_paise; NEW.includes := OLD.includes; NEW.notes := OLD.notes;
    NEW.extra_seats := OLD.extra_seats;
  ELSE
    RAISE EXCEPTION 'not allowed';
  END IF;
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

-- ── Realtime for live counters in feed/detail (no private columns on these tables) ──
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE posts;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE post_comments;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;
