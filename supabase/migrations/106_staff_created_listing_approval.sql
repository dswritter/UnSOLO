-- Requires 104 only. Approval is separate from verified ownership/publication.
BEGIN;

-- Keep the verified, unambiguous matching and assignment lock from 104.
CREATE OR REPLACE FUNCTION public.resolve_host_listing_assignment(assignment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a public.host_listing_assignments%ROWTYPE;
  candidates uuid[];
  host uuid;
  listing_title text;
BEGIN
  SELECT * INTO a FROM public.host_listing_assignments WHERE id = assignment_id FOR UPDATE;
  IF NOT FOUND OR a.status = 'claimed' THEN RETURN; END IF;

  SELECT array_agg(DISTINCT matches.id) INTO candidates FROM (
    SELECT u.id FROM auth.users u JOIN public.profiles p ON p.id = u.id
      WHERE a.email IS NOT NULL AND lower(btrim(u.email)) = a.email AND u.email_confirmed_at IS NOT NULL
    UNION
    SELECT u.id FROM auth.users u JOIN public.profiles p ON p.id = u.id
      WHERE a.phone IS NOT NULL AND (
        (u.phone_confirmed_at IS NOT NULL AND '+' || regexp_replace(u.phone, '[^0-9]', '', 'g') = a.phone)
        OR (p.is_phone_verified AND public.host_contact_phone(p.phone_number, p.phone_country_code) = a.phone)
      )
  ) matches;

  IF coalesce(cardinality(candidates), 0) <> 1 THEN
    UPDATE public.host_listing_assignments SET status = CASE WHEN cardinality(candidates) > 1 THEN 'conflict' ELSE 'pending' END,
      updated_at = now() WHERE id = a.id;
    RETURN;
  END IF;
  host := candidates[1];
  IF a.service_listing_id IS NOT NULL THEN
    UPDATE public.service_listings SET host_id = host,
      is_active = CASE WHEN status = 'approved' AND created_on_behalf_by IS NOT NULL THEN true ELSE is_active END,
      updated_at = now()
      WHERE id = a.service_listing_id AND host_id IS NULL RETURNING title INTO listing_title;
  ELSE
    UPDATE public.packages SET host_id = host,
      is_active = CASE WHEN moderation_status = 'approved' AND created_on_behalf_by IS NOT NULL THEN true ELSE is_active END,
      updated_at = now()
      WHERE id = a.package_id AND host_id IS NULL RETURNING title INTO listing_title;
  END IF;
  IF NOT FOUND THEN RETURN; END IF; -- Never overwrite an existing owner.
  UPDATE public.host_listing_assignments SET status = 'claimed', claimed_by = host, claimed_at = now(), updated_at = now() WHERE id = a.id;
  -- Ownership never grants email/phone verification or payout setup.
  UPDATE public.profiles SET is_host = true WHERE id = host AND is_host IS DISTINCT FROM true;
  INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (host, 'booking', 'Your listing is ready to manage',
      'Our team created "' || listing_title || '" for you. You can now manage it from your host dashboard.', '/host');
END;
$$;

-- Service-role only; authenticated staff authorization remains in server actions.
-- Override client approval/publication/ownership fields before inserting.
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
    'created_on_behalf_by', p_staff_id, 'is_active', false)
    || CASE WHEN p_kind = 'service' THEN jsonb_build_object('status', 'approved')
      ELSE jsonb_build_object('moderation_status', 'approved') END;
  SELECT string_agg(format('%I', key), ', ' ORDER BY key) INTO columns_sql FROM jsonb_object_keys(payload) key;
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
    target_table, columns_sql, columns_sql, target_table) USING payload;
  INSERT INTO public.host_listing_assignments(service_listing_id, package_id, email, phone, created_by, updated_by)
    VALUES (CASE WHEN p_kind = 'service' THEN listing_id END, CASE WHEN p_kind = 'trip' THEN listing_id END,
      nullif(lower(btrim(p_contact->>'email')), ''), nullif(p_contact->>'phone', ''), p_staff_id, p_staff_id);
  INSERT INTO public.audit_logs(admin_id, action, target_type, target_id, details)
    VALUES (p_staff_id, 'CREATE_LISTING_ON_BEHALF', target_table, listing_id::text,
      jsonb_build_object('title', p_listing->>'title'));
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', target_table) INTO result USING listing_id;
  RETURN result;
END;
$$;

-- Approved but unlinked listings may be saved; publication still requires a host.
CREATE OR REPLACE FUNCTION public.guard_unclaimed_host_listing_publication()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.created_on_behalf_by IS NOT NULL AND NEW.host_id IS NULL AND NEW.is_active THEN
    RAISE EXCEPTION 'Link the host account before publishing this listing';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_host_listing_assignment(uuid),
  public.create_delegated_host_listing(text, jsonb, jsonb, uuid),
  public.guard_unclaimed_host_listing_publication() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_delegated_host_listing(text, jsonb, jsonb, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;