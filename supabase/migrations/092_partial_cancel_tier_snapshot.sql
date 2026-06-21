-- Snapshot the refund tier % at the moment a partial cancellation is REQUESTED.
--
-- The tier a customer qualifies for depends on how far before departure they ask
-- to cancel. If we recomputed it when an admin/host later approves, a slow approval
-- could silently drop the refund into a lower tier. Storing the tier at request
-- time lets approval honour the rate the customer actually qualified for.
--
-- Written best-effort by the request action, so the code is safe to deploy before
-- this migration is applied (it simply isn't snapshotted until then).

alter table public.booking_partial_cancellations
  add column if not exists requested_tier_percent integer;
