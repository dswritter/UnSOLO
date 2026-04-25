-- Optional copy for the /wander hero top pill (empty in DB = use app default in code)
INSERT INTO public.platform_settings (key, value, description)
VALUES
  (
    'wander_trust_badge_text',
    '',
    'One line of text in the /wander hero top-left pill. Leave empty to use the product default.'
  )
ON CONFLICT (key) DO NOTHING;
