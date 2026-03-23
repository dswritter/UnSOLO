-- ============================================================
-- 016: Admin-Managed Discounts & Offers
-- ============================================================

CREATE TABLE IF NOT EXISTS discount_offers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('referral', 'loyalty', 'promo', 'custom')),
  discount_paise INTEGER NOT NULL CHECK (discount_paise > 0),
  min_trips INTEGER DEFAULT 0,       -- loyalty: min completed trips to qualify
  promo_code TEXT UNIQUE,             -- promo: code user enters at checkout
  max_uses INTEGER,                   -- null = unlimited
  used_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE discount_offers ENABLE ROW LEVEL SECURITY;

-- Anyone can read active offers (needed for checkout validation)
CREATE POLICY "Anyone reads active offers" ON discount_offers
  FOR SELECT USING (true);

-- Only admins can insert/update
CREATE POLICY "Admins manage offers" ON discount_offers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins update offers" ON discount_offers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
