-- Phase 2 — backfill the ledgers from existing money data. Idempotent (guarded
-- by NOT EXISTS), so it can be re-run safely. Apply AFTER 100_booking_ledgers.sql.
--
-- Payments: we backfill ONE 'legacy' payment per booking equal to the current
-- deposit_paise (cash collected). This guarantees Σ booking_payments = deposit_paise
-- — matching today's authoritative "collected" figure — without trying to
-- decompose the razorpay_payment_ids array (going-forward captures are dual-written
-- with their real gateway ids).

insert into public.booking_payments (booking_id, amount_paise, method, kind, created_at)
select b.id, b.deposit_paise, 'legacy', 'payment', b.created_at
from public.bookings b
where coalesce(b.deposit_paise, 0) > 0
  and not exists (select 1 from public.booking_payments p where p.booking_id = b.id);

-- Full-booking refunds → one row each. tier_percent isn't stored on `bookings`
-- itself — the closest record of it is host_earnings.refund_tier_percent (set
-- when the full-cancellation refund was split). Scalar subquery (not a join) so
-- this can never fan out into duplicate rows even if a booking somehow has more
-- than one host_earnings row; nullable since not every booking has one at all.
insert into public.booking_refunds
  (booking_id, amount_paise, method, status, gateway_refund_id, tier_percent,
   completed_at, created_at)
select
  b.id,
  b.refund_amount_paise,
  coalesce(nullif(b.refund_method, ''), 'razorpay'),
  coalesce(nullif(b.refund_status, ''), 'pending'),
  b.refund_razorpay_id,
  (select he.refund_tier_percent from public.host_earnings he where he.booking_id = b.id limit 1),
  case when b.refund_status = 'completed' then coalesce(b.updated_at, now()) end,
  coalesce(b.refund_initiated_at, b.updated_at, b.created_at)
from public.bookings b
where coalesce(b.refund_amount_paise, 0) > 0
  and not exists (
    select 1 from public.booking_refunds r
    where r.booking_id = b.id and r.partial_cancellation_id is null
  );

-- Partial-cancellation refunds → one row each, correlated by partial_cancellation_id.
insert into public.booking_refunds
  (booking_id, partial_cancellation_id, amount_paise, method, status,
   gateway_refund_id, completed_at, created_at)
select
  pc.booking_id,
  pc.id,
  pc.refund_amount_paise,
  coalesce(nullif(pc.refund_method, ''), 'razorpay'),
  pc.refund_status,
  pc.refund_razorpay_id,
  case when pc.refund_status = 'completed' then coalesce(pc.processed_at, now()) end,
  coalesce(pc.processed_at, pc.created_at)
from public.booking_partial_cancellations pc
where coalesce(pc.refund_amount_paise, 0) > 0
  and pc.refund_status is not null
  and pc.refund_status <> 'none'
  and not exists (select 1 from public.booking_refunds r where r.partial_cancellation_id = pc.id);
