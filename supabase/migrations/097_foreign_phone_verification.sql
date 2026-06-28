-- Migration 097: foreign phone verification + phone change requests
-- Apply by hand in Supabase (pipeline does not run migrations).

-- 1. Add country code + verified-method to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_country_code text NOT NULL DEFAULT '+91',
  ADD COLUMN IF NOT EXISTS phone_verified_method text; -- 'otp' | 'manual'

-- 2. Phone change requests (for already-verified hosts wanting to change their number)
CREATE TABLE IF NOT EXISTS public.phone_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_phone text,
  current_country_code text NOT NULL DEFAULT '+91',
  new_phone text NOT NULL,
  new_country_code text NOT NULL DEFAULT '+91',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  note text,
  staff_note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.phone_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_read_own" ON public.phone_change_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "user_insert_own" ON public.phone_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "user_update_own_pending" ON public.phone_change_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
