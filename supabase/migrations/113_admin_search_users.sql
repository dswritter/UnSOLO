-- Admin Users: server-side search, filters and paging (replaces loading the newest 500 profiles).
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_search_users(
  p_search text DEFAULT NULL,
  p_filter text DEFAULT 'all',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH counts AS (
    SELECT b.user_id,
      count(*) FILTER (WHERE b.status = 'confirmed')::integer AS confirmed,
      count(*) FILTER (WHERE b.status = 'completed')::integer AS completed,
      count(*) FILTER (WHERE b.status = 'cancelled')::integer AS cancelled
    FROM public.bookings b
    GROUP BY b.user_id
  ),
  base AS (
    SELECT p.id, p.username, p.full_name, p.avatar_url, p.phone_number, p.is_host, p.is_phone_verified,
      p.instagram_url, p.created_at, p.role,
      coalesce(c.confirmed, 0) AS confirmed, coalesce(c.completed, 0) AS completed, coalesce(c.cancelled, 0) AS cancelled
    FROM public.profiles p
    LEFT JOIN counts c ON c.user_id = p.id
    WHERE p_search IS NULL OR btrim(p_search) = ''
      OR strpos(lower(coalesce(p.username, '')), lower(btrim(p_search))) > 0
      OR strpos(lower(coalesce(p.full_name, '')), lower(btrim(p_search))) > 0
  ),
  filtered AS (
    SELECT * FROM base
    WHERE CASE coalesce(p_filter, 'all')
      WHEN 'hosts' THEN coalesce(is_host, false)
      WHEN 'active_travelers' THEN confirmed + completed > 0
      WHEN 'no_phone' THEN NOT coalesce(is_phone_verified, false)
      WHEN 'no_instagram' THEN coalesce(instagram_url, '') = ''
      ELSE true
    END
  ),
  page_rows AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC, id
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY page_rows.created_at DESC, page_rows.id) FROM page_rows), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'counts', (SELECT jsonb_build_object(
      'all', count(*),
      'hosts', count(*) FILTER (WHERE coalesce(is_host, false)),
      'active_travelers', count(*) FILTER (WHERE confirmed + completed > 0),
      'no_phone', count(*) FILTER (WHERE NOT coalesce(is_phone_verified, false)),
      'no_instagram', count(*) FILTER (WHERE coalesce(instagram_url, '') = '')
    ) FROM base)
  )
$$;

REVOKE ALL ON FUNCTION public.admin_search_users(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text, text, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
