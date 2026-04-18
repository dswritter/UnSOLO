-- Footer tagline on shared profile posters (admin-editable)
INSERT INTO platform_settings (key, value, description) VALUES
  (
    'share_poster_footer_tagline',
    'Book treks, find your tribe, share the stoke.',
    'Short line at the bottom of profile share posters (WhatsApp / Instagram).'
  )
ON CONFLICT (key) DO NOTHING;
