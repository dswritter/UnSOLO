-- Wander / immersive shell seasonal theming (admin-controlled).
INSERT INTO platform_settings (key, value, description) VALUES
  (
    'wander_theme_mode',
    'default',
    'Wander shell theme: default (classic forest), auto (Indian six seasons, Asia/Kolkata), or manual.'
  ),
  (
    'wander_theme_season_manual',
    'spring',
    'When wander_theme_mode is manual: spring | summer | monsoon | autumn | prewinter | winter.'
  )
ON CONFLICT (key) DO NOTHING;
