-- Server-side store for in-progress (not-yet-submitted) host listings, so the
-- onboarding team can see and help with drafts that would otherwise live only in
-- the host's browser. Saved on stage transitions (not keystroke-by-keystroke).
--
-- One row per (host, kind, local draft id). `payload` is the same JSON the create
-- form already keeps locally; title/destination/step are denormalised for a quick
-- staff overview.

create table if not exists public.listing_drafts (
  id                 uuid primary key default gen_random_uuid(),
  host_id            uuid not null references public.profiles(id) on delete cascade,
  kind               text not null check (kind in ('trip', 'service')),
  local_id           text not null,
  title              text,
  destination_label  text,
  step               integer not null default 0,
  payload            jsonb not null default '{}'::jsonb,
  submitted          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (host_id, kind, local_id)
);

create index if not exists listing_drafts_updated_idx on public.listing_drafts (updated_at desc);

alter table public.listing_drafts enable row level security;

-- Hosts manage their own drafts. Staff read via the service-role client in server
-- actions (bypasses RLS), so no broad staff SELECT policy is needed here.
drop policy if exists "host manages own listing drafts" on public.listing_drafts;
create policy "host manages own listing drafts" on public.listing_drafts
  for all
  using (host_id = auth.uid())
  with check (host_id = auth.uid());
