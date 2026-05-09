alter table public.discount_offers
  add column if not exists checkout_visibility text not null default 'auto'
    check (checkout_visibility in ('auto', 'manual_only')),
  add column if not exists scope_listing_type text not null default 'all'
    check (scope_listing_type in ('all', 'trips', 'stays', 'activities', 'rentals', 'getting_around')),
  add column if not exists scope_host_id uuid references public.profiles(id) on delete set null,
  add column if not exists scope_package_id uuid references public.packages(id) on delete set null,
  add column if not exists scope_service_listing_id uuid references public.service_listings(id) on delete set null;

create index if not exists discount_offers_scope_listing_type_idx
  on public.discount_offers (scope_listing_type, checkout_visibility, is_active);

create index if not exists discount_offers_scope_host_id_idx
  on public.discount_offers (scope_host_id);

create index if not exists discount_offers_scope_package_id_idx
  on public.discount_offers (scope_package_id);

create index if not exists discount_offers_scope_service_listing_id_idx
  on public.discount_offers (scope_service_listing_id);
