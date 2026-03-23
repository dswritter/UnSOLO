-- ============================================================
-- Admin Roles & Team Members
-- ============================================================

-- Add role column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin', 'social_media_manager', 'field_person', 'chat_responder'));

-- Team members table for managing staff
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'social_media_manager', 'field_person', 'chat_responder')),
  added_by UUID REFERENCES profiles(id),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id) -- one role per user
);

-- Booking POC (point of contact) assignment
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_poc UUID REFERENCES profiles(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS poc_shared_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Custom date requests — add assigned_to and admin_notes
ALTER TABLE custom_date_requests ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id);
ALTER TABLE custom_date_requests ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- RLS policies for team_members
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Admins can do everything on team_members
CREATE POLICY "Admins manage team" ON team_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Team members can read their own record
CREATE POLICY "Team members read own" ON team_members
  FOR SELECT USING (user_id = auth.uid());

-- Admins can read all bookings (already public read, but adding explicit)
-- Admins can update bookings (assign POC, add notes)
CREATE POLICY "Admins update bookings" ON bookings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'social_media_manager'))
  );

-- Admins can update custom_date_requests
CREATE POLICY "Admins update requests" ON custom_date_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'social_media_manager', 'field_person'))
  );

-- Set your admin user (run this after with your actual user ID)
-- UPDATE profiles SET role = 'admin' WHERE email = 'your-admin@email.com';

-- Index for quick role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_team_members_active ON team_members(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
