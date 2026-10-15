-- Compact public hero metrics: aggregate on Postgres instead of shipping every
-- package, listing and review row to the application server on cache misses.
BEGIN;

-- The rating strip only needs the newest raters; keep that bounded read indexable.
CREATE INDEX IF NOT EXISTS idx_reviews_hero_recent
  ON public.reviews (created_at DESC) INCLUDE (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_host_reviews_hero_recent
  ON public.host_reviews (created_at DESC) INCLUDE (reviewer_id);

CREATE OR REPLACE FUNCTION public.get_wander_hero_metrics()
RETURNS TABLE (
  solo_travelers bigint,
  destinations bigint,
  bookings bigint,
  happy_percent numeric,
  overall_rating numeric,
  review_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH public_destinations AS (
    SELECT p.destination_id AS id
    FROM public.packages p
    WHERE p.is_active IS TRUE AND p.host_id IS NOT NULL AND p.destination_id IS NOT NULL
    UNION
    SELECT s.destination_id
    FROM public.service_listings s
    WHERE s.is_active IS TRUE AND s.host_id IS NOT NULL AND s.destination_id IS NOT NULL
      AND (s.status = 'approved' OR (s.status = 'pending' AND s.first_approved_at IS NOT NULL))
    UNION
    SELECT unnest(s.destination_ids)
    FROM public.service_listings s
    WHERE s.is_active IS TRUE AND s.host_id IS NOT NULL
      AND (s.status = 'approved' OR (s.status = 'pending' AND s.first_approved_at IS NOT NULL))
  ), ratings AS (
    SELECT r.rating FROM public.reviews r
    UNION ALL
    SELECT hr.rating FROM public.host_reviews hr
  )
  SELECT
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public_destinations),
    (SELECT count(*) FROM public.bookings WHERE status <> 'pending'),
    (SELECT CASE WHEN count(*) = 0 THEN 0::numeric
      ELSE round((count(*) FILTER (WHERE rating >= 3)::numeric / count(*)) * 1000) / 10 END
      FROM ratings),
    (SELECT round(avg(rating)::numeric, 1) FROM ratings),
    (SELECT count(*) FROM ratings);
$$;

REVOKE ALL ON FUNCTION public.get_wander_hero_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_wander_hero_metrics() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;