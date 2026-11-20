-- 121 · Platform: push device tokens, user preferences (landing tab, notification
-- channels, suggestion consent), analytics events, feature flags, feed + suggestion
-- functions, plan → hosted trip conversion and expiry jobs.

-- ── SECURITY FIX: platform_settings was writable by anyone (USING (true)) ───
DROP POLICY IF EXISTS "Admins can update settings" ON platform_settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON platform_settings;
CREATE POLICY platform_settings_admin_update ON platform_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY platform_settings_admin_insert ON platform_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Feature flags / kill switches read by every client via GET /api/v1/config
INSERT INTO platform_settings (key, value, description) VALUES
  ('tribe_enabled', 'true', 'Show the Tribe community tab on web and apps'),
  ('tribe_rollout_percent', '100', 'Percent of signed-in users who see Tribe (0–100)'),
  ('tribe_posting_enabled', 'true', 'Allow new Tribe posts (turn off during incidents)'),
  ('host_offers_enabled', 'true', 'Allow hosts to offer to run community plans'),
  ('push_enabled', 'true', 'Send push notifications (FCM / APNs / Web Push)'),
  ('min_app_version_android', '1', 'Force-update below this versionCode'),
  ('min_app_version_ios', '1', 'Force-update below this build number')
ON CONFLICT (key) DO NOTHING;

-- ── device_tokens ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  token        TEXT NOT NULL CHECK (char_length(token) <= 4096),   -- FCM/APNs token or Web Push subscription JSON
  app_version  TEXT,
  locale       TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, token)
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens (user_id);
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS device_tokens_own ON device_tokens;
CREATE POLICY device_tokens_own ON device_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── user_preferences ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id             UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  landing_tab         TEXT NOT NULL DEFAULT 'explore' CHECK (landing_tab IN ('explore', 'tribe', 'trips')),
  landing_prompt_dismissed_at TIMESTAMPTZ,
  -- { "push": { "plans": true, "replies": true, "messages": true, "trips": true, "offers": true, "marketing": false },
  --   "email": { ... }, "quiet_hours": { "from": "22:00", "to": "07:00" } }
  notify              JSONB NOT NULL DEFAULT '{
    "push":  {"plans": true, "replies": true, "messages": true, "trips": true, "tags": true, "marketing": false},
    "email": {"plans": true, "replies": false, "messages": false, "trips": true, "tags": true, "marketing": false},
    "quiet_hours": {"from": "22:00", "to": "07:00"}
  }',
  interests           TEXT[] NOT NULL DEFAULT '{}',   -- trek, beach, spiritual, roadtrip, food, wildlife, culture, party, budget, luxury
  suggest_by_location BOOLEAN NOT NULL DEFAULT true,
  suggest_by_gender   BOOLEAN NOT NULL DEFAULT false,  -- opt-in: show women-only plans / women hosts first
  share_location      BOOLEAN NOT NULL DEFAULT false,  -- approximate home location kept in profile_private (cleared when off)
  data_saver          BOOLEAN NOT NULL DEFAULT false,  -- low-res images only, no autoplay
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_preferences_own ON user_preferences;
CREATE POLICY user_preferences_own ON user_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── analytics_events (append-only; written through /api/v1/events) ───────
CREATE TABLE IF NOT EXISTS analytics_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  anon_id    TEXT CHECK (char_length(anon_id) <= 64),
  session_id TEXT CHECK (char_length(session_id) <= 64),
  name       TEXT NOT NULL CHECK (name ~ '^[a-z][a-z0-9_.]{1,63}$'),
  screen     TEXT CHECK (char_length(screen) <= 80),
  platform   TEXT NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  app_version TEXT,
  props      JSONB NOT NULL DEFAULT '{}' CHECK (pg_column_size(props) <= 4096),
  ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_ts ON analytics_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_ts ON analytics_events (name, ts DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events (user_id, ts DESC);
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analytics_events_staff_read ON analytics_events;
CREATE POLICY analytics_events_staff_read ON analytics_events FOR SELECT USING (public.has_staff_permission('analytics'));
-- No insert policy: the API validates + inserts with the service role.

-- Daily rollup for the admin analytics page (fast to query, cheap to keep).
CREATE OR REPLACE FUNCTION public.admin_analytics_overview(p_days INT DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v JSONB; v_since TIMESTAMPTZ := now() - make_interval(days => p_days);
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_staff_permission('analytics') THEN RAISE EXCEPTION 'staff only'; END IF;
  SELECT jsonb_build_object(
    'range_days', p_days,
    'dau', (SELECT count(DISTINCT coalesce(user_id::text, anon_id)) FROM analytics_events WHERE ts > now() - interval '1 day'),
    'wau', (SELECT count(DISTINCT coalesce(user_id::text, anon_id)) FROM analytics_events WHERE ts > now() - interval '7 days'),
    'mau', (SELECT count(DISTINCT coalesce(user_id::text, anon_id)) FROM analytics_events WHERE ts > now() - interval '30 days'),
    'signups', (SELECT count(*) FROM profiles WHERE created_at > v_since),
    'bookings', (SELECT count(*) FROM bookings WHERE created_at > v_since AND status IN ('confirmed', 'completed')),
    'gmv_paise', (SELECT coalesce(sum(total_amount_paise), 0) FROM bookings WHERE created_at > v_since AND status IN ('confirmed', 'completed')),
    'posts', (SELECT jsonb_object_agg(kind, n) FROM (SELECT kind, count(*) n FROM posts WHERE created_at > v_since GROUP BY kind) k),
    'weekly_posters_pct', (
      SELECT CASE WHEN wau = 0 THEN 0 ELSE round(100.0 * posters / wau, 1) END FROM (
        SELECT (SELECT count(DISTINCT author_id) FROM posts WHERE created_at > now() - interval '7 days') posters,
               (SELECT count(DISTINCT user_id) FROM analytics_events WHERE ts > now() - interval '7 days' AND user_id IS NOT NULL) wau) x),
    'plan_fill_rate_pct', (
      SELECT CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(*) FILTER (WHERE member_count > 1) / count(*), 1) END
      FROM posts WHERE kind = 'plan' AND created_at BETWEEN v_since AND now() - interval '7 days'),
    'asks_answered_pct', (
      SELECT CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(*) FILTER (WHERE comment_count > 0) / count(*), 1) END
      FROM posts WHERE kind = 'ask' AND created_at > v_since),
    'median_first_reply_hours', (
      SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM fr - p.created_at) / 3600))::numeric, 1)
      FROM posts p CROSS JOIN LATERAL (SELECT min(c.created_at) fr FROM post_comments c WHERE c.post_id = p.id AND c.author_id <> p.author_id) f
      WHERE p.created_at > v_since AND fr IS NOT NULL),
    'reports_per_1k_posts', (
      SELECT CASE WHEN (SELECT count(*) FROM posts WHERE created_at > v_since) = 0 THEN 0
             ELSE round(1000.0 * (SELECT count(*) FROM reports WHERE created_at > v_since) / (SELECT count(*) FROM posts WHERE created_at > v_since), 1) END),
    'open_reports', (SELECT count(*) FROM reports WHERE state IN ('open', 'in_review')),
    'overdue_reports', (SELECT count(*) FROM reports WHERE state IN ('open', 'in_review') AND due_at < now()),
    'plans_converted', (SELECT count(*) FROM host_offers WHERE state = 'accepted' AND updated_at > v_since),
    'platform_split', (SELECT jsonb_object_agg(platform, n) FROM (SELECT platform, count(DISTINCT coalesce(user_id::text, anon_id)) n FROM analytics_events WHERE ts > v_since GROUP BY platform) s),
    'daily', (SELECT coalesce(jsonb_agg(d ORDER BY d->>'day'), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'day', to_char(day, 'YYYY-MM-DD'),
        'active', (SELECT count(DISTINCT coalesce(user_id::text, anon_id)) FROM analytics_events WHERE ts >= day AND ts < day + interval '1 day'),
        'posts', (SELECT count(*) FROM posts WHERE created_at >= day AND created_at < day + interval '1 day'),
        'bookings', (SELECT count(*) FROM bookings WHERE created_at >= day AND created_at < day + interval '1 day' AND status IN ('confirmed', 'completed')),
        'signups', (SELECT count(*) FROM profiles WHERE created_at >= day AND created_at < day + interval '1 day')
      ) d
      FROM generate_series(date_trunc('day', v_since), date_trunc('day', now()), interval '1 day') day) days),
    'top_screens', (SELECT coalesce(jsonb_agg(jsonb_build_object('screen', screen, 'views', n)), '[]'::jsonb) FROM (
      SELECT screen, count(*) n FROM analytics_events WHERE name = 'screen.view' AND ts > v_since AND screen IS NOT NULL
      GROUP BY screen ORDER BY n DESC LIMIT 10) t),
    'funnel', jsonb_build_object(
      'trip_viewed', (SELECT count(DISTINCT coalesce(user_id::text, anon_id)) FROM analytics_events WHERE name = 'trip.view' AND ts > v_since),
      'seat_tapped', (SELECT count(DISTINCT coalesce(user_id::text, anon_id)) FROM analytics_events WHERE name = 'trip.take_seat' AND ts > v_since),
      'paid', (SELECT count(DISTINCT user_id) FROM bookings WHERE created_at > v_since AND status IN ('confirmed', 'completed')))
  ) INTO v;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.admin_analytics_overview(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_analytics_overview(INT) TO authenticated, service_role;

-- ── Feed (ranked by destination + date, not recency alone) ────────────────
-- Returns live posts the viewer can see, excluding blocked authors. Ranking:
-- upcoming plans near their start date and close to the viewer first, then recency
-- with a small engagement boost. Cursor = (score, id) keyset.
CREATE OR REPLACE FUNCTION public.tribe_feed(
  p_kind TEXT DEFAULT NULL,         -- plan | story | ask | NULL (For you)
  p_place TEXT DEFAULT NULL,        -- place_slug filter
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_before_score DOUBLE PRECISION DEFAULT NULL,
  p_before_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_as_of TIMESTAMPTZ DEFAULT NULL  -- fixed by the first page so later pages don't shift
) RETURNS TABLE (post_id UUID, score DOUBLE PRECISION)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH viewer AS (
    SELECT auth.uid() AS uid,
           (SELECT gender FROM profile_private WHERE user_id = auth.uid()) AS gender,
           coalesce((SELECT suggest_by_gender FROM user_preferences WHERE user_id = auth.uid()), false) AS by_gender,
           coalesce(p_as_of, now()) AS t
  ), scored AS (
    SELECT p.id,
      -- recency: halves every 3 days
      exp(-greatest(extract(epoch FROM v.t - p.created_at), 0) / (3 * 86400.0)) * 10
      -- upcoming plans: boost when starting in the next 45 days
      + CASE WHEN p.kind = 'plan' AND p.starts_on >= v.t::date
             THEN 6 * greatest(0, 1 - (p.starts_on - v.t::date) / 45.0) ELSE 0 END
      -- distance boost (≤ 300 km) when the viewer shared a location
      + CASE WHEN p_lat IS NOT NULL AND p.lat IS NOT NULL
             THEN 4 * greatest(0, 1 - (111.0 * sqrt(power(p.lat - p_lat, 2) + power((p.lng - p_lng) * cos(radians(p_lat)), 2))) / 300.0)
             ELSE 0 END
      -- engagement (log-damped, no vanity loops)
      + ln(1 + p.comment_count + coalesce((p.reaction_counts->>'helpful')::int, 0)
             + coalesce((p.reaction_counts->>'want_to_go')::int, 0)) * 0.8
      -- opt-in gender match: women-only plans for women who asked for it
      + CASE WHEN v.by_gender AND v.gender = 'woman' AND p.audience = 'women' THEN 3 ELSE 0 END
      -- open spots still available
      + CASE WHEN p.kind = 'plan' AND p.member_count < p.spots_total THEN 1 ELSE 0 END
      AS score
    FROM posts p CROSS JOIN viewer v
    WHERE p.status = 'live'
      AND p.created_at <= v.t
      AND (p_kind IS NULL OR p.kind = p_kind)
      AND (p_place IS NULL OR p.place_slug = p_place)
      AND (p.kind <> 'plan' OR coalesce(p.ends_on, p.starts_on) >= v.t::date)
      AND (v.uid IS NULL OR NOT EXISTS (
            SELECT 1 FROM user_blocks b
            WHERE (b.blocker_id = v.uid AND b.blocked_id = p.author_id)
               OR (b.blocker_id = p.author_id AND b.blocked_id = v.uid)))
      -- (women-only visibility is also enforced by posts RLS)
      AND (p.audience <> 'women' OR v.gender = 'woman' OR p.author_id = v.uid)
  )
  SELECT id, score FROM scored
  WHERE p_before_score IS NULL OR (score, id) < (p_before_score, p_before_id)
  ORDER BY score DESC, id DESC
  LIMIT least(greatest(p_limit, 1), 50);
$$;
GRANT EXECUTE ON FUNCTION public.tribe_feed(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, UUID, INT, TIMESTAMPTZ)
  TO anon, authenticated;

-- ── Suggestions: plans + departures near you / on your interests ──────────
CREATE OR REPLACE FUNCTION public.suggest_for_user(
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_limit INT DEFAULT 12
) RETURNS TABLE (item_type TEXT, item_id UUID, reason TEXT, score DOUBLE PRECISION)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH viewer AS (
    SELECT auth.uid() AS uid,
      coalesce(p_lat, (SELECT home_lat FROM profile_private WHERE user_id = auth.uid())) AS lat,
      coalesce(p_lng, (SELECT home_lng FROM profile_private WHERE user_id = auth.uid())) AS lng,
      (SELECT gender FROM profile_private WHERE user_id = auth.uid()) AS gender,
      coalesce((SELECT suggest_by_gender FROM user_preferences WHERE user_id = auth.uid()), false) AS by_gender,
      coalesce((SELECT suggest_by_location FROM user_preferences WHERE user_id = auth.uid()), true) AS by_location,
      coalesce((SELECT interests FROM user_preferences WHERE user_id = auth.uid()), '{}') AS interests
  ), plans AS (
    SELECT 'plan'::text, p.id,
      CASE WHEN v.by_gender AND v.gender = 'woman' AND p.audience = 'women' THEN 'Women-only plan'
           WHEN v.by_location AND v.lat IS NOT NULL AND p.lat IS NOT NULL
                AND 111.0 * sqrt(power(p.lat - v.lat, 2) + power((p.lng - v.lng) * cos(radians(v.lat)), 2)) < 150
             THEN 'Near you'
           ELSE 'Open spots' END,
      6 * greatest(0, 1 - (p.starts_on - current_date) / 60.0)
      + CASE WHEN v.by_location AND v.lat IS NOT NULL AND p.lat IS NOT NULL
             THEN 5 * greatest(0, 1 - (111.0 * sqrt(power(p.lat - v.lat, 2) + power((p.lng - v.lng) * cos(radians(v.lat)), 2))) / 400.0)
             ELSE 0 END
      + CASE WHEN v.by_gender AND v.gender = 'woman' AND p.audience = 'women' THEN 4 ELSE 0 END
    FROM posts p CROSS JOIN viewer v
    WHERE p.kind = 'plan' AND p.status = 'live' AND p.starts_on >= current_date
      AND p.converted_package_id IS NULL
      AND p.member_count < p.spots_total
      AND (v.uid IS NULL OR p.author_id <> v.uid)
      AND (p.audience <> 'women' OR v.gender = 'woman')
      AND (v.uid IS NULL OR NOT EXISTS (SELECT 1 FROM plan_members m WHERE m.post_id = p.id AND m.user_id = v.uid))
  ), trips AS (
    SELECT 'trip'::text, k.id,
      CASE WHEN array_length(v.interests, 1) > 0 AND k.title ILIKE ANY (SELECT '%' || i || '%' FROM unnest(v.interests) i)
           THEN 'Matches your interests' ELSE 'Leaving soon' END,
      4 * greatest(0, 1 - ((SELECT min(d) FROM unnest(k.departure_dates) d WHERE d >= current_date) - current_date) / 60.0)
      + CASE WHEN k.is_featured THEN 1 ELSE 0 END
    FROM packages k CROSS JOIN viewer v
    WHERE k.is_active AND coalesce(k.moderation_status, 'approved') = 'approved'
      AND EXISTS (SELECT 1 FROM unnest(k.departure_dates) d WHERE d >= current_date)
  )
  SELECT * FROM (SELECT * FROM plans UNION ALL SELECT * FROM trips) s
  ORDER BY 4 DESC LIMIT least(greatest(p_limit, 1), 30);
$$;
GRANT EXECUTE ON FUNCTION public.suggest_for_user(DOUBLE PRECISION, DOUBLE PRECISION, INT) TO anon, authenticated;

-- ── Plan → hosted trip (atomic) ───────────────────────────────────────────
-- Organiser accepts an offer: a package is created for the host with the plan's
-- dates; every approved member gets a held seat (approved join_request with a 48h
-- payment deadline, the existing peer-hosting flow); other offers are declined; the
-- plan chat becomes the trip chat.
CREATE OR REPLACE FUNCTION public.accept_host_offer(p_offer_id UUID, p_expected_price_paise INTEGER)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_offer host_offers%ROWTYPE; v_post posts%ROWTYPE; v_pkg UUID; v_days INT; v_slug TEXT;
        v_host_name TEXT; v_images TEXT[];
BEGIN
  SELECT * INTO v_offer FROM host_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'offer not found'; END IF;
  SELECT * INTO v_post FROM posts WHERE id = v_offer.post_id FOR UPDATE;
  IF v_post.author_id <> auth.uid() THEN RAISE EXCEPTION 'only the organiser can accept'; END IF;
  IF v_post.kind <> 'plan' THEN RAISE EXCEPTION 'only plans can be hosted'; END IF;
  IF v_offer.state <> 'pending' OR v_offer.expires_at < now() THEN RAISE EXCEPTION 'offer is no longer open'; END IF;
  IF v_post.status <> 'live' THEN RAISE EXCEPTION 'plan is not live'; END IF;
  IF v_post.converted_package_id IS NOT NULL THEN RAISE EXCEPTION 'this plan already became a hosted trip'; END IF;
  -- The organiser accepts the terms they saw: a host can't raise the price at the last second.
  IF v_offer.price_paise IS DISTINCT FROM p_expected_price_paise THEN
    RAISE EXCEPTION 'the host changed this offer; review the new price';
  END IF;
  PERFORM set_config('unsolo.internal', 'on', true);   -- transaction-local: bypass user guards

  v_days := greatest(coalesce(v_post.ends_on - v_post.starts_on + 1, 1), 1);
  v_slug := 'plan-' || substr(replace(v_post.id::text, '-', ''), 1, 10);
  SELECT coalesce(full_name, username) INTO v_host_name FROM profiles WHERE id = v_offer.host_id;
  SELECT coalesce(array_agg(url ORDER BY position), '{}') INTO v_images FROM post_media WHERE post_id = v_post.id;

  INSERT INTO packages (title, slug, description, short_description, price_paise, duration_days,
                        trip_days, trip_nights, max_group_size, includes, images, host_id,
                        departure_dates, return_dates, is_active, moderation_status)
  VALUES (coalesce(v_post.title, v_post.place_name || ' with ' || v_host_name),
          v_slug,
          coalesce(nullif(v_offer.notes, ''), v_post.body),
          left(coalesce(v_post.title, v_post.place_name) || ' · hosted by ' || v_host_name, 160),
          v_offer.price_paise, v_days, v_days, greatest(v_days - 1, 0),
          v_post.spots_total + v_offer.extra_seats, v_offer.includes, v_images, v_offer.host_id,
          ARRAY[v_post.starts_on], ARRAY[coalesce(v_post.ends_on, v_post.starts_on)], true, 'approved')
  RETURNING id INTO v_pkg;

  UPDATE host_offers SET state = 'accepted', package_id = v_pkg, pay_by = now() + interval '48 hours'
   WHERE id = p_offer_id;
  UPDATE host_offers SET state = 'declined' WHERE post_id = v_post.id AND id <> p_offer_id AND state = 'pending';

  INSERT INTO join_requests (trip_id, user_id, status, message, payment_deadline)
  SELECT v_pkg, m.user_id, 'approved', 'From community plan', now() + interval '48 hours'
  FROM plan_members m WHERE m.post_id = v_post.id AND m.state = 'approved'
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  UPDATE chat_rooms SET package_id = v_pkg WHERE post_id = v_post.id;
  INSERT INTO chat_room_members (room_id, user_id)
  SELECT r.id, v_offer.host_id FROM chat_rooms r WHERE r.post_id = v_post.id
  ON CONFLICT (room_id, user_id) DO NOTHING;

  UPDATE posts SET converted_package_id = v_pkg WHERE id = v_post.id;
  -- Pending join requests can't be honoured on the paid trip: close them.
  UPDATE plan_members SET state = 'expired' WHERE post_id = v_post.id AND state = 'requested';

  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  SELECT m.user_id, 'tribe_plan_converted',
         coalesce(v_post.title, v_post.place_name) || ' is now a hosted trip',
         'Your seat is held for 48 hours. Pay to confirm it.',
         '/packages/' || v_slug,
         jsonb_build_object('post_id', v_post.id, 'package_id', v_pkg, 'category', 'trips')
  FROM plan_members m WHERE m.post_id = v_post.id AND m.state = 'approved' AND m.user_id <> v_post.author_id
  UNION ALL
  SELECT v_offer.host_id, 'tribe_offer_accepted', 'Your offer was accepted',
         'Seats are held for 48 hours.', '/host/' || v_pkg,
         jsonb_build_object('post_id', v_post.id, 'package_id', v_pkg, 'category', 'trips');

  INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'tribe.accept_host_offer', 'package', v_pkg::text,
          jsonb_build_object('offer_id', p_offer_id, 'post_id', v_post.id));
  PERFORM set_config('unsolo.internal', '', true);
  RETURN v_pkg;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  RAISE EXCEPTION 'accept_host_offer: schema mismatch (%), check packages/audit_logs columns', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public.accept_host_offer(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_host_offer(UUID, INTEGER) TO authenticated;

-- ── Expiry jobs (called by /api/cron/cleanup) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_tribe_items()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req INT; v_off INT; v_past INT;
BEGIN
  PERFORM set_config('unsolo.internal', 'on', true);
  UPDATE plan_members SET state = 'expired' WHERE state = 'requested' AND expires_at < now();
  GET DIAGNOSTICS v_req = ROW_COUNT;
  UPDATE host_offers SET state = 'expired' WHERE state = 'pending' AND expires_at < now();
  GET DIAGNOSTICS v_off = ROW_COUNT;
  UPDATE posts SET status = 'past'
   WHERE kind = 'plan' AND status = 'live' AND coalesce(ends_on, starts_on) < current_date;
  GET DIAGNOSTICS v_past = ROW_COUNT;
  DELETE FROM rate_limits WHERE window_start < now() - interval '2 days';
  PERFORM set_config('unsolo.internal', '', true);
  RETURN jsonb_build_object('requests_expired', v_req, 'offers_expired', v_off, 'plans_past', v_past);
END $$;
REVOKE ALL ON FUNCTION public.expire_tribe_items() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_tribe_items() TO service_role;

-- ── Delta sync for offline clients: what changed since a timestamp ────────
-- SECURITY DEFINER so "removed" can include posts the caller can no longer read (ids only, so
-- caches can drop them); every other list is scoped to the caller explicitly.
CREATE OR REPLACE FUNCTION public.sync_changes(p_since TIMESTAMPTZ)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
    'server_time', now(),
    'posts', (SELECT coalesce(jsonb_agg(x.id), '[]') FROM (
              SELECT p.id FROM posts p
              WHERE p.updated_at > p_since AND p.status NOT IN ('hidden', 'removed')
                AND (p.author_id = auth.uid()
                     OR EXISTS (SELECT 1 FROM plan_members m WHERE m.post_id = p.id AND m.user_id = auth.uid())
                     OR EXISTS (SELECT 1 FROM saved_posts s WHERE s.post_id = p.id AND s.user_id = auth.uid()))
              LIMIT 500) x),
    'removed_posts', (SELECT coalesce(jsonb_agg(x.id), '[]') FROM (
              SELECT p.id FROM posts p
              WHERE p.updated_at > p_since AND p.status IN ('hidden', 'removed') AND p.author_id <> auth.uid()
              LIMIT 500) x),
    'notifications', (SELECT count(*) FROM notifications n WHERE n.user_id = auth.uid() AND n.created_at > p_since),
    'unread_notifications', (SELECT count(*) FROM notifications n WHERE n.user_id = auth.uid() AND NOT n.is_read),
    'memberships', (SELECT coalesce(jsonb_agg(jsonb_build_object('post_id', m.post_id, 'state', m.state)), '[]')
              FROM plan_members m WHERE m.user_id = auth.uid() AND m.updated_at > p_since)
  ) END;
$$;
REVOKE ALL ON FUNCTION public.sync_changes(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_changes(TIMESTAMPTZ) TO authenticated;

-- ── Chat: idempotent sends from offline apps ─────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_id ON messages (user_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages (room_id, created_at DESC);

-- ── SECURITY FIX: these SECURITY DEFINER functions trusted the caller-supplied user id, so any
-- signed-in user could create DM rooms between two other people (and add them) or write read
-- receipts as someone else. Callers in src/ already pass their own id; require that.
CREATE OR REPLACE FUNCTION get_or_create_dm_room(user_a UUID, user_b UUID)
RETURNS UUID AS $$
DECLARE
  v_room_id UUID;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM user_a THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF user_a = user_b THEN RAISE EXCEPTION 'cannot message yourself'; END IF;
  IF public.is_blocked_between(user_a, user_b) THEN RAISE EXCEPTION 'not allowed'; END IF;

  SELECT cr.id INTO v_room_id
  FROM chat_rooms cr
  WHERE cr.type = 'direct'
    AND EXISTS (SELECT 1 FROM chat_room_members crm WHERE crm.room_id = cr.id AND crm.user_id = user_a)
    AND EXISTS (SELECT 1 FROM chat_room_members crm2 WHERE crm2.room_id = cr.id AND crm2.user_id = user_b);

  IF v_room_id IS NOT NULL THEN
    RETURN v_room_id;
  END IF;

  INSERT INTO chat_rooms (name, type, created_by, is_active)
  VALUES ('Direct Message', 'direct', user_a, true)
  RETURNING id INTO v_room_id;

  INSERT INTO chat_room_members (room_id, user_id) VALUES (v_room_id, user_a);
  INSERT INTO chat_room_members (room_id, user_id) VALUES (v_room_id, user_b);

  RETURN v_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION mark_room_messages_read(p_room_id UUID, p_user_id UUID)
RETURNS void AS $$
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
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
  UPDATE chat_room_members SET last_read = now() WHERE room_id = p_room_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
