-- Poll votes get their own table: one row per person per poll, changed in place.
-- Before this, a vote was a reply with poll_choice set, so every tap (or change of mind) added a
-- "Voted: …" comment to the thread and bumped the comment count.

CREATE TABLE IF NOT EXISTS post_poll_votes (
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  choice     TEXT NOT NULL CHECK (choice IN ('a', 'b', 'c', 'd')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_poll_votes_post_idx ON post_poll_votes (post_id);

ALTER TABLE post_poll_votes ENABLE ROW LEVEL SECURITY;
-- Tallies are public on visible posts; writes go through the API (service role) only.
DROP POLICY IF EXISTS post_poll_votes_read ON post_poll_votes;
CREATE POLICY post_poll_votes_read ON post_poll_votes FOR SELECT
  USING (EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id));

-- Carry over the current votes (the latest live reply with a choice, per person).
INSERT INTO post_poll_votes (post_id, user_id, choice, created_at, updated_at)
SELECT DISTINCT ON (c.post_id, c.author_id) c.post_id, c.author_id, c.poll_choice, c.created_at, c.created_at
FROM post_comments c
WHERE c.poll_choice IN ('a', 'b', 'c', 'd') AND c.status = 'live'
ORDER BY c.post_id, c.author_id, c.created_at DESC
ON CONFLICT (post_id, user_id) DO NOTHING;

-- Hide the vote replies those taps left behind (reversible: status only). A vote reply is a
-- top-level reply on a poll that carries a choice, or whose text is "Voted: <option>" (web) or
-- exactly an option label (Android), with no replies of its own.
UPDATE post_comments c SET status = 'hidden'
FROM posts p
WHERE p.id = c.post_id AND p.kind = 'ask' AND p.poll_options IS NOT NULL
  AND c.parent_id IS NULL AND c.status = 'live'
  AND NOT EXISTS (SELECT 1 FROM post_comments r WHERE r.parent_id = c.id)
  AND (
    c.poll_choice IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.poll_options) o
      WHERE c.body = o->>'label' OR c.body = 'Voted: ' || (o->>'label')
    )
  );
