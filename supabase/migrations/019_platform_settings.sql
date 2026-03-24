-- ============================================================
-- 019: Platform Settings (admin-managed)
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read settings" ON platform_settings FOR SELECT USING (true);
CREATE POLICY "Admins can update settings" ON platform_settings FOR UPDATE USING (true);
CREATE POLICY "Admins can insert settings" ON platform_settings FOR INSERT WITH CHECK (true);

-- Default settings
INSERT INTO platform_settings (key, value, description) VALUES
  ('host_max_group_size', '20', 'Maximum group size a host can set for their trip'),
  ('platform_fee_percent', '15', 'Platform fee percentage on community trips'),
  ('join_payment_deadline_hours', '48', 'Hours given to pay after join request approval')
ON CONFLICT (key) DO NOTHING;
