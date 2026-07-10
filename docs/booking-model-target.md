# Booking model — target architecture (end state)

Status: **approved design**, migrating in phases. This is the north star for the
booking money + history refactor. Today's code mutates `total`/`deposit` in place
(recomputed ~4 different ways) and scatters history across 4 stores; this replaces
that with **ledgers as the source of truth + a cached header + one adjustment log**.

## Locked decisions
1. Dedicated **`booking_discounts`** table (not columns).
2. `bookings.traveller_details` **kept as a synced cache** during transition (many readers).
3. Keep the **4 cache columns** on `bookings` (`total_amount_paise`, `amount_collected_paise`,
   `amount_refunded_paise`, `balance_due_paise`) — recomputed by one function, never hand-set.

## Source-of-truth tables
- **`booking_line_items`** — priced units. `kind='traveller'` (trips) or `'unit'` (stays/rentals/
  activities). `quantity × unit_price_paise = gross_paise`. Soft-cancel via `status`.
  Total (pre-discount) = Σ active `gross_paise`.
- **`booking_discounts`** — stackable: `source in (coupon,referral,wallet,manual)`, `amount_paise`,
  `status`. Coupon change re-derives only the `coupon` row against current gross.
- **`booking_payments`** — append-only captures (online + offline). `collected = Σ amount_paise`.
  Replaces `razorpay_payment_ids[]` + `stripe_payment_intent` + manual deposit bumps.
- **`booking_refunds`** — append-only, ONE pipeline for full & partial. `method`, `status`
  (pending|processing|completed|failed), host/platform/writeoff split computed once here.
  `refunded = Σ completed`. Replaces scalar `refund_*` and `booking_partial_cancellations.refund_*`.
- **`booking_adjustments`** — append-only history = the timeline. Types: traveller_add,
  traveller_cancel, traveller_edit, tier_change, coupon_change, date_change, poc_change,
  transfer, price_override, full_cancel, note. `status` requested|approved|denied|applied|
  superseded. Absorbs `booking_partial_cancellations` + `booking_change_requests`. Links to
  the `booking_refunds` row it caused.

## `bookings` header
- Keep: identity + lifecycle (`status`, `confirmation_code`, POC, dates).
- Cache (recomputed by `recompute_booking_financials(booking_id)`): the 4 columns above.
- Retire (later): `traveller_details`→line items · payments arrays→payments · `refund_*`,
  `cancellation_status`→refunds+adjustments · `discount_paise`,`gross_paise`,`promo_offer_id`→discounts.

## One recompute path
`recompute_booking_financials(booking_id)`:
`total = Σ active line gross − Σ active discounts`; `collected = Σ payments`;
`refunded = Σ completed refunds`; `balance = total − collected`. Updates the 4 cache columns +
recomputes `host_earnings` from the same numbers (one split fn). Called after any ledger/line write.

## Current → target mapping
- `booking_partial_cancellations` → `booking_adjustments(traveller_cancel)` + `booking_refunds` + cancelled line items.
- `booking_change_requests` → `booking_adjustments(traveller_edit|tier_change, status=requested→approved)`.
- scalar `refund_*` → `booking_refunds`. `razorpay_payment_ids[]`/`stripe_payment_intent` → `booking_payments`.
- `audit_logs` stays for admin-internal actions; customer/host timeline reads `booking_adjustments`.

## Phased migration
- **Phase 0 — bug fixes in current structure** (no new tables): de-dup `refundAcrossPayments`;
  fix stale `gross_paise` on add-travellers; audit-log partial cancels + change approvals;
  (earnings-split unification deferred to Phase 2 where the refund ledger lands).
- **Phase 1 — pricing engine**: extract `computeBookingTotals`; route tier/coupon/partial/add through it.
- **Phase 2 — ledgers**: add `booking_payments` + `booking_refunds`; dual-write; collapse the two
  refund state machines; one host-earnings split fn.
- **Phase 3 — adjustments + timeline**: add `booking_adjustments` (+ backfill); one `<BookingActivity>`
  in admin/host/user.
- **Phase 4 — missing flows**: post-payment date change + POC/transfer as adjustments; stays/rentals alter/add/remove.
- **Phase 5 — UI unification**: one role-aware responsive `<BookingManagement>`.

Migration is non-destructive per phase: add → backfill → dual-write → cut over reads → retire old columns last.
