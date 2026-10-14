-- Repair databases missing the packages timestamp setup from migration 030.
-- Staff host linking (104/106) writes this column; retain existing timestamps.
BEGIN;

ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Suspend only the package timestamp trigger while backfilling missing values.
-- Otherwise a previous trigger could replace the historical fallback with now().
DROP TRIGGER IF EXISTS packages_updated_at ON public.packages;
UPDATE public.packages SET updated_at = coalesce(created_at, now()) WHERE updated_at IS NULL;
ALTER TABLE public.packages ALTER COLUMN updated_at SET DEFAULT now();

-- Dedicated function: do not change the shared updater used by other tables.
CREATE OR REPLACE FUNCTION public.set_package_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER packages_updated_at
  BEFORE UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.set_package_updated_at();

REVOKE ALL ON FUNCTION public.set_package_updated_at() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;