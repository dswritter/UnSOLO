-- Requires 104_staff_host_listing_assignments.sql. Read-only private staff directory.
BEGIN;

CREATE OR REPLACE FUNCTION public.search_staff_host_contacts(p_query text DEFAULT '', p_limit integer DEFAULT 20)
RETURNS TABLE(id text, label text, email text, phone text, source text, verified boolean, subtitle text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $$
  WITH input AS (
    SELECT lower(btrim(coalesce(p_query, ''))) AS term,
      CASE WHEN btrim(p_query) ~ '^[+0-9[:space:]().-]+$' AND p_query ~ '[0-9]'
        THEN regexp_replace(p_query, '[^0-9]', '', 'g') ELSE NULL END AS digits,
      greatest(0, least(coalesce(p_limit, 20), 20)) AS cap
  ), registered_contacts AS (
    SELECT p.id, p.full_name, p.username,
      CASE WHEN u.email_confirmed_at IS NOT NULL
        AND lower(btrim(u.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        THEN lower(btrim(u.email)) END AS email,
      coalesce(
        CASE WHEN u.phone_confirmed_at IS NOT NULL
          AND public.host_contact_phone(u.phone, '+') ~ '^\+[1-9][0-9]{7,14}$'
          THEN public.host_contact_phone(u.phone, '+') END,
        CASE WHEN p.is_phone_verified
          AND public.host_contact_phone(p.phone_number, p.phone_country_code) ~ '^\+[1-9][0-9]{7,14}$'
          THEN public.host_contact_phone(p.phone_number, p.phone_country_code) END
      ) AS phone
    FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.is_host IS TRUE
      OR EXISTS (SELECT 1 FROM public.packages t WHERE t.host_id = p.id)
      OR EXISTS (SELECT 1 FROM public.service_listings s WHERE s.host_id = p.id)
  ), registered AS (
    SELECT 'registered:' || r.id::text AS id,
      coalesce(nullif(btrim(r.full_name), ''), nullif(btrim(r.username), ''), r.email, r.phone) AS label,
      r.email, r.phone, 'registered'::text AS source, true AS verified, NULL::text AS subtitle
    FROM registered_contacts r CROSS JOIN input i
    WHERE (r.email IS NOT NULL OR r.phone IS NOT NULL) AND (
      i.term = '' OR strpos(lower(coalesce(r.full_name, '')), i.term) > 0
      OR strpos(lower(coalesce(r.username, '')), i.term) > 0
      OR strpos(coalesce(r.email, ''), i.term) > 0
      OR strpos(coalesce(r.phone, ''), i.term) > 0
      OR (i.digits IS NOT NULL AND strpos(coalesce(r.phone, ''), i.digits) > 0)
    )
    ORDER BY label, id LIMIT (SELECT cap FROM input)
  ), prior_contacts AS (
    SELECT a.id, a.email, a.phone, a.updated_at,
      coalesce(nullif(btrim(c.full_name), ''), nullif(btrim(s.title), ''), nullif(btrim(t.title), ''), a.email, a.phone) AS label,
      coalesce(CASE s.type WHEN 'stays' THEN 'stay' WHEN 'activities' THEN 'activity'
        WHEN 'rentals' THEN 'rental' ELSE s.type END, 'trip') || ': ' || coalesce(s.title, t.title) AS subtitle
    FROM public.host_listing_assignments a
    LEFT JOIN public.profiles c ON c.id = a.claimed_by
    LEFT JOIN public.service_listings s ON s.id = a.service_listing_id
    LEFT JOIN public.packages t ON t.id = a.package_id
    WHERE a.status IN ('pending', 'claimed')
  ), previous AS (
    SELECT 'previous-listing:' || a.id::text AS id, a.label, a.email, a.phone,
      'previous-listing'::text AS source, false AS verified, a.subtitle
    FROM prior_contacts a CROSS JOIN input i
    WHERE (a.email IS NOT NULL OR a.phone IS NOT NULL) AND (
      i.term = '' OR strpos(lower(a.label), i.term) > 0
      OR strpos(lower(a.subtitle), i.term) > 0
      OR strpos(coalesce(a.email, ''), i.term) > 0
      OR strpos(coalesce(a.phone, ''), i.term) > 0
      OR (i.digits IS NOT NULL AND strpos(coalesce(a.phone, ''), i.digits) > 0)
    )
    ORDER BY a.updated_at DESC, a.id LIMIT (SELECT cap FROM input)
  )
  SELECT * FROM registered UNION ALL SELECT * FROM previous;
$$;

REVOKE ALL ON FUNCTION public.search_staff_host_contacts(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_staff_host_contacts(text, integer) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;