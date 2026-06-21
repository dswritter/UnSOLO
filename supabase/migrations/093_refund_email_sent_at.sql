-- Track when the "refund processed" receipt email was sent to the customer, so
-- admins/hosts can see on the booking that it went out (and we don't double-send).
-- Written best-effort, so safe to deploy before applying.

alter table public.bookings
  add column if not exists refund_email_sent_at timestamptz;

alter table public.booking_partial_cancellations
  add column if not exists refund_email_sent_at timestamptz;
