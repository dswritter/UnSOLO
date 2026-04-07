-- Community chat rooms: optional description and cover image for sidebar / admin branding
ALTER TABLE chat_rooms
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT;
