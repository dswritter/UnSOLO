-- UnSOLO Travel Platform - Initial Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===================
-- PROFILES
-- ===================
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT UNIQUE NOT NULL,
  full_name       TEXT,
  avatar_url      TEXT,
  bio             TEXT,
  location        TEXT,
  travel_style    TEXT[],
  languages       TEXT[],
  instagram_url   TEXT,
  website_url     TEXT,
  is_verified     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- DESTINATIONS
-- ===================
CREATE TABLE IF NOT EXISTS destinations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  state       TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'India',
  slug        TEXT UNIQUE NOT NULL,
  image_url   TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- PACKAGES
-- ===================
CREATE TABLE IF NOT EXISTS packages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id    UUID REFERENCES destinations(id),
  title             TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  description       TEXT NOT NULL,
  short_description TEXT,
  price_paise       INTEGER NOT NULL,
  duration_days     INTEGER NOT NULL,
  max_group_size    INTEGER DEFAULT 12,
  difficulty        TEXT DEFAULT 'moderate' CHECK (difficulty IN ('easy','moderate','challenging')),
  includes          TEXT[],
  images            TEXT[],
  is_featured       BOOLEAN DEFAULT false,
  is_active         BOOLEAN DEFAULT true,
  stripe_price_id   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- BOOKINGS
-- ===================
CREATE TABLE IF NOT EXISTS bookings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES profiles(id) NOT NULL,
  package_id            UUID REFERENCES packages(id) NOT NULL,
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  travel_date           DATE NOT NULL,
  guests                INTEGER DEFAULT 1,
  total_amount_paise    INTEGER NOT NULL,
  stripe_session_id     TEXT UNIQUE,
  stripe_payment_intent TEXT,
  confirmation_code     TEXT UNIQUE,
  special_requests      TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- CHAT ROOMS
-- ===================
CREATE TABLE IF NOT EXISTS chat_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT DEFAULT 'general' CHECK (type IN ('trip','general','direct')),
  package_id  UUID REFERENCES packages(id),
  created_by  UUID REFERENCES profiles(id),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- CHAT ROOM MEMBERS
-- ===================
CREATE TABLE IF NOT EXISTS chat_room_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  last_read   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

-- ===================
-- MESSAGES
-- ===================
CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES profiles(id),
  content       TEXT NOT NULL,
  message_type  TEXT DEFAULT 'text' CHECK (message_type IN ('text','image','system')),
  is_edited     BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- REVIEWS
-- ===================
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID REFERENCES bookings(id) UNIQUE,
  user_id     UUID REFERENCES profiles(id),
  package_id  UUID REFERENCES packages(id),
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  title       TEXT,
  body        TEXT,
  images      TEXT[],
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- USER ACHIEVEMENTS
-- ===================
CREATE TABLE IF NOT EXISTS user_achievements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES profiles(id),
  achievement_key TEXT NOT NULL,
  earned_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, achievement_key)
);

-- ===================
-- LEADERBOARD SCORES
-- ===================
CREATE TABLE IF NOT EXISTS leaderboard_scores (
  user_id             UUID PRIMARY KEY REFERENCES profiles(id),
  trips_completed     INTEGER DEFAULT 0,
  reviews_written     INTEGER DEFAULT 0,
  destinations_count  INTEGER DEFAULT 0,
  total_score         INTEGER GENERATED ALWAYS AS
                      (trips_completed * 10 + reviews_written * 5 + destinations_count * 15)
                      STORED,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ===================
-- INDEXES
-- ===================
CREATE INDEX IF NOT EXISTS idx_packages_destination ON packages(destination_id);
CREATE INDEX IF NOT EXISTS idx_packages_slug ON packages(slug);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_scores ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can read, only owner can update
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Destinations: public read
CREATE POLICY "destinations_select_all" ON destinations FOR SELECT USING (true);

-- Packages: public read
CREATE POLICY "packages_select_all" ON packages FOR SELECT USING (true);

-- Bookings: users see only their own, service role bypasses
CREATE POLICY "bookings_select_own" ON bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bookings_insert_own" ON bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bookings_update_own" ON bookings FOR UPDATE USING (auth.uid() = user_id);

-- Chat rooms: public read
CREATE POLICY "chat_rooms_select_all" ON chat_rooms FOR SELECT USING (true);
CREATE POLICY "chat_rooms_insert_auth" ON chat_rooms FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Chat room members: own rows
CREATE POLICY "members_select_all" ON chat_room_members FOR SELECT USING (true);
CREATE POLICY "members_insert_auth" ON chat_room_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "members_delete_own" ON chat_room_members FOR DELETE USING (auth.uid() = user_id);

-- Messages: members can read and insert
CREATE POLICY "messages_select_all" ON messages FOR SELECT USING (true);
CREATE POLICY "messages_insert_auth" ON messages FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' OR auth.role() = 'service_role'
);

-- Reviews: anyone reads, only booking owner can insert
CREATE POLICY "reviews_select_all" ON reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert_own" ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Achievements: anyone reads
CREATE POLICY "achievements_select_all" ON user_achievements FOR SELECT USING (true);
CREATE POLICY "achievements_insert_service" ON user_achievements FOR INSERT WITH CHECK (
  auth.role() = 'service_role' OR auth.uid() = user_id
);

-- Leaderboard: anyone reads
CREATE POLICY "leaderboard_select_all" ON leaderboard_scores FOR SELECT USING (true);

-- ===================
-- TRIGGER: auto-create profile on signup
-- ===================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-zA-Z0-9]', '', 'g')) || FLOOR(RANDOM() * 999)::TEXT
    ),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ===================
-- TRIGGER: update updated_at
-- ===================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
