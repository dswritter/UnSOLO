-- 075: Public offers page sections + admin-controlled ordering

CREATE TABLE IF NOT EXISTS offer_page_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual_discounts', 'auto_bundle')),
  bundle_kind TEXT CHECK (
    bundle_kind IN (
      'trip_stay',
      'trip_activity',
      'trip_rental',
      'stay_activity',
      'stay_rental',
      'rental_activity'
    )
  ),
  hero_badge TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  position_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offer_page_section_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES offer_page_sections(id) ON DELETE CASCADE,
  discount_offer_id UUID NOT NULL REFERENCES discount_offers(id) ON DELETE CASCADE,
  position_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section_id, discount_offer_id)
);

CREATE INDEX IF NOT EXISTS idx_offer_page_sections_active_order
  ON offer_page_sections(is_active, position_order);
CREATE INDEX IF NOT EXISTS idx_offer_page_section_items_section_order
  ON offer_page_section_items(section_id, position_order);

ALTER TABLE offer_page_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_page_section_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read offer page sections" ON offer_page_sections;
CREATE POLICY "Public read offer page sections" ON offer_page_sections
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read offer page section items" ON offer_page_section_items;
CREATE POLICY "Public read offer page section items" ON offer_page_section_items
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage offer page sections" ON offer_page_sections;
CREATE POLICY "Admins manage offer page sections" ON offer_page_sections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins manage offer page section items" ON offer_page_section_items;
CREATE POLICY "Admins manage offer page section items" ON offer_page_section_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS offer_page_sections_updated_at ON offer_page_sections;
CREATE TRIGGER offer_page_sections_updated_at
  BEFORE UPDATE ON offer_page_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO offer_page_sections (slug, title, subtitle, source_type, hero_badge, position_order)
SELECT 'featured-deals', 'Featured platform deals', 'Admin-curated platform offers for travelers right now.', 'manual_discounts', 'Featured', 10
WHERE NOT EXISTS (SELECT 1 FROM offer_page_sections WHERE slug = 'featured-deals');

INSERT INTO offer_page_sections (slug, title, subtitle, source_type, bundle_kind, hero_badge, position_order)
SELECT 'trip-stay-combos', 'Trip + Stay combos', 'Auto-populated from host-linked trips and stays.', 'auto_bundle', 'trip_stay', 'Auto', 20
WHERE NOT EXISTS (SELECT 1 FROM offer_page_sections WHERE slug = 'trip-stay-combos');

INSERT INTO offer_page_sections (slug, title, subtitle, source_type, hero_badge, position_order)
SELECT 'first-time-finds', 'First-time traveler offers', 'Best offers to help new travelers book with confidence.', 'manual_discounts', 'New', 30
WHERE NOT EXISTS (SELECT 1 FROM offer_page_sections WHERE slug = 'first-time-finds');
