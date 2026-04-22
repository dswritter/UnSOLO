-- ============================================================
-- 058: Fix co-host policy on service_listing_items.
-- The FOR ALL policy added in 057 has no WITH CHECK clause, which
-- defaults to the USING expression. For INSERT that evaluates the
-- co-host EXISTS check — FALSE for a primary host creating items
-- on a brand-new listing. Although permissive policies OR together
-- with the existing "Hosts insert own items" policy, some Supabase
-- rest paths surface the stricter failure. Split the policy into
-- action-specific ones so INSERT is governed only by the host
-- policy + this new co-host INSERT policy (each with a clear
-- WITH CHECK), and UPDATE/DELETE get their own clauses.
-- ============================================================

DROP POLICY IF EXISTS "Accepted co-hosts can manage items" ON service_listing_items;

CREATE POLICY "Accepted co-hosts insert items"
  ON service_listing_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_listing_collaborators c
      WHERE c.listing_id = service_listing_items.service_listing_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );

CREATE POLICY "Accepted co-hosts update items"
  ON service_listing_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM service_listing_collaborators c
      WHERE c.listing_id = service_listing_items.service_listing_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_listing_collaborators c
      WHERE c.listing_id = service_listing_items.service_listing_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );

CREATE POLICY "Accepted co-hosts delete items"
  ON service_listing_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM service_listing_collaborators c
      WHERE c.listing_id = service_listing_items.service_listing_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );

-- Same defensive split for the listings table — `Accepted co-hosts
-- can update listing` is already UPDATE-only, so no split needed,
-- but add an explicit WITH CHECK to match the existing host policy
-- shape and make intent obvious.
DROP POLICY IF EXISTS "Accepted co-hosts can update listing" ON service_listings;

CREATE POLICY "Accepted co-hosts update listing"
  ON service_listings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM service_listing_collaborators c
      WHERE c.listing_id = service_listings.id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_listing_collaborators c
      WHERE c.listing_id = service_listings.id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );
