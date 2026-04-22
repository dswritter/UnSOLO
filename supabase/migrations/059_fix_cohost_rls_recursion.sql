-- ============================================================
-- 059: Fix infinite recursion in service_listing_collaborators RLS.
--
-- The "Collab participants can read" policy on
-- service_listing_collaborators self-references the same table
-- (to let accepted co-hosts see peer rows). Any other policy
-- whose EXISTS subquery touches service_listing_collaborators —
-- e.g. "Accepted co-hosts insert items" on service_listing_items —
-- re-triggers that SELECT policy, which re-triggers itself, etc.
-- Postgres detects the cycle and raises 42P17.
--
-- Fix: introduce a SECURITY DEFINER helper that answers "is user U
-- an accepted co-host of listing L?" by querying the table with
-- RLS bypassed, and route every policy through it. Only the SELECT
-- policy on service_listing_collaborators keeps inline checks, and
-- its peer-visibility branch now goes through the helper too so
-- the self-reference is severed.
-- ============================================================

CREATE OR REPLACE FUNCTION is_accepted_cohost(p_listing_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM service_listing_collaborators
    WHERE listing_id = p_listing_id
      AND user_id = p_user_id
      AND status = 'accepted'
  );
$$;

REVOKE ALL ON FUNCTION is_accepted_cohost(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_accepted_cohost(UUID, UUID) TO authenticated, service_role;

-- ── Rewrite service_listing_collaborators policies ──────────
DROP POLICY IF EXISTS "Collab participants can read" ON service_listing_collaborators;

CREATE POLICY "Collab participants can read"
  ON service_listing_collaborators
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.uid() = added_by
    OR EXISTS (
      SELECT 1 FROM service_listings sl
      WHERE sl.id = listing_id AND sl.host_id = auth.uid()
    )
    OR is_accepted_cohost(listing_id, auth.uid())
  );

-- ── Rewrite policies on other tables to use the helper ─────
DROP POLICY IF EXISTS "Accepted co-hosts update listing" ON service_listings;
CREATE POLICY "Accepted co-hosts update listing"
  ON service_listings FOR UPDATE
  USING (is_accepted_cohost(id, auth.uid()))
  WITH CHECK (is_accepted_cohost(id, auth.uid()));

DROP POLICY IF EXISTS "Accepted co-hosts insert items" ON service_listing_items;
CREATE POLICY "Accepted co-hosts insert items"
  ON service_listing_items FOR INSERT
  WITH CHECK (is_accepted_cohost(service_listing_id, auth.uid()));

DROP POLICY IF EXISTS "Accepted co-hosts update items" ON service_listing_items;
CREATE POLICY "Accepted co-hosts update items"
  ON service_listing_items FOR UPDATE
  USING (is_accepted_cohost(service_listing_id, auth.uid()))
  WITH CHECK (is_accepted_cohost(service_listing_id, auth.uid()));

DROP POLICY IF EXISTS "Accepted co-hosts delete items" ON service_listing_items;
CREATE POLICY "Accepted co-hosts delete items"
  ON service_listing_items FOR DELETE
  USING (is_accepted_cohost(service_listing_id, auth.uid()));
