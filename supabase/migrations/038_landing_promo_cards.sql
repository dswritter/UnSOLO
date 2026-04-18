-- Timed / dismissible promo cards on the marketing home page (admin-managed).

CREATE TABLE IF NOT EXISTS landing_promo_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,
  link_label TEXT,
  variant TEXT NOT NULL DEFAULT 'primary' CHECK (variant IN ('primary', 'neutral', 'success')),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_promo_cards_active ON landing_promo_cards (is_active, sort_order);

ALTER TABLE landing_promo_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_promo_select_active"
  ON landing_promo_cards
  FOR SELECT
  USING (
    is_active
    AND (starts_at IS NULL OR starts_at <= NOW())
    AND (ends_at IS NULL OR ends_at >= NOW())
  );

CREATE POLICY "landing_promo_admin_all"
  ON landing_promo_cards
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
