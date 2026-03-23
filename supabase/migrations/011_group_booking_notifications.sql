-- ============================================================
-- 011: Group Bookings + In-App Notifications
-- ============================================================

-- ── In-App Notifications ────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'message', 'booking', 'phone_request', 'group_invite', 'split_payment'
  title TEXT NOT NULL,
  body TEXT,
  link TEXT, -- URL to navigate to
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can create notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- ── Group Bookings ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES packages(id),
  organizer_id UUID NOT NULL REFERENCES profiles(id),
  travel_date DATE NOT NULL,
  total_amount_paise INTEGER NOT NULL,
  per_person_paise INTEGER NOT NULL,
  max_members INTEGER DEFAULT 10,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'confirmed', 'cancelled', 'completed')),
  invite_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(4), 'hex'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE group_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can see group bookings" ON group_bookings FOR SELECT USING (true);
CREATE POLICY "Auth users create group bookings" ON group_bookings FOR INSERT WITH CHECK (auth.uid() = organizer_id);
CREATE POLICY "Organizer updates group" ON group_bookings FOR UPDATE USING (auth.uid() = organizer_id);

-- ── Group Members / Split Payments ──────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES group_bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  status TEXT DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'paid', 'declined')),
  amount_paise INTEGER NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  razorpay_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can see group" ON group_members FOR SELECT USING (true);
CREATE POLICY "Auth users join groups" ON group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members update own" ON group_members FOR UPDATE USING (auth.uid() = user_id);

-- ── Helper: Create notification ─────────────────────────────
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_body, p_link, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
