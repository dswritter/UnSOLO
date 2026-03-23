-- ============================================================
-- 015: Referrals, Audit Log, Duplicate Prevention, Refund Guard
-- ============================================================

-- ── Referral columns on profiles ────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_credits_paise INTEGER DEFAULT 0;

-- Auto-generate referral code for existing users who don't have one
UPDATE profiles
SET referral_code = UPPER(SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- Trigger: auto-generate referral code on new profile insert
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := UPPER(SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_referral_code ON profiles;
CREATE TRIGGER trg_generate_referral_code
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION generate_referral_code();

-- ── Referrals tracking table ────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'credited', 'expired')),
  credited_at TIMESTAMPTZ,
  booking_id UUID REFERENCES bookings(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referrer_id, referred_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own referrals" ON referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
CREATE POLICY "System inserts referrals" ON referrals
  FOR INSERT WITH CHECK (true);
CREATE POLICY "System updates referrals" ON referrals
  FOR UPDATE USING (true);

-- ── Admin Audit Log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'booking', 'package', 'profile', 'group_booking'
  target_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins see audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin'))
  );
CREATE POLICY "System inserts audit logs" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- ── Booking safety columns ──────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_initiated_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_paise INTEGER DEFAULT 0;

-- ── Duplicate booking prevention (DB-level) ─────────────────
-- Prevents same user from having multiple active bookings for same package+date
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_booking
  ON bookings(user_id, package_id, travel_date)
  WHERE status IN ('pending', 'confirmed');
