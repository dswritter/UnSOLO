-- Traveller-initiated, host/admin-approved changes to a confirmed booking:
--   kind = 'travellers'  → corrected names/ages/genders (payload.travellers)
--   kind = 'tier'        → switch the whole booking to another price tier
--                          (payload.variantIndex)
-- Mirrors booking_partial_cancellations' lifecycle + RLS.

create table if not exists public.booking_change_requests (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  kind          text not null check (kind in ('travellers', 'tier')),
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'requested' check (status in ('requested', 'approved', 'denied')),
  note          text,
  admin_note    text,
  requested_by  uuid references public.profiles(id) on delete set null,
  processed_by  uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index if not exists booking_change_requests_booking_idx on public.booking_change_requests (booking_id);

alter table public.booking_change_requests enable row level security;

-- Booker may create a request on their own booking, and read their own requests.
-- Host/staff reads + all approvals go through the service-role client in actions.
drop policy if exists "booker creates change request" on public.booking_change_requests;
create policy "booker creates change request" on public.booking_change_requests
  for insert
  with check (
    status = 'requested'
    and exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid())
  );

drop policy if exists "booker reads own change requests" on public.booking_change_requests;
create policy "booker reads own change requests" on public.booking_change_requests
  for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid()));
