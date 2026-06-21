-- Track every captured Razorpay payment on a booking, not just the latest.
--
-- Token-deposit trips capture money in two payments: the token (first order) and
-- the balance (second order). Previously each capture overwrote
-- stripe_payment_intent, so only the LAST payment id survived. A refund can only
-- be issued against the payment that actually captured the money, and never for
-- more than that payment's amount — so the token portion became unrefundable
-- automatically.
--
-- This column stores [{ "id": "<razorpay_payment_id>", "amount": <paise> }, ...]
-- so refunds can be allocated across the real captured payments.
-- stripe_payment_intent is kept as-is (latest payment) for display/back-compat.

alter table public.bookings
  add column if not exists razorpay_payment_ids jsonb not null default '[]'::jsonb;
