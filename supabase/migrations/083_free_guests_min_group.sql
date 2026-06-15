-- ============================================================
-- 083: free_guests offers — minimum total group size
-- ============================================================
-- "k free guests of n total guests": the free_guests discount only applies
-- when the booking has at least `free_guests_min_group` (n) guests, and then
-- frees `free_guest_count` (k) of them. Defaults to 1 so existing rows behave
-- as before (any booking of 2+ qualifies for the configured k).

alter table public.discount_offers
  add column if not exists free_guests_min_group integer not null default 1
    check (free_guests_min_group >= 1);
