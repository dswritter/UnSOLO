-- Track how a cancellation refund was settled: via the Razorpay gateway or
-- recorded offline by an admin (cash / bank transfer paid outside the app).
--
-- Lets the admin booking panel offer an "offline refund" path alongside the
-- existing "Initiate Razorpay Refund" flow, and keeps an auditable record of
-- which method credited the customer.
--
-- Written best-effort by the server actions (a separate update), so the code is
-- safe to deploy before this migration is applied — the method just won't be
-- recorded yet. Values used by the app: 'razorpay' | 'offline'.

alter table public.bookings
  add column if not exists refund_method text;

alter table public.booking_partial_cancellations
  add column if not exists refund_method text;
