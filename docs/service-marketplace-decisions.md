# Service marketplace — product decisions (v1)

This document locks decisions called out in the service listings alignment review. It does not replace [service-provider-listings-plan.md](./service-provider-listings-plan.md); it narrows open questions so engineering and copy stay consistent.

---

## 1. Checkout: trip + service listings

**Decision (v1): separate bookings, not a unified cart**

- A **package/trip** purchase and a **service listing** purchase are **independent Razorpay checkouts** (each produces its own order / booking record, analogous to booking two trips today).
- Users may complete them in any order; there is **no single combined cart** in v1.
- **Bundle discounts** and **“pay once for trip + add-ons”** are explicitly **out of scope for v1**; revisit when a cart or `order_group` model exists (see phased plan P2+).

**Rationale:** Matches current UnSOLO flows, minimizes payment and refund complexity, and unblocks P1 “related services” as **discovery + deep link to listing checkout** without new payment orchestration.

**UX implication:** The **sticky booking card** “Add experiences” line items from the trip-details UX spec (`Docs and Creatives/Docs/trip_details_ux.md`) are **deferred** until a cart or bundled checkout exists. Primary v1 path: **carousel rows** (Activities / Stays) with **View** → listing detail → **Book** on that listing.

---

## 2. Ship order: package cross-sell vs Explore tabs

**Decision:** Priority order for **discovery** and **engineering**

1. **P0** — Schema, provider listing CRUD, public listing detail, one category pilot (e.g. stay), admin moderation.
2. **P1** — **Package page** “related services” module (geo + optional curated links, API such as `GET /api/packages/:slug/related-services`). This is the **high-intent** surface and matches the trip-details UX cross-sell placement.
3. **Explore expansion** — **Stays / Activities** (and rentals via filters) as **tabs or equivalent** on Explore **after** P1 is usable with real or seed listings, so grids are not empty and filters have meaning.

**Parallel UX (optional):** Explore may show **tabs early** with **only Trips** populated and Stays/Activities **disabled or hidden** until inventory exists, to avoid empty-state clutter.

**Rationale:** Aligns the technical plan (package-first discovery in P1) with the UX docs while still allowing tab chrome in Phase 1 for navigation consistency.

---

## 3. Copy: linking services to trips

Use **one primary section title** per package page render, driven by **data source** (not random wording):

| Backend signal | Section title (example) | Notes |
|----------------|-------------------------|--------|
| At least one **curated** link (`service_listing_package_links` with `recommended` or `manual`, or `link_type` indicating editorial pick) | **Recommended for this trip** | Prefer when present; builds trust (“picked for this itinerary”). |
| **No** curated links, **geo** only | **Near this trip** or **Near {destinationName}** | Matches “nearby” / radius logic; honest if not hand-picked. |
| Browse-only / destination-wide fallback (Explore-style) | **Also in {Location}** | OK for broader grids or secondary modules; avoid implying hand-curation. |

**Subsections / carousels:** Use **Activities** and **Stays** (and **Rentals** or **Getting around** as a row or filter under Activities if not a fourth tab).

**Do not** mix “Recommended” and “Also in” as the **same** section title; pick one rule per page load from the table above.

---

## References

- [service-provider-listings-plan.md](./service-provider-listings-plan.md) — schema, phases, APIs.
- UX: `Docs and Creatives/Docs/trip_details_ux.md`, `Service_listing_ux_layout.md`, `Service listing and UserExp plan.md`.
