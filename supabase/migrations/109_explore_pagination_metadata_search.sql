-- Indexed listing metadata and stable server-side Explore pages.
BEGIN;

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS search_document tsvector;

ALTER TABLE public.service_listings
  ADD COLUMN IF NOT EXISTS search_document tsvector;

CREATE OR REPLACE FUNCTION public.refresh_explore_search_document()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'packages' THEN
    NEW.search_document :=
      setweight(to_tsvector('simple'::regconfig, coalesce(NEW.title, '')), 'A') ||
      setweight(to_tsvector('simple'::regconfig, coalesce(NEW.short_description, '')), 'B') ||
      setweight(to_tsvector('simple'::regconfig, coalesce(NEW.description, '')), 'C') ||
      setweight(to_tsvector('simple'::regconfig, coalesce(NEW.difficulty, '') || ' ' ||
        coalesce(array_to_string(NEW.includes, ' '), '') || ' ' || coalesce(NEW.join_preferences::text, '') || ' ' ||
        coalesce(NEW.metadata::text, '')), 'D');
  ELSE
    NEW.search_document :=
      setweight(to_tsvector('simple'::regconfig, coalesce(NEW.title, '')), 'A') ||
      setweight(to_tsvector('simple'::regconfig, coalesce(NEW.short_description, '')), 'B') ||
      setweight(to_tsvector('simple'::regconfig, coalesce(NEW.description, '') || ' ' || coalesce(NEW.location, '')), 'C') ||
      setweight(to_tsvector('simple'::regconfig, coalesce(array_to_string(NEW.tags, ' '), '') || ' ' ||
        coalesce(array_to_string(NEW.amenities, ' '), '') || ' ' || coalesce(NEW.metadata::text, '')), 'D');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS packages_refresh_search_document ON public.packages;
CREATE TRIGGER packages_refresh_search_document BEFORE INSERT OR UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.refresh_explore_search_document();
DROP TRIGGER IF EXISTS service_listings_refresh_search_document ON public.service_listings;
CREATE TRIGGER service_listings_refresh_search_document BEFORE INSERT OR UPDATE ON public.service_listings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_explore_search_document();

-- Backfill existing rows; preserve historical updated_at despite the legacy
-- packages_updated_at trigger. Retain its prior enabled/disabled mode.
DO $$
DECLARE timestamp_trigger_state text;
BEGIN
  SELECT tgenabled::text INTO timestamp_trigger_state
  FROM pg_trigger
  WHERE tgrelid = 'public.packages'::regclass AND tgname = 'packages_updated_at' AND NOT tgisinternal;
  IF timestamp_trigger_state IS NOT NULL AND timestamp_trigger_state <> 'D' THEN
    ALTER TABLE public.packages DISABLE TRIGGER packages_updated_at;
  END IF;
  UPDATE public.packages SET search_document = NULL;
  IF timestamp_trigger_state = 'A' THEN
    ALTER TABLE public.packages ENABLE ALWAYS TRIGGER packages_updated_at;
  ELSIF timestamp_trigger_state = 'R' THEN
    ALTER TABLE public.packages ENABLE REPLICA TRIGGER packages_updated_at;
  ELSIF timestamp_trigger_state = 'O' THEN
    ALTER TABLE public.packages ENABLE TRIGGER packages_updated_at;
  END IF;
END $$;
UPDATE public.service_listings SET search_document = NULL;

CREATE INDEX IF NOT EXISTS idx_packages_search_document
  ON public.packages USING gin(search_document) WHERE is_active IS TRUE;
CREATE INDEX IF NOT EXISTS idx_service_listings_search_document
  ON public.service_listings USING gin(search_document) WHERE is_active IS TRUE;

CREATE INDEX IF NOT EXISTS idx_reviews_package_id_explore ON public.reviews(package_id) WHERE package_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_wander_trip_candidate_metrics(p_package_ids uuid[])
RETURNS TABLE(package_id uuid, average_rating numeric, review_count bigint, booked_guests bigint, interest_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH ids AS (SELECT DISTINCT unnest(coalesce(p_package_ids, '{}'::uuid[])) AS id),
  review_metrics AS (
    SELECT r.package_id, round(avg(r.rating)::numeric, 1) AS average_rating, count(*) AS review_count
    FROM public.reviews r JOIN ids i ON i.id = r.package_id
    WHERE r.rating IS NOT NULL GROUP BY r.package_id
  ), booking_metrics AS (
    SELECT b.package_id, sum(greatest(coalesce(b.guests, 1), 1))::bigint AS booked_guests
    FROM public.bookings b JOIN ids i ON i.id = b.package_id
    WHERE b.status IN ('confirmed', 'completed') GROUP BY b.package_id
  ), interest_metrics AS (
    SELECT pi.package_id, count(*) AS interest_count
    FROM public.package_interests pi JOIN ids i ON i.id = pi.package_id
    GROUP BY pi.package_id
  )
  SELECT i.id, coalesce(r.average_rating, 0), coalesce(r.review_count, 0),
    coalesce(b.booked_guests, 0), coalesce(p.interest_count, 0)
  FROM ids i
  LEFT JOIN review_metrics r ON r.package_id = i.id
  LEFT JOIN booking_metrics b ON b.package_id = i.id
  LEFT JOIN interest_metrics p ON p.package_id = i.id;
$$;
REVOKE ALL ON FUNCTION public.get_wander_trip_candidate_metrics(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_wander_trip_candidate_metrics(uuid[]) TO service_role;

-- Count and page are computed from the same visible, filtered trip set. Search
-- includes JSONB metadata and joined destination names; interest filtering uses
-- only the caller's auth.uid(), never a client-supplied user id.
CREATE OR REPLACE FUNCTION public.search_explore_packages_page(
  p_search text DEFAULT NULL,
  p_trip_source text DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_min_price_paise integer DEFAULT NULL,
  p_max_price_paise integer DEFAULT NULL,
  p_min_days integer DEFAULT NULL,
  p_max_days integer DEFAULT NULL,
  p_month integer DEFAULT NULL,
  p_interested_only boolean DEFAULT false,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 24
)
RETURNS TABLE(listing jsonb, total_count bigint)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH filtered AS MATERIALIZED (
    SELECT p.id
    FROM public.packages p
    LEFT JOIN public.destinations d ON d.id = p.destination_id
    WHERE p.is_active IS TRUE
      AND (p_trip_source IS NULL OR p_trip_source = '' OR
        (p_trip_source = 'community' AND p.host_id IS NOT NULL) OR
        (p_trip_source = 'unsolo' AND p.host_id IS NULL))
      AND (p_difficulty IS NULL OR p.difficulty = p_difficulty)
      AND (p_min_price_paise IS NULL OR p.price_paise >= p_min_price_paise)
      AND (p_max_price_paise IS NULL OR p.price_paise <= p_max_price_paise)
      AND (p_min_days IS NULL OR p.duration_days >= p_min_days)
      AND (p_max_days IS NULL OR p.duration_days <= p_max_days)
      AND (p_search IS NULL OR btrim(p_search) = '' OR
        p.search_document @@ websearch_to_tsquery('simple', btrim(p_search)) OR
        strpos(lower(coalesce(d.name, '')), lower(btrim(p_search))) > 0 OR
        strpos(lower(coalesce(d.state, '')), lower(btrim(p_search))) > 0)
      AND (p_month IS NULL OR EXISTS (
        SELECT 1 FROM unnest(coalesce(p.departure_dates, '{}'::date[])) AS dep(date)
        WHERE extract(month FROM dep.date)::integer = p_month + 1
          AND NOT (dep.date = ANY(coalesce(p.departure_dates_closed, '{}'::date[])))
      ))
      AND (NOT coalesce(p_interested_only, false) OR
        (auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.package_interests pi
          WHERE pi.package_id = p.id AND pi.user_id = auth.uid()
        )))
  ),
  booking_metrics AS (
    SELECT b.package_id, sum(greatest(coalesce(b.guests, 1), 1))::bigint AS booked_guests
    FROM public.bookings b JOIN filtered f ON f.id = b.package_id
    WHERE b.user_id = auth.uid() AND b.status IN ('confirmed', 'completed')
    GROUP BY b.package_id
  ),
  interest_metrics AS (
    SELECT pi.package_id, count(*)::bigint AS interest_count
    FROM public.package_interests pi JOIN filtered f ON f.id = pi.package_id
    GROUP BY pi.package_id
  ),
  ranked AS (
    SELECT f.id, coalesce(b.booked_guests, 0) + coalesce(i.interest_count, 0) AS popularity
    FROM filtered f
    LEFT JOIN booking_metrics b ON b.package_id = f.id
    LEFT JOIN interest_metrics i ON i.package_id = f.id
  ),
  page_rows AS MATERIALIZED (
    SELECT (to_jsonb(p) - 'search_document') || jsonb_build_object(
      'destination', CASE WHEN d.id IS NULL THEN NULL ELSE to_jsonb(d) END,
      'host', CASE WHEN h.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', h.id, 'username', h.username, 'full_name', h.full_name,
        'avatar_url', h.avatar_url, 'bio', h.bio, 'host_rating', h.host_rating,
        'is_verified', h.is_verified, 'total_hosted_trips', h.total_hosted_trips
      ) END
    ) AS listing,
    p.is_featured, r.popularity, p.created_at, p.id
    FROM filtered f
    JOIN public.packages p ON p.id = f.id
    JOIN ranked r ON r.id = p.id
    LEFT JOIN public.destinations d ON d.id = p.destination_id
    LEFT JOIN public.profiles h ON h.id = p.host_id
    ORDER BY p.is_featured DESC NULLS LAST, r.popularity DESC, p.created_at DESC, p.id ASC
    LIMIT greatest(1, least(coalesce(p_page_size, 24), 48))
    OFFSET (greatest(coalesce(p_page, 1), 1) - 1) * greatest(1, least(coalesce(p_page_size, 24), 48))
  ),
  counts AS (SELECT count(*) AS total_count FROM filtered)
  SELECT r.listing, c.total_count
  FROM counts c LEFT JOIN page_rows r ON true
  ORDER BY r.is_featured DESC NULLS LAST, r.popularity DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id ASC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.search_explore_packages_page(text, text, text, integer, integer, integer, integer, integer, boolean, integer, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_explore_search_document() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_explore_packages_page(text, text, text, integer, integer, integer, integer, integer, boolean, integer, integer)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;