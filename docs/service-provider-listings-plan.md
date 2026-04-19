# Service provider listings (rentals, stays, activities) — plan

## Vision

Let **service providers** (bike/car rental, rafting, bungee, stays, trek guides, experiences, etc.) publish **listings** with booking CTAs and **platform revenue share** (category-specific, similar to trip packages today). Listings are **location-aware** and **linked to trips/packages** and to **each other**, so on any trip/package page users see relevant add-ons and DIY options for that **destination or corridor**, even if they do not book the full hosted trip.

## Goals

- New supply side beyond hosts: **operators** with verified listings and calendars/inventory where applicable.
- **Discovery**: From a package/trip page, show “**Near this trip**” or “**In [region]**” rentals, stays, and activities.
- **Cross-linking**: Graph of `listing ↔ package(s)` and `listing ↔ listing` (same area, complementary services).
- **Monetization**: Admin-configurable **fee % or fixed fee per category**; reconcile with bookings (see Risks).

## UX flows (high level)

### A. Provider onboarding

1. Apply as “Service provider” (or extend host profile with a **provider** role).
2. KYC / business verification (light for v1: email + phone + optional docs by category).
3. Create listing: category, title, description, photos, **location** (point + radius or polygon), price model (per day, per seat, fixed), **availability** rules (manual or calendar API later).
4. **Link to geography**: pick destination(s) from our taxonomy, optional “serves these package routes” tags.

### B. Traveler on package page

1. User opens `/packages/[slug]` (or trip detail).
2. Below the fold: **“Plan your arrival”** / **“Add experiences”** carousel: stays, transport, activities filtered by **same destination / nearby** and **trip dates** if known.
3. Tapping a listing opens **listing detail** with map, policies, book CTA, and **“Often booked with”** (other listings + packages).

### C. Traveler browsing DIY

1. Explore map or destination page lists **all** listing types with filters.
2. Saving a listing adds to trip **wishlist** or suggests pairing with a **community trip thread** (optional).

## Data model (conceptual)

- **`service_categories`**: slug, label, default_platform_fee_percent, fee_type (`percent` | `fixed_minor`).
- **`service_listings`**: id, provider_id, category_id, title, description, media[], location (PostGIS), destination_ids[], status, pricing JSON, metadata JSON.
- **`service_listing_package_links`**: listing_id, package_id, link_type (`recommended` | `same_area` | `manual`), weight.
- **`service_listing_relations`**: from_listing_id, to_listing_id, relation (`complements` | `same_vendor` | `bundle`), optional.
- **`service_bookings`** (or reuse **bookings** with `kind`): listing_id, user_id, amount, fee_snapshot, status — **decision needed** to avoid duplicating payment flows.

## Linking logic

- **Primary**: geographic — listings whose **location** intersects package **destination** bbox or within **N km** of trailhead/base city.
- **Secondary**: explicit **curated links** (admin or provider) in `service_listing_package_links`.
- **Tertiary**: collaborative filtering later (users who booked X booked Y).

Efficient implementation:

- Store **normalized destination_id** on packages and listings; index **GiST** on `location` for radius queries.
- Materialized view or nightly job: `package_id → nearby_listing_ids` for hot packages (optional at scale).
- API: `GET /api/packages/:slug/related-services?types=stay,rental,activity&limit=12`.

## Admin

- CRUD categories and **fee rules** (mirror trip package fee column patterns).
- Moderate listings, featured flags, fraud flags.
- Analytics: conversion by category, attach rate from package pages.

## Phased delivery

| Phase | Scope |
|-------|--------|
| **P0** | Schema + provider listing CRUD + public listing page + single category pilot (e.g. stay) |
| **P1** | Package page module “Nearby services” + geo queries + platform fee on checkout |
| **P2** | Cross-listing graph, bundles, provider dashboard |
| **P3** | Calendar sync, inventory, disputes |

## Risks / decisions

- **Payments**: **Locked for v1** — separate checkout per listing vs trip; no combined cart. See [service-marketplace-decisions.md](./service-marketplace-decisions.md).
- **Liability & insurance**: category-specific terms; display on listing.
- **Search cost**: Geo queries must be indexed; cache popular package pages.
- **Spam**: rate limits, verification gates before appearing on package pages.

## Efficiency notes

- Reuse **existing** destination/trip tables where possible.
- **Read path** for package page: one aggregated query or edge-cached JSON for “related services” to keep TTFB low.
- **Write path**: async indexing when listing location or package destination changes.

## Locked product decisions

Cross-sell priority, checkout model, and trip-page copy rules: [service-marketplace-decisions.md](./service-marketplace-decisions.md).

This document is a planning artifact only; implementation should follow P0 → P1 after schema work; payment shape for listings follows **service-marketplace-decisions.md**.
