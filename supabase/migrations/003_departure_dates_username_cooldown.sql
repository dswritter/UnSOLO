-- Add departure_dates column to packages
ALTER TABLE packages ADD COLUMN IF NOT EXISTS departure_dates DATE[];

-- Add username_changed_at to profiles for 40-day cooldown
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

-- Create custom_date_requests table
CREATE TABLE IF NOT EXISTS custom_date_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  package_id UUID REFERENCES packages(id),
  requested_date DATE NOT NULL,
  guests INTEGER DEFAULT 1,
  contact_number TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE custom_date_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cdr_select_own" ON custom_date_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cdr_insert_auth" ON custom_date_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add sample departure dates to all packages
UPDATE packages SET departure_dates = ARRAY['2026-04-15','2026-05-01','2026-05-15']::DATE[] WHERE slug = 'rishikesh-adventure-camp';
UPDATE packages SET departure_dates = ARRAY['2026-04-20','2026-05-10','2026-06-01']::DATE[] WHERE slug = 'spiti-valley-expedition';
UPDATE packages SET departure_dates = ARRAY['2026-04-10','2026-04-25','2026-05-05']::DATE[] WHERE slug = 'kerala-backwaters-escape';
UPDATE packages SET departure_dates = ARRAY['2026-04-12','2026-05-03','2026-05-20']::DATE[] WHERE slug = 'jaisalmer-desert-safari';
UPDATE packages SET departure_dates = ARRAY['2026-06-01','2026-06-15','2026-07-01']::DATE[] WHERE slug = 'pangong-lake-road-trip';
UPDATE packages SET departure_dates = ARRAY['2026-04-05','2026-04-18','2026-05-08']::DATE[] WHERE slug = 'valley-of-flowers-trek';
UPDATE packages SET departure_dates = ARRAY['2026-04-01','2026-04-15','2026-05-01']::DATE[] WHERE slug = 'manali-snow-retreat';
UPDATE packages SET departure_dates = ARRAY['2026-04-08','2026-04-22','2026-05-10']::DATE[] WHERE slug = 'munnar-tea-trail';
UPDATE packages SET departure_dates = ARRAY['2026-04-03','2026-04-17','2026-05-01']::DATE[] WHERE slug = 'north-goa-beach-hop';
UPDATE packages SET departure_dates = ARRAY['2026-05-15','2026-06-01','2026-06-15']::DATE[] WHERE slug = 'leh-monastery-circuit';

-- Fix broken image URLs
UPDATE packages SET images = ARRAY['https://images.unsplash.com/photo-1545652985-5edd365b12eb?w=800&q=80']
WHERE slug = 'rishikesh-adventure-camp';

UPDATE packages SET images = ARRAY['https://images.unsplash.com/photo-1626015365107-80c4ad468739?w=800&q=80']
WHERE slug = 'pangong-lake-road-trip';
