-- Allow status stories to carry an optional text caption and/or link URL,
-- and a background colour for text-only stories.

ALTER TABLE status_stories ADD COLUMN IF NOT EXISTS caption    TEXT;
ALTER TABLE status_stories ADD COLUMN IF NOT EXISTS link_url   TEXT;
ALTER TABLE status_stories ADD COLUMN IF NOT EXISTS bg_color   TEXT DEFAULT '#1a1a2e';

-- media_url is no longer required for text/link stories
ALTER TABLE status_stories ALTER COLUMN media_url DROP NOT NULL;

-- Widen the media_type enum to include text and link variants
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'status_stories'::regclass
      AND conname  = 'status_stories_media_type_check'
  ) THEN
    ALTER TABLE status_stories DROP CONSTRAINT status_stories_media_type_check;
  END IF;
END $$;

ALTER TABLE status_stories
  ADD CONSTRAINT status_stories_media_type_check
  CHECK (media_type IN ('image', 'text', 'link'));

NOTIFY pgrst, 'reload schema';
