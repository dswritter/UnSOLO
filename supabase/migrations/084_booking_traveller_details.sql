-- ============================================================
-- 084: Per-traveller details on bookings
-- ============================================================
-- Stores name / age / gender for each guest on a trip booking, captured at
-- checkout. Shape: [{ "name": "...", "age": 29, "gender": "male" }, ...].
-- Nullable so existing bookings and non-trip bookings are unaffected.

alter table public.bookings
  add column if not exists traveller_details jsonb;
