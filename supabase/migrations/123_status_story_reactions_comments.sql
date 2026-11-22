-- Stories (24-hour statuses) get reactions and comments, like posts.
-- Visible to whoever can see the story; written by the API (service role) after its checks.

CREATE TABLE IF NOT EXISTS status_story_reactions (
  story_id   UUID NOT NULL REFERENCES status_stories(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('wanderlust', 'love', 'wow', 'haha', 'clap', 'fire')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);
CREATE INDEX IF NOT EXISTS status_story_reactions_story_idx ON status_story_reactions (story_id);

CREATE TABLE IF NOT EXISTS status_story_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id   UUID NOT NULL REFERENCES status_stories(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS status_story_comments_story_idx ON status_story_comments (story_id, created_at);

ALTER TABLE status_story_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_story_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS status_story_reactions_read ON status_story_reactions;
CREATE POLICY status_story_reactions_read ON status_story_reactions FOR SELECT TO authenticated
  USING (status_story_visible_to_reader(story_id, auth.uid()));
DROP POLICY IF EXISTS status_story_comments_read ON status_story_comments;
CREATE POLICY status_story_comments_read ON status_story_comments FOR SELECT TO authenticated
  USING (status_story_visible_to_reader(story_id, auth.uid()));
