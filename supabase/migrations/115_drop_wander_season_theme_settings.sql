-- Seasonal shell themes are gone: the app now ships one Alpine theme with a per-user light/dark toggle.
DELETE FROM platform_settings WHERE key IN ('wander_theme_mode', 'wander_theme_season_manual');
