-- Record the amount Razorpay ACTUALLY refunded, separate from what we requested.
--
-- Razorpay can refund less than asked (e.g. part of a payment wasn't refundable).
-- Previously the webhook marked a refund "completed" using our requested figure
-- regardless of the real amount, so our records could overstate what the customer
-- got back. These columns store the actual refunded amount from the
-- refund.processed webhook so the two can be reconciled. (C8)
--
-- The webhook writes these best-effort (a separate update), so the code is safe to
-- deploy before this migration is applied — the amount just won't be recorded yet.

alter table public.bookings
  add column if not exists refund_completed_paise integer;

alter table public.booking_partial_cancellations
  add column if not exists refund_completed_paise integer;
