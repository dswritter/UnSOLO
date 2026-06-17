-- ============================================================
-- 087: External (non-UnSOLO) point of contact on bookings
-- ============================================================
-- A POC can be a registered UnSOLO member (assigned_poc → profiles) OR an
-- outsider with just a name + phone (no account, no UnSOLO chat link).
-- When the external fields are set, assigned_poc is null.

alter table public.bookings
  add column if not exists poc_external_name text,
  add column if not exists poc_external_phone text;
