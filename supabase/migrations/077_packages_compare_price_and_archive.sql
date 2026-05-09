alter table public.packages
  add column if not exists compare_at_price_paise bigint,
  add column if not exists archived_at timestamptz;

create index if not exists packages_archived_at_idx
  on public.packages (archived_at);
