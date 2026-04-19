-- Service marketplace: Stays, Activities, Rentals, Getting Around
CREATE TABLE service_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  short_description TEXT,
  type TEXT NOT NULL CHECK (type IN ('stays', 'activities', 'rentals', 'getting_around')),

  -- Pricing (same structure as packages)
  price_paise INTEGER NOT NULL, -- base/starting price
  price_variants JSONB, -- [{ description, price_paise }]
  unit TEXT NOT NULL CHECK (unit IN ('per_night', 'per_person', 'per_day', 'per_hour', 'per_week')),

  -- Shared metadata
  location TEXT NOT NULL, -- human-readable (e.g., "Manali, HP")
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE RESTRICT,
  latitude DECIMAL(9, 6),
  longitude DECIMAL(9, 6),

  -- Capacity / inventory
  max_guests_per_booking INTEGER,
  quantity_available INTEGER, -- # of units/rooms/bikes available

  -- Images & content
  images TEXT[] DEFAULT '{}', -- array of S3 URLs
  amenities TEXT[] DEFAULT '{}', -- ["WiFi", "AC", "Kitchen", ...]
  tags TEXT[] DEFAULT '{}', -- ["Adventure", "Cultural", "Budget-friendly", ...]

  -- Type-specific fields (JSONB for flexibility)
  -- For stays: num_rooms, num_bathrooms, check_in_time, check_out_time
  -- For activities: duration_hours, activity_category, guide_included, difficulty
  -- For rentals: vehicle_type, fuel_type, mileage_limit_km
  -- For getting_around: transport_type, capacity_persons
  metadata JSONB,

  -- Host (community-hosted listings) or NULL (UnSOLO-hosted)
  host_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Moderation
  is_active BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'archived')),

  -- Ratings
  average_rating DECIMAL(2, 1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for discovery
CREATE INDEX idx_service_listings_type_active ON service_listings(type, is_active);
CREATE INDEX idx_service_listings_destination ON service_listings(destination_id, is_active);
CREATE INDEX idx_service_listings_featured ON service_listings(is_featured, type);
CREATE INDEX idx_service_listings_slug ON service_listings(slug);
CREATE INDEX idx_service_listings_host ON service_listings(host_id);
CREATE INDEX idx_service_listings_rating ON service_listings(average_rating DESC, review_count DESC) WHERE is_active = true;

-- Row-Level Security
ALTER TABLE service_listings ENABLE ROW LEVEL SECURITY;

-- Public can view active listings
CREATE POLICY "Public can view active service listings"
  ON service_listings FOR SELECT
  USING (is_active = true OR auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'admin' OR role = 'moderator'
  ));

-- Hosts can view their own listings
CREATE POLICY "Hosts can view their own service listings"
  ON service_listings FOR SELECT
  USING (host_id = auth.uid());

-- Admins can manage all listings
CREATE POLICY "Admins can manage all service listings"
  ON service_listings FOR ALL
  USING (auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'admin'
  ));

-- Hosts can insert (creates as pending)
CREATE POLICY "Hosts can create service listings"
  ON service_listings FOR INSERT
  WITH CHECK (host_id = auth.uid() AND status = 'pending');

-- Hosts can update their own listings
CREATE POLICY "Hosts can update their own service listings"
  ON service_listings FOR UPDATE
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());
