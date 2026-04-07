-- Fix leaderboard total_score formula: trips should be worth 25 pts, not 10
-- Generated columns can't be altered in-place; must drop and re-add.

ALTER TABLE leaderboard_scores DROP COLUMN total_score;

ALTER TABLE leaderboard_scores
  ADD COLUMN total_score INTEGER GENERATED ALWAYS AS
    (trips_completed * 25 + reviews_written * 5 + destinations_count * 15)
    STORED;

-- Recreate the index on the new column
DROP INDEX IF EXISTS idx_leaderboard_score;
CREATE INDEX idx_leaderboard_score ON leaderboard_scores(total_score DESC);
