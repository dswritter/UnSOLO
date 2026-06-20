-- ============================================================
-- 088: Per-traveller (partial) cancellations on a booking
-- ============================================================
-- A multi-guest booking (e.g. 5 people) can have some travellers cancelled
-- without cancelling the whole booking. Each partial cancellation snapshots
-- which travellers left, how many seats were freed, and the refund owed to them.
--
-- Lifecycle (status):
--   requested  → the booker asked to drop some travellers; awaiting admin/host
--   approved   → admin/host approved; booking guests/total/deposit adjusted
--   denied     → admin/host rejected the request; booking untouched
-- Refund lifecycle (refund_status): none | pending | processing | completed | failed
--
-- The parent booking's guests, traveller_details, total_amount_paise and
-- deposit_paise are reduced only when a partial cancellation is approved.

create table if not exists public.booking_partial_cancellations (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings(id) on delete cascade,
  -- snapshot of the cancelled traveller objects: [{ name, age, gender }, ...]
  travellers          jsonb not null default '[]'::jsonb,
  guests_cancelled    integer not null default 0,
  -- money
  refund_amount_paise integer not null default 0,
  refund_status       text not null default 'none',
  refund_razorpay_id  text,
  -- lifecycle
  status              text not null default 'requested',
  reason              text,
  admin_note          text,
  requested_by        uuid references public.profiles(id) on delete set null,
  processed_by        uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  processed_at        timestamptz,
  constraint booking_partial_cancellations_status_check
    check (status in ('requested', 'approved', 'denied')),
  constraint booking_partial_cancellations_refund_status_check
    check (refund_status in ('none', 'pending', 'processing', 'completed', 'failed'))
);

create index if not exists idx_booking_partial_cancellations_booking
  on public.booking_partial_cancellations(booking_id);

alter table public.booking_partial_cancellations enable row level security;

-- The booker can read partial cancellations on their own bookings.
drop policy if exists "bpc_select_own" on public.booking_partial_cancellations;
create policy "bpc_select_own" on public.booking_partial_cancellations
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_partial_cancellations.booking_id
        and b.user_id = auth.uid()
    )
  );

-- The host of the trip can read partial cancellations on their trip's bookings.
drop policy if exists "bpc_select_host" on public.booking_partial_cancellations;
create policy "bpc_select_host" on public.booking_partial_cancellations
  for select using (
    exists (
      select 1
      from public.bookings b
      join public.packages p on p.id = b.package_id
      where b.id = booking_partial_cancellations.booking_id
        and p.host_id = auth.uid()
    )
  );

-- The booker can create a request for their own booking. All other mutations
-- (approve/deny, refund tracking, booking adjustment) go through the
-- service-role client in server actions.
drop policy if exists "bpc_insert_own" on public.booking_partial_cancellations;
create policy "bpc_insert_own" on public.booking_partial_cancellations
  for insert with check (
    requested_by = auth.uid()
    and status = 'requested'
    and exists (
      select 1 from public.bookings b
      where b.id = booking_partial_cancellations.booking_id
        and b.user_id = auth.uid()
    )
  );
