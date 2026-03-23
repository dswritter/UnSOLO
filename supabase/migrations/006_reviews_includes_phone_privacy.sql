-- ============================================================
-- 006: Reviews with 2 rating categories, includes_options table,
--      phone visibility & phone number request system
-- ============================================================

-- ── 1. Alter reviews to add dual rating categories ──────────
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS rating_destination INTEGER DEFAULT 0 CHECK (rating_destination >= 0 AND rating_destination <= 5),
  ADD COLUMN IF NOT EXISTS rating_experience  INTEGER DEFAULT 0 CHECK (rating_experience >= 0 AND rating_experience <= 5);

-- Backfill existing reviews (copy single rating into both)
UPDATE reviews SET rating_destination = rating, rating_experience = rating WHERE rating_destination = 0 AND rating_experience = 0;

-- ── 2. includes_options table (saved facility checkboxes) ───
CREATE TABLE IF NOT EXISTS includes_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed common options
INSERT INTO includes_options (label) VALUES
  ('Accommodation'), ('Meals'), ('Transport'), ('Guide'), ('Camping Gear'),
  ('First Aid Kit'), ('Bonfire'), ('Photography'), ('Insurance'),
  ('Entry Tickets'), ('Snacks'), ('Drinking Water'), ('Rafting Equipment'),
  ('Trekking Poles'), ('Sleeping Bags'), ('WiFi'), ('Airport Pickup')
ON CONFLICT (label) DO NOTHING;

-- RLS for includes_options
ALTER TABLE includes_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read includes_options" ON includes_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage includes_options" ON includes_options FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ── 3. Phone visibility on profiles ─────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS phone_public BOOLEAN DEFAULT false;

-- ── 4. Phone number requests table ──────────────────────────
CREATE TABLE IF NOT EXISTS phone_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (requester_id, target_id)
);

ALTER TABLE phone_requests ENABLE ROW LEVEL SECURITY;

-- Requester can see their own requests
CREATE POLICY "Users see own phone requests" ON phone_requests
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = target_id);

-- Users can create requests
CREATE POLICY "Users can request phone numbers" ON phone_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- Target user can approve/reject
CREATE POLICY "Target can update phone requests" ON phone_requests
  FOR UPDATE USING (auth.uid() = target_id);

-- ── 5. RLS for reviews: allow users to insert their own ─────
-- Drop old policy if exists and recreate
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create own reviews" ON reviews;
  DROP POLICY IF EXISTS "Anyone can read reviews" ON reviews;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Anyone can read reviews" ON reviews FOR SELECT USING (true);
CREATE POLICY "Users can create own reviews" ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
