-- ============================================================
-- 008: Auto-populate leaderboard & recalculate scores
-- ============================================================

-- Ensure every profile gets a leaderboard row
INSERT INTO leaderboard_scores (user_id, trips_completed, reviews_written, destinations_count)
SELECT id, 0, 0, 0 FROM profiles
WHERE id NOT IN (SELECT user_id FROM leaderboard_scores)
ON CONFLICT (user_id) DO NOTHING;

-- Trigger: auto-create leaderboard row when profile is created
CREATE OR REPLACE FUNCTION auto_create_leaderboard_row()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO leaderboard_scores (user_id, trips_completed, reviews_written, destinations_count)
  VALUES (NEW.id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_leaderboard ON profiles;
CREATE TRIGGER trg_auto_leaderboard
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION auto_create_leaderboard_row();

-- Function to recalculate ALL leaderboard scores from actual data
CREATE OR REPLACE FUNCTION recalculate_leaderboard()
RETURNS VOID AS $$
BEGIN
  UPDATE leaderboard_scores ls SET
    trips_completed = (
      SELECT COUNT(*) FROM bookings b
      WHERE b.user_id = ls.user_id AND b.status IN ('completed', 'confirmed')
    ),
    reviews_written = (
      SELECT COUNT(*) FROM reviews r WHERE r.user_id = ls.user_id
    ),
    destinations_count = (
      SELECT COUNT(DISTINCT d.state)
      FROM bookings b
      JOIN packages p ON p.id = b.package_id
      JOIN destinations d ON d.id = p.destination_id
      WHERE b.user_id = ls.user_id AND b.status IN ('completed', 'confirmed')
    ),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run it once now to sync existing data
SELECT recalculate_leaderboard();

-- Auto-recalculate when bookings change status
CREATE OR REPLACE FUNCTION trg_recalc_leaderboard_on_booking()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate for the affected user
  UPDATE leaderboard_scores SET
    trips_completed = (
      SELECT COUNT(*) FROM bookings WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) AND status IN ('completed', 'confirmed')
    ),
    destinations_count = (
      SELECT COUNT(DISTINCT d.state)
      FROM bookings b
      JOIN packages p ON p.id = b.package_id
      JOIN destinations d ON d.id = p.destination_id
      WHERE b.user_id = COALESCE(NEW.user_id, OLD.user_id) AND b.status IN ('completed', 'confirmed')
    ),
    updated_at = now()
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_leaderboard_booking ON bookings;
CREATE TRIGGER trg_leaderboard_booking
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_leaderboard_on_booking();

-- Auto-recalculate when reviews are added
CREATE OR REPLACE FUNCTION trg_recalc_leaderboard_on_review()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE leaderboard_scores SET
    reviews_written = (
      SELECT COUNT(*) FROM reviews WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
    ),
    updated_at = now()
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_leaderboard_review ON reviews;
CREATE TRIGGER trg_leaderboard_review
  AFTER INSERT OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_leaderboard_on_review();
