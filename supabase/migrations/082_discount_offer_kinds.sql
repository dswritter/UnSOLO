-- ============================================================
-- 082: Discount offer kinds — percentage & pay-for-(n−k)
-- ============================================================
-- Adds two new discount mechanics alongside the existing flat ₹-off:
--   * percent      — % of the total booking amount, with an optional ₹ cap
--   * free_guests  — book for n people, pay for (n − free_guest_count)
-- Existing rows default to 'fixed' and keep their discount_paise untouched.

alter table public.discount_offers
  add column if not exists discount_kind text not null default 'fixed'
    check (discount_kind in ('fixed', 'percent', 'free_guests')),
  add column if not exists discount_percent integer
    check (discount_percent is null or (discount_percent between 1 and 100)),
  add column if not exists discount_percent_cap_paise integer
    check (discount_percent_cap_paise is null or discount_percent_cap_paise > 0),
  add column if not exists free_guest_count integer not null default 1
    check (free_guest_count >= 1);

-- Non-fixed kinds carry no flat paise value, so relax the legacy constraint.
alter table public.discount_offers
  drop constraint if exists discount_offers_discount_paise_check;
alter table public.discount_offers
  alter column discount_paise drop not null;
