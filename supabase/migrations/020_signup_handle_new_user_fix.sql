-- ============================================================
-- 020: Fix signup failures ("Database error saving new user")
-- ============================================================
-- Supabase Auth rolls back signup if any trigger on auth.users fails.
-- Common causes fixed here:
-- 1) UNIQUE(username) when the chosen username is already taken
-- 2) RLS blocking inserts from the auth trigger role (supabase_auth_admin)
-- 3) leaderboard_scores INSERT with no INSERT policy for that role chain
-- ============================================================

-- RLS: allow the auth subsystem to insert profiles / leaderboard rows during signup
DROP POLICY IF EXISTS "profiles_insert_supabase_auth_admin" ON public.profiles;
CREATE POLICY "profiles_insert_supabase_auth_admin" ON public.profiles
  FOR INSERT
  TO supabase_auth_admin
  WITH CHECK (true);

DROP POLICY IF EXISTS "leaderboard_insert_supabase_auth_admin" ON public.leaderboard_scores;
CREATE POLICY "leaderboard_insert_supabase_auth_admin" ON public.leaderboard_scores
  FOR INSERT
  TO supabase_auth_admin
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  uid_suffix TEXT;
BEGIN
  uid_suffix := SUBSTR(REPLACE(NEW.id::text, '-', ''), 1, 8);

  base_username := COALESCE(
    NULLIF(LOWER(TRIM(NEW.raw_user_meta_data->>'username')), ''),
    NULLIF(
      LOWER(REGEXP_REPLACE(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), '[^a-zA-Z0-9]', '', 'g')),
      ''
    ),
    'user'
  );

  final_username := LEFT(base_username, 30);

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, username, full_name, avatar_url)
    VALUES (
      NEW.id,
      final_username,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
      NEW.raw_user_meta_data->>'avatar_url'
    );
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO public.profiles (id, username, full_name, avatar_url)
      VALUES (
        NEW.id,
        LEFT(final_username, 20) || '_' || uid_suffix,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'avatar_url'
      );
  END;

  RETURN NEW;
END;
$$;
