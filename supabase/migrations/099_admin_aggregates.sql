-- Admin aggregate helpers — push heavy sums/counts into SQL instead of fetching
-- entire tables into the Node process and reducing in JS.
--
-- Both are called only from admin/staff server code via the service-role client.
-- SECURITY DEFINER + revoking anon/authenticated keeps them from being invoked
-- directly by ordinary users through the anon client.

-- Net revenue inputs: cash actually collected (deposit_paise, falling back to
-- total_amount_paise for legacy rows with no deposit tracked) minus approved refunds.
create or replace function public.admin_revenue_summary()
returns table (gross_revenue bigint, total_refunds bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(case when coalesce(deposit_paise, 0) > 0 then deposit_paise else coalesce(total_amount_paise, 0) end)
      from public.bookings
      where status in ('confirmed', 'completed')
    ), 0)::bigint as gross_revenue,
    coalesce((
      select sum(coalesce(refund_amount_paise, 0))
      from public.bookings
      where cancellation_status = 'approved'
    ), 0)::bigint as total_refunds;
$$;

-- Per-user booking counts (one row per user who has any booking) — replaces a
-- full-table scan that grouped in JS.
create or replace function public.admin_user_booking_counts()
returns table (user_id uuid, confirmed bigint, completed bigint, cancelled bigint)
language sql
security definer
set search_path = public
as $$
  select
    user_id,
    count(*) filter (where status = 'confirmed')::bigint as confirmed,
    count(*) filter (where status = 'completed')::bigint as completed,
    count(*) filter (where status = 'cancelled')::bigint as cancelled
  from public.bookings
  group by user_id;
$$;

revoke all on function public.admin_revenue_summary() from public, anon, authenticated;
revoke all on function public.admin_user_booking_counts() from public, anon, authenticated;
