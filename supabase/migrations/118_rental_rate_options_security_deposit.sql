-- ============================================================
-- 118: Optional rental rate options and refundable security deposit.
--
-- Rental items keep their standard rate (price_paise per unit). Hosts can
-- optionally add a 24-hour rate, a daytime rate with its time window, and a
-- refundable security deposit. All columns are NULL unless the host adds them.
--
-- Bookings record which rate the traveller chose and the deposit collected on
-- top of the rental charge. The deposit is not part of gross_paise (no platform
-- fee, promos or credits) and is refunded in full on cancellation, or settled
-- by staff after the rental (fully returned or partly retained for damage /
-- penalties).
-- ============================================================
BEGIN;

ALTER TABLE public.service_listing_items
  ADD COLUMN IF NOT EXISTS full_day_price_paise INTEGER NULL
    CHECK (full_day_price_paise IS NULL OR full_day_price_paise > 0),
  ADD COLUMN IF NOT EXISTS daytime_price_paise INTEGER NULL
    CHECK (daytime_price_paise IS NULL OR daytime_price_paise > 0),
  ADD COLUMN IF NOT EXISTS daytime_start TEXT NULL
    CHECK (daytime_start IS NULL OR daytime_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD COLUMN IF NOT EXISTS daytime_end TEXT NULL
    CHECK (daytime_end IS NULL OR daytime_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD COLUMN IF NOT EXISTS security_deposit_paise INTEGER NULL
    CHECK (security_deposit_paise IS NULL OR security_deposit_paise > 0);

ALTER TABLE public.service_listing_items
  DROP CONSTRAINT IF EXISTS service_listing_items_daytime_window;
ALTER TABLE public.service_listing_items
  ADD CONSTRAINT service_listing_items_daytime_window CHECK (
    (daytime_price_paise IS NULL AND daytime_start IS NULL AND daytime_end IS NULL)
    OR (daytime_price_paise IS NOT NULL AND daytime_start IS NOT NULL AND daytime_end IS NOT NULL
        AND daytime_start < daytime_end)
  );

COMMENT ON COLUMN public.service_listing_items.full_day_price_paise IS 'Optional rental price per 24 hours.';
COMMENT ON COLUMN public.service_listing_items.daytime_price_paise IS 'Optional rental price for the daytime window (daytime_start to daytime_end) per day.';
COMMENT ON COLUMN public.service_listing_items.security_deposit_paise IS 'Optional refundable deposit per unit, collected on top of the rental charge.';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rental_rate_option TEXT NULL
    CHECK (rental_rate_option IS NULL OR rental_rate_option IN ('standard', 'full_day', 'daytime')),
  ADD COLUMN IF NOT EXISTS security_deposit_paise INTEGER NULL
    CHECK (security_deposit_paise IS NULL OR security_deposit_paise >= 0),
  ADD COLUMN IF NOT EXISTS security_deposit_status TEXT NULL
    CHECK (security_deposit_status IS NULL OR security_deposit_status IN ('held', 'refunded', 'partially_refunded', 'retained')),
  ADD COLUMN IF NOT EXISTS security_deposit_refunded_paise INTEGER NULL
    CHECK (security_deposit_refunded_paise IS NULL OR security_deposit_refunded_paise >= 0),
  ADD COLUMN IF NOT EXISTS security_deposit_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS security_deposit_settled_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.bookings.security_deposit_paise IS 'Refundable rental deposit collected on top of the rental charge (not in gross_paise).';

NOTIFY pgrst, 'reload schema';
COMMIT;
