-- Apply manually in Supabase before deploying the staff onboarding UI.
-- Safe to rerun after a previous or partial installation; preserve existing data.
BEGIN;

-- Audit marker only: adding another profile FK here would make existing
-- PostgREST host:profiles(...) embeds ambiguous throughout discovery.
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS created_on_behalf_by uuid;
ALTER TABLE public.service_listings ADD COLUMN IF NOT EXISTS created_on_behalf_by uuid;

-- Private contact information: deliberately no client-facing RLS policies.
CREATE TABLE IF NOT EXISTS public.host_listing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_listing_id uuid UNIQUE REFERENCES public.service_listings(id) ON DELETE CASCADE,
  package_id uuid UNIQUE REFERENCES public.packages(id) ON DELETE CASCADE,
  email text,
  phone text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'conflict')),
  claimed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(service_listing_id, package_id) = 1),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (email IS NULL OR (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  CHECK ((status = 'claimed') = (claimed_by IS NOT NULL AND claimed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS host_listing_assignments_email ON public.host_listing_assignments(email) WHERE status <> 'claimed';
CREATE INDEX IF NOT EXISTS host_listing_assignments_phone ON public.host_listing_assignments(phone) WHERE status <> 'claimed';
ALTER TABLE public.host_listing_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.host_listing_assignments FROM anon, authenticated;
GRANT ALL ON public.host_listing_assignments TO service_role;

CREATE OR REPLACE FUNCTION public.host_contact_phone(raw text, country_code text DEFAULT '+91')
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN nullif(regexp_replace(raw, '[^0-9]', '', 'g'), '') IS NULL THEN NULL
    WHEN btrim(raw) LIKE '+%' THEN '+' || regexp_replace(raw, '[^0-9]', '', 'g')
    WHEN country_code = '+91' AND length(regexp_replace(raw, '[^0-9]', '', 'g')) = 12
      AND regexp_replace(raw, '[^0-9]', '', 'g') LIKE '91%'
      THEN '+' || regexp_replace(raw, '[^0-9]', '', 'g')
    ELSE coalesce(country_code, '+91') || regexp_replace(raw, '[^0-9]', '', 'g') END;
$$;

-- Serialized per assignment; only a single verified, unambiguous account can own it.
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
    UPDATE public.service_listings SET host_id = host, updated_at = now()
      WHERE id = a.service_listing_id AND host_id IS NULL RETURNING title INTO listing_title;
  ELSE
    UPDATE public.packages SET host_id = host, updated_at = now()
      WHERE id = a.package_id AND host_id IS NULL RETURNING title INTO listing_title;
  END IF;
  IF NOT FOUND THEN RETURN; END IF; -- Never overwrite an existing owner.
  UPDATE public.host_listing_assignments SET status = 'claimed', claimed_by = host, claimed_at = now(), updated_at = now() WHERE id = a.id;
  -- Listing ownership grants management access, not email/phone verification or payout setup.
  UPDATE public.profiles SET is_host = true WHERE id = host AND is_host IS DISTINCT FROM true;
  INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (host, 'booking', 'Your listing is ready to manage',
      'Our team created "' || listing_title || '" for you. You can now manage it from your host dashboard.', '/host');
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_host_listings_for_user(user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record;
BEGIN
  FOR a IN
    SELECT h.id FROM public.host_listing_assignments h
    JOIN auth.users u ON u.id = user_id JOIN public.profiles p ON p.id = u.id
    WHERE h.status <> 'claimed' AND (
      (u.email_confirmed_at IS NOT NULL AND h.email = lower(btrim(u.email)))
      OR (u.phone_confirmed_at IS NOT NULL AND h.phone = '+' || regexp_replace(u.phone, '[^0-9]', '', 'g'))
      OR (p.is_phone_verified AND h.phone = public.host_contact_phone(p.phone_number, p.phone_country_code))
    ) ORDER BY h.id
  LOOP PERFORM public.resolve_host_listing_assignment(a.id); END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.host_assignment_contact_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.resolve_host_listing_assignment(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS host_assignment_contact_changed ON public.host_listing_assignments;
CREATE TRIGGER host_assignment_contact_changed AFTER INSERT OR UPDATE OF email, phone
  ON public.host_listing_assignments FOR EACH ROW EXECUTE FUNCTION public.host_assignment_contact_trigger();

CREATE OR REPLACE FUNCTION public.host_assignment_identity_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.resolve_host_listings_for_user(NEW.id);
  RETURN NEW;
END;
$$;
-- Profile insertion handles new Google/Apple users once handle_new_user has run.
-- Recreate only this migration's triggers; leave existing signup triggers intact.
DROP TRIGGER IF EXISTS host_assignment_profile_created ON public.profiles;
CREATE TRIGGER host_assignment_profile_created AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.host_assignment_identity_trigger();
DROP TRIGGER IF EXISTS host_assignment_phone_verified ON public.profiles;
CREATE TRIGGER host_assignment_phone_verified AFTER UPDATE OF is_phone_verified, phone_number, phone_country_code ON public.profiles
  FOR EACH ROW WHEN (NEW.is_phone_verified = true) EXECUTE FUNCTION public.host_assignment_identity_trigger();
DROP TRIGGER IF EXISTS host_assignment_auth_verified ON auth.users;
CREATE TRIGGER host_assignment_auth_verified AFTER INSERT OR UPDATE OF email, email_confirmed_at, phone, phone_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.host_assignment_identity_trigger();

-- Existing profile/OTP RLS allowed users to spoof verification via direct REST.
-- Only the trusted server can grant phone verification; editing a phone revokes it.
CREATE OR REPLACE FUNCTION public.protect_host_phone_verification()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role IS DISTINCT FROM 'user' THEN RAISE EXCEPTION 'Staff roles require the trusted server'; END IF;
      IF NEW.is_phone_verified THEN RAISE EXCEPTION 'Phone verification requires the trusted server'; END IF;
    ELSE
      IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Staff roles require the trusted server'; END IF;
      IF NEW.is_phone_verified AND OLD.is_phone_verified IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Phone verification requires the trusted server';
      END IF;
      IF NEW.phone_number IS DISTINCT FROM OLD.phone_number OR NEW.phone_country_code IS DISTINCT FROM OLD.phone_country_code THEN
        NEW.is_phone_verified := false;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_host_phone_verification ON public.profiles;
CREATE TRIGGER protect_host_phone_verification BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_host_phone_verification();
REVOKE ALL ON public.phone_otp_verifications FROM anon, authenticated;
GRANT ALL ON public.phone_otp_verifications TO service_role;

-- Create listing + contact + initial match in ONE transaction. Table and column
-- identifiers are quoted; this RPC is service-role only, never client callable.
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
  payload := p_listing || jsonb_build_object('id', listing_id, 'host_id', NULL, 'created_on_behalf_by', p_staff_id);
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
    INSERT INTO public.host_listing_assignments(service_listing_id, package_id, email, phone, created_by, updated_by)
      VALUES (CASE WHEN p_kind = 'service' THEN p_listing_id END, CASE WHEN p_kind = 'trip' THEN p_listing_id END,
        nullif(lower(btrim(p_contact->>'email')), ''), nullif(p_contact->>'phone', ''), p_staff_id, p_staff_id);
  ELSE
    UPDATE public.host_listing_assignments SET email = nullif(lower(btrim(p_contact->>'email')), ''),
      phone = nullif(p_contact->>'phone', ''), updated_by = p_staff_id, updated_at = now() WHERE id = a.id;
  END IF;
  INSERT INTO public.audit_logs(admin_id, action, target_type, target_id, details)
    VALUES (p_staff_id, 'UPDATE_HOST_LISTING_CONTACT', p_kind, p_listing_id::text, '{}');
END;
$$;

-- Ownership must be established before publishing; also covers direct staff
-- form edits rather than just the dedicated approval actions.
CREATE OR REPLACE FUNCTION public.guard_unclaimed_host_listing_publication()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.created_on_behalf_by IS NOT NULL AND NEW.host_id IS NULL THEN
    IF NEW.is_active OR
      (TG_TABLE_NAME = 'service_listings' AND to_jsonb(NEW)->>'status' = 'approved') OR
      (TG_TABLE_NAME = 'packages' AND to_jsonb(NEW)->>'moderation_status' = 'approved') THEN
      RAISE EXCEPTION 'Link the host account before publishing this listing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_unclaimed_host_listing_publication ON public.service_listings;
CREATE TRIGGER guard_unclaimed_host_listing_publication BEFORE INSERT OR UPDATE ON public.service_listings
  FOR EACH ROW EXECUTE FUNCTION public.guard_unclaimed_host_listing_publication();
DROP TRIGGER IF EXISTS guard_unclaimed_host_listing_publication ON public.packages;
CREATE TRIGGER guard_unclaimed_host_listing_publication BEFORE INSERT OR UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.guard_unclaimed_host_listing_publication();

REVOKE ALL ON FUNCTION public.host_contact_phone(text, text), public.resolve_host_listing_assignment(uuid),
  public.resolve_host_listings_for_user(uuid), public.host_assignment_contact_trigger(), public.host_assignment_identity_trigger(),
  public.protect_host_phone_verification(), public.create_delegated_host_listing(text, jsonb, jsonb, uuid),
  public.update_host_listing_contact(text, uuid, jsonb, uuid), public.guard_unclaimed_host_listing_publication() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_host_listings_for_user(uuid), public.create_delegated_host_listing(text, jsonb, jsonb, uuid),
  public.update_host_listing_contact(text, uuid, jsonb, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;