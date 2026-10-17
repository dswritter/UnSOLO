-- Fix inflated leaderboard_scores.reviews_written.
-- The review trigger already recounted reviews on insert, and the app then
-- added +1 again (on submit, and again when a companion's claim was approved),
-- so one review could show as 2. Pending/denied reviews were also counted.
-- Now: the trigger counts only approved reviews and also re-runs when a
-- review's status changes; the app recounts instead of incrementing.

CREATE OR REPLACE FUNCTION trg_recalc_leaderboard_on_review()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE leaderboard_scores SET
    reviews_written = (
      SELECT COUNT(*) FROM reviews
      WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) AND status = 'approved'
    ),
    updated_at = now()
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_leaderboard_review ON reviews;
CREATE TRIGGER trg_leaderboard_review
  AFTER INSERT OR DELETE OR UPDATE OF status ON reviews
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_leaderboard_on_review();

UPDATE leaderboard_scores ls SET
  reviews_written = (
    SELECT COUNT(*)::integer FROM reviews r
    WHERE r.user_id = ls.user_id AND r.status = 'approved'
  ),
  updated_at = now()
WHERE reviews_written IS DISTINCT FROM (
  SELECT COUNT(*)::integer FROM reviews r
  WHERE r.user_id = ls.user_id AND r.status = 'approved'
);
