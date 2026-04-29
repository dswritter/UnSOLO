-- Wander hero headline + subtitle (optional links; empty = built-in defaults in app)
INSERT INTO platform_settings (key, value, description) VALUES
  (
    'wander_hero_line1',
    '',
    'Wander homepage — headline line 1 (e.g. Travelling solo?). Leave empty for default.'
  ),
  (
    'wander_hero_line2_before',
    '',
    'Wander homepage — line 2 prefix before gold accent word (default: Find your ).'
  ),
  (
    'wander_hero_line2_accent',
    '',
    'Wander homepage — accent word(s) styled in brand gold on line 2 (default: people).'
  ),
  (
    'wander_hero_line2_after',
    '',
    'Wander homepage — line 2 suffix after accent (default: empty or punctuation).'
  ),
  (
    'wander_hero_subtitle',
    '',
    'Wander homepage — subtitle under headline. Leave empty for default.'
  ),
  (
    'wander_hero_headline_link_url',
    '',
    'Optional HTTPS or site path: wraps the entire headline (both lines). Empty = no link.'
  ),
  (
    'wander_hero_subtitle_link_url',
    '',
    'Optional HTTPS or site path: wraps the subtitle. Empty = no link.'
  )
ON CONFLICT (key) DO NOTHING;
