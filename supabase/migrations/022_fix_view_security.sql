-- Fix profile_follow_counts view security
-- Change from SECURITY DEFINER (uses creator's permissions) to SECURITY INVOKER (uses querying user's permissions)
-- This respects RLS policies properly

CREATE OR REPLACE VIEW profile_follow_counts
WITH (security_invoker = true) AS
SELECT
  p.id,
  COALESCE(fr.cnt, 0)::INT AS followers_count,
  COALESCE(fg.cnt, 0)::INT AS following_count
FROM profiles p
LEFT JOIN (SELECT following_id, COUNT(*) AS cnt FROM follows GROUP BY following_id) fr ON fr.following_id = p.id
LEFT JOIN (SELECT follower_id, COUNT(*) AS cnt FROM follows GROUP BY follower_id) fg ON fg.follower_id = p.id;
