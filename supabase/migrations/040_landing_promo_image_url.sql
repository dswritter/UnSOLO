-- Optional hero/thumbnail image for home promo cards (URL to hosted image).

ALTER TABLE landing_promo_cards
  ADD COLUMN IF NOT EXISTS image_url TEXT;
