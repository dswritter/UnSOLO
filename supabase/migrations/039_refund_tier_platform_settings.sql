-- Configurable refund tier tables (JSON) for public policy page + admin settings UI.

INSERT INTO platform_settings (key, value, description) VALUES
(
  'refund_tiers_unsolo',
  '[{"minDaysBefore":30,"percent":100,"label":"30+ days before departure"},{"minDaysBefore":15,"maxDaysBefore":29,"percent":75,"label":"15-29 days before departure"},{"minDaysBefore":7,"maxDaysBefore":14,"percent":50,"label":"7-14 days before departure"},{"minDaysBefore":0,"maxDaysBefore":6,"percent":0,"label":"Less than 7 days"}]',
  'JSON: UnSOLO curated trip cancellation tiers (days before departure vs refund %).'
),
(
  'refund_tiers_host',
  '[{"minDaysBefore":30,"percent":100,"label":"30+ days before departure"},{"minDaysBefore":15,"maxDaysBefore":29,"percent":75,"label":"15-29 days before departure"},{"minDaysBefore":7,"maxDaysBefore":14,"percent":50,"label":"7-14 days before departure"},{"minDaysBefore":0,"maxDaysBefore":6,"percent":0,"label":"Less than 7 days"}]',
  'JSON: Community/host trip tiers used when admin reviews cancellations (platform fee rules still apply).'
)
ON CONFLICT (key) DO NOTHING;
