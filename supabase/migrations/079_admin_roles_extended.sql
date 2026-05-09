-- ============================================================
-- Extend admin team roles:
--   host_onboarding_staff  — can only approve/reject host listings & community trips
--   custom                 — admin-defined permissions per member
-- ============================================================

-- 1. Widen CHECK constraint on profiles.role
DO $$
DECLARE
  cname TEXT;
BEGIN
  -- Find the auto-named check constraint for profiles.role
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'profiles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%IN%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE profiles DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'user', 'admin', 'social_media_manager', 'field_person',
    'chat_responder', 'host_onboarding_staff', 'custom'
  ));

-- 2. Widen CHECK constraint on team_members.role
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'team_members'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%IN%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE team_members DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE team_members
  ADD CONSTRAINT team_members_role_check
  CHECK (role IN (
    'admin', 'social_media_manager', 'field_person',
    'chat_responder', 'host_onboarding_staff', 'custom'
  ));

-- 3. Add custom_permissions column (text array of permission keys)
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS custom_permissions TEXT[] DEFAULT '{}';

-- 4. Add custom_label for "Other" roles (admin names them on the fly via notes, no schema change needed)
