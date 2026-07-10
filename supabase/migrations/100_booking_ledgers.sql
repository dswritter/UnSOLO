-- Phase 2 — payment & refund ledgers (append-only source of truth for money).
--
-- Non-destructive: these tables are ADDED alongside the existing scalar/array
-- money fields. App code dual-writes here; reads still use the existing columns
-- until the Phase 2b cutover. Backfill lives in 101_backfill_booking_ledgers.sql.

-- ── Payments ────────────────────────────────────────────────────────────────
create table if not exists public.booking_payments (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.bookings(id) on delete cascade,
  amount_paise       int  not null check (amount_paise > 0),
  method             text not null check (method in
                       ('razorpay','offline_cash','offline_bank','wallet','other','legacy')),
  kind               text not null default 'payment' check (kind in ('token','balance','payment')),
  gateway_payment_id text,                          -- razorpay payment id (was razorpay_payment_ids[])
  gateway_fee_paise  int  not null default 0,
  recorded_by        uuid references public.profiles(id) on delete set null,  -- null = customer online
  note               text,
  created_at         timestamptz not null default now()
);
create index if not exists booking_payments_booking_idx on public.booking_payments(booking_id);

-- ── Refunds ─────────────────────────────────────────────────────────────────
create table if not exists public.booking_refunds (
  id                        uuid primary key default gen_random_uuid(),
  booking_id                uuid not null references public.bookings(id) on delete cascade,
  -- correlation to the source that caused the refund (Phase 3 will use adjustment_id)
  partial_cancellation_id   uuid references public.booking_partial_cancellations(id) on delete set null,
  adjustment_id             uuid,                    -- reserved for Phase 3
  amount_paise              int  not null check (amount_paise > 0),
  method                    text not null check (method in ('razorpay','offline','wallet')),
  status                    text not null default 'pending'
                              check (status in ('pending','processing','completed','failed')),
  gateway_refund_id         text,
  gateway_fee_retained_paise int not null default 0, -- non-refundable gateway fee
  tier_percent              int,
  host_share_paise          int not null default 0,  -- one split, used by full & partial
  platform_share_paise      int not null default 0,
  platform_writeoff_paise   int not null default 0,
  initiated_by              uuid references public.profiles(id) on delete set null,
  initiated_at              timestamptz,
  completed_at              timestamptz,
  receipt_sent_at           timestamptz,
  note                      text,
  created_at                timestamptz not null default now()
);
create index if not exists booking_refunds_booking_idx on public.booking_refunds(booking_id);

-- ── RLS: booker reads own; staff reads all. Writes go through the service-role
--    client (bypasses RLS), so no insert/update policies are defined. ──────────
alter table public.booking_payments enable row level security;
alter table public.booking_refunds  enable row level security;

create policy "read own or staff booking_payments" on public.booking_payments
  for select using (
    exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid()
               and p.role in ('admin','super_admin','social_media_manager','field_person','chat_responder'))
  );

create policy "read own or staff booking_refunds" on public.booking_refunds
  for select using (
    exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid()
               and p.role in ('admin','super_admin','social_media_manager','field_person','chat_responder'))
  );
