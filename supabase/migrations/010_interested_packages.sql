-- ============================================================
-- 010: Package interest (like movie tickets "I'm Interested")
-- ============================================================

CREATE TABLE IF NOT EXISTS package_interests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(package_id, user_id)
);

ALTER TABLE package_interests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can see interest counts" ON package_interests FOR SELECT USING (true);
CREATE POLICY "Auth users mark interest" ON package_interests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Auth users remove interest" ON package_interests FOR DELETE USING (auth.uid() = user_id);
