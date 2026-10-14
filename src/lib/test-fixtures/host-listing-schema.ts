// Minimal pre-104 schema shared by the real PostgreSQL migration tests.
// The migrations supply the actual functions, triggers, constraints and grants.
export const hostListingSchema = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, phone text, email_confirmed_at timestamptz, phone_confirmed_at timestamptz);
  CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text DEFAULT 'user', phone_number text,
    full_name text, username text,
    phone_country_code text DEFAULT '+91', is_phone_verified boolean DEFAULT false, is_host boolean DEFAULT false);
  CREATE TABLE public.service_listings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, slug text UNIQUE,
    type text NOT NULL DEFAULT 'stays' CHECK (type IN ('stays', 'activities', 'rentals', 'getting_around')),
    host_id uuid REFERENCES profiles(id), updated_at timestamptz DEFAULT now(), status text DEFAULT 'pending', is_active boolean DEFAULT false);
  CREATE TABLE public.packages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, slug text UNIQUE,
    host_id uuid REFERENCES profiles(id), updated_at timestamptz DEFAULT now(), moderation_status text DEFAULT 'pending', is_active boolean DEFAULT false);
  CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES profiles(id), type text, title text, body text, link text);
  CREATE TABLE public.audit_logs(admin_id uuid, action text, target_type text, target_id text, details jsonb);
  CREATE TABLE public.phone_otp_verifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, verified boolean DEFAULT false);
  GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  GRANT ALL ON public.phone_otp_verifications TO authenticated;
  CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN INSERT INTO public.profiles(id) VALUES (NEW.id); RETURN NEW; END;
  $$;
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`