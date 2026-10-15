-- Requires 104, 106, 109, 110. Staff-created (not yet linked) listings present as community listings
-- with the host name staff entered; contact details stay private.
BEGIN;

ALTER TABLE public.host_listing_assignments ADD COLUMN IF NOT EXISTS host_name text;

CREATE OR REPLACE FUNCTION public.create_delegated_host_listing(p_kind text, p_listing jsonb, p_contact jsonb, p_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target_table text;
  payload jsonb;
  columns_sql text;
  listing_id uuid := gen_random_uuid();
  result jsonb;
BEGIN
  target_table := CASE p_kind WHEN 'service' THEN 'service_listings' WHEN 'trip' THEN 'packages' ELSE NULL END;
  IF target_table IS NULL THEN RAISE EXCEPTION 'Invalid listing kind'; END IF;
  payload := p_listing || jsonb_build_object('id', listing_id, 'host_id', NULL,
    'created_on_behalf_by', p_staff_id, 'is_active', true)
    || CASE WHEN p_kind = 'service' THEN jsonb_build_object('status', 'approved')
      ELSE jsonb_build_object('moderation_status', 'approved') END;
  SELECT string_agg(format('%I', key), ', ' ORDER BY key) INTO columns_sql FROM jsonb_object_keys(payload) key;
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
    target_table, columns_sql, columns_sql, target_table) USING payload;
  INSERT INTO public.host_listing_assignments(service_listing_id, package_id, email, phone, host_name, created_by, updated_by)
    VALUES (CASE WHEN p_kind = 'service' THEN listing_id END, CASE WHEN p_kind = 'trip' THEN listing_id END,
      nullif(lower(btrim(p_contact->>'email')), ''), nullif(p_contact->>'phone', ''),
      nullif(btrim(p_contact->>'name'), ''), p_staff_id, p_staff_id);
  INSERT INTO public.audit_logs(admin_id, action, target_type, target_id, details)
    VALUES (p_staff_id, 'CREATE_LISTING_ON_BEHALF', target_table, listing_id::text,
      jsonb_build_object('title', p_listing->>'title'));
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', target_table) INTO result USING listing_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_host_listing_contact(p_kind text, p_listing_id uuid, p_contact jsonb, p_staff_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.host_listing_assignments%ROWTYPE; owner uuid;
BEGIN
  -- Match the resolver's lock order: assignment first, then listing.
  SELECT * INTO a FROM public.host_listing_assignments
    WHERE (p_kind = 'service' AND service_listing_id = p_listing_id) OR (p_kind = 'trip' AND package_id = p_listing_id) FOR UPDATE;
  IF p_kind = 'service' THEN
    SELECT host_id INTO owner FROM public.service_listings WHERE id = p_listing_id FOR UPDATE;
  ELSIF p_kind = 'trip' THEN
    SELECT host_id INTO owner FROM public.packages WHERE id = p_listing_id FOR UPDATE;
  ELSE RAISE EXCEPTION 'Invalid listing kind'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF owner IS NOT NULL THEN RAISE EXCEPTION 'This listing already has a host; ownership cannot be changed here'; END IF;
  IF a.status = 'claimed' THEN RAISE EXCEPTION 'This listing has already been claimed'; END IF;
  IF a.id IS NULL THEN
    IF p_kind = 'service' THEN
      UPDATE public.service_listings SET created_on_behalf_by = p_staff_id, status = 'pending', is_active = false WHERE id = p_listing_id;
    ELSE
      UPDATE public.packages SET created_on_behalf_by = p_staff_id, moderation_status = 'pending', is_active = false WHERE id = p_listing_id;
    END IF;
    INSERT INTO public.host_listing_assignments(service_listing_id, package_id, email, phone, host_name, created_by, updated_by)
      VALUES (CASE WHEN p_kind = 'service' THEN p_listing_id END, CASE WHEN p_kind = 'trip' THEN p_listing_id END,
        nullif(lower(btrim(p_contact->>'email')), ''), nullif(p_contact->>'phone', ''),
        nullif(btrim(p_contact->>'name'), ''), p_staff_id, p_staff_id);
  ELSE
    UPDATE public.host_listing_assignments SET email = nullif(lower(btrim(p_contact->>'email')), ''),
      phone = nullif(p_contact->>'phone', ''), host_name = nullif(btrim(p_contact->>'name'), ''),
      updated_by = p_staff_id, updated_at = now() WHERE id = a.id;
  END IF;
  INSERT INTO public.audit_logs(admin_id, action, target_type, target_id, details)
    VALUES (p_staff_id, 'UPDATE_HOST_LISTING_CONTACT', p_kind, p_listing_id::text, '{}');
END;
$$;

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
        (p_trip_source = 'community' AND (p.host_id IS NOT NULL OR p.created_on_behalf_by IS NOT NULL)) OR
        (p_trip_source = 'unsolo' AND p.host_id IS NULL AND p.created_on_behalf_by IS NULL))
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

NOTIFY pgrst, 'reload schema';
COMMIT;
