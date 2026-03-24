-- ============================================================
-- 017: Peer-to-Peer Trip Hosting System
-- ============================================================

-- ── Extend profiles for hosting ─────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_host BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS host_rating NUMERIC(3,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_hosted_trips INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- ── Extend packages for peer hosting ────────────────────────
ALTER TABLE packages ADD COLUMN IF NOT EXISTS host_id UUID REFERENCES profiles(id);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'approved'
  CHECK (moderation_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE packages ADD COLUMN IF NOT EXISTS join_preferences JSONB DEFAULT '{}';
ALTER TABLE packages ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;

-- Index for fast host dashboard queries
CREATE INDEX IF NOT EXISTS idx_packages_host_id ON packages(host_id) WHERE host_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packages_moderation ON packages(moderation_status) WHERE host_id IS NOT NULL;

-- ── Join Requests ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS join_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  message TEXT,
  host_response TEXT,
  payment_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_join_requests_trip ON join_requests(trip_id, status);
CREATE INDEX IF NOT EXISTS idx_join_requests_user ON join_requests(user_id, status);

ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;

-- Users can see own requests
CREATE POLICY "Users see own join requests" ON join_requests
  FOR SELECT USING (
    auth.uid() = user_id
    OR trip_id IN (SELECT id FROM packages WHERE host_id = auth.uid())
  );

-- Users can create requests for themselves
CREATE POLICY "Users create own join requests" ON join_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Host can update requests for their trips, user can withdraw own
CREATE POLICY "Host or user updates join requests" ON join_requests
  FOR UPDATE USING (
    auth.uid() = user_id
    OR trip_id IN (SELECT id FROM packages WHERE host_id = auth.uid())
  );

-- ── Host Earnings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS host_earnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id),
  host_id UUID NOT NULL REFERENCES profiles(id),
  total_paise INTEGER NOT NULL,
  platform_fee_paise INTEGER NOT NULL,
  host_paise INTEGER NOT NULL,
  payout_status TEXT DEFAULT 'pending' CHECK (payout_status IN ('pending', 'processing', 'completed')),
  payout_date TIMESTAMPTZ,
  payout_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_host_earnings_host ON host_earnings(host_id, payout_status);

ALTER TABLE host_earnings ENABLE ROW LEVEL SECURITY;

-- Host sees own earnings
CREATE POLICY "Host sees own earnings" ON host_earnings
  FOR SELECT USING (auth.uid() = host_id);

-- Only service role inserts (server actions)
CREATE POLICY "Service inserts earnings" ON host_earnings
  FOR INSERT WITH CHECK (true);

-- ── Host Reviews ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS host_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id),
  reviewer_id UUID NOT NULL REFERENCES profiles(id),
  host_id UUID NOT NULL REFERENCES profiles(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(booking_id, reviewer_id)
);

ALTER TABLE host_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads host reviews" ON host_reviews FOR SELECT USING (true);
CREATE POLICY "Auth users create host reviews" ON host_reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- Auto-update host rating on new review
CREATE OR REPLACE FUNCTION update_host_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET host_rating = (
    SELECT ROUND(AVG(rating)::numeric, 2) FROM host_reviews WHERE host_id = NEW.host_id
  ) WHERE id = NEW.host_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_host_rating ON host_reviews;
CREATE TRIGGER trg_update_host_rating
  AFTER INSERT OR UPDATE ON host_reviews
  FOR EACH ROW EXECUTE FUNCTION update_host_rating();

-- ── Phone OTP Verifications ─────────────────────────────────
CREATE TABLE IF NOT EXISTS phone_otp_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT false,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE phone_otp_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own OTP records" ON phone_otp_verifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users create own OTP" ON phone_otp_verifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own OTP" ON phone_otp_verifications
  FOR UPDATE USING (auth.uid() = user_id);

-- ── Enable realtime for join requests ───────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE join_requests;
