INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'wander_hero_image_url',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=2400&q=85',
  'Full HTTPS URL for the /wander hero background image (change in Admin → Settings).'
)
ON CONFLICT (key) DO NOTHING;
