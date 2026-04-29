-- Wander hero Instagram CTA (shown when URL is set; text defaults in app if empty)
INSERT INTO platform_settings (key, value, description) VALUES
  (
    'wander_hero_instagram_text',
    '',
    'Wander homepage — label next to Instagram icon (e.g. Follow us @ UnSOLO). Empty = default.'
  ),
  (
    'wander_hero_instagram_url',
    '',
    'Wander homepage — full https:// URL to your Instagram profile or post. Empty hides the CTA.'
  )
ON CONFLICT (key) DO NOTHING;
