-- Trip companion reviews + "claim a trip" (join chat + see booking details when
-- you weren't the one who booked). Two changes:
--
-- 1. Reviews: allow multiple reviewers per booking (a group of 6 can leave 6
--    separate reviews, not just the account holder) and add moderation so a
--    review from someone who ISN'T the booking's account holder goes through
--    approval before it's public. Existing account-holder reviews are
--    unaffected — the new `status` column defaults to 'approved'.
-- 2. trip_traveller_claims: a companion enters the booking's confirmation code
--    to request being recognized as having been on the trip. Approved by
--    EITHER the original booker, the trip's host, or an admin/staff member —
--    whichever resolves it first wins (status flips out of 'pending', so the
--    other two stop seeing it as actionable). Approval grants trip-chat
--    membership + the same booking visibility (dates, amounts) the booker has.
--    Purely additive — never touches bookings.traveller_details, guest counts,
--    or any money field.

-- ── 1. Reviews: multi-reviewer + moderation ─────────────────────────────────

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_booking_id_key;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_booking_id_user_id_key UNIQUE (booking_id, user_id);

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'denied')),
  ADD COLUMN IF NOT EXISTS denial_reason text;

DROP POLICY IF EXISTS "Anyone can read reviews" ON public.reviews;
CREATE POLICY "Anyone can read approved reviews, or your own" ON public.reviews
  FOR SELECT USING (status = 'approved' OR user_id = auth.uid());

-- ── 2. trip_traveller_claims ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trip_traveller_claims (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  package_id              uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  claimant_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  confirmation_code_entered text NOT NULL,
  claimed_traveller_name  text,
  status                  text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  resolved_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_by_role        text CHECK (resolved_by_role IN ('admin', 'host', 'booker')),
  resolved_at             timestamptz,
  denial_reason           text,
  linked_review_id        uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, claimant_id)
);

CREATE INDEX IF NOT EXISTS trip_traveller_claims_booking_idx ON public.trip_traveller_claims(booking_id);
CREATE INDEX IF NOT EXISTS trip_traveller_claims_package_idx ON public.trip_traveller_claims(package_id);
CREATE INDEX IF NOT EXISTS trip_traveller_claims_claimant_idx ON public.trip_traveller_claims(claimant_id);
CREATE INDEX IF NOT EXISTS trip_traveller_claims_pending_idx ON public.trip_traveller_claims(status) WHERE status = 'pending';

ALTER TABLE public.trip_traveller_claims ENABLE ROW LEVEL SECURITY;

-- Reads: claimant themself, the booking's booker, the trip's host, or staff.
-- Writes (insert/approve/deny) go through the service-role client in server
-- actions — same pattern as every other request/approve flow in this app.
CREATE POLICY "read own claim" ON public.trip_traveller_claims
  FOR SELECT USING (claimant_id = auth.uid());

CREATE POLICY "booker reads claims on own bookings" ON public.trip_traveller_claims
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())
  );

CREATE POLICY "host reads claims on own trips" ON public.trip_traveller_claims
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.packages p WHERE p.id = package_id AND p.host_id = auth.uid())
  );

CREATE POLICY "staff reads all claims" ON public.trip_traveller_claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid()
      AND pr.role IN ('admin', 'super_admin', 'social_media_manager', 'field_person', 'chat_responder')
    )
  );
