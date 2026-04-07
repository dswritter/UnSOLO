-- Leaderboard: only award after trip completion (not confirmed/upcoming).
-- Trip points use SUM(guests) so one booking with 3 guests => 25*3 from the trips term.

CREATE OR REPLACE FUNCTION recalculate_leaderboard()
RETURNS VOID AS $$
BEGIN
  UPDATE leaderboard_scores ls SET
    trips_completed = (
      SELECT COALESCE(SUM(GREATEST(COALESCE(b.guests, 1), 1)), 0)::integer
      FROM bookings b
      WHERE b.user_id = ls.user_id AND b.status = 'completed'
    ),
    reviews_written = (
      SELECT COUNT(*)::integer FROM reviews r WHERE r.user_id = ls.user_id
    ),
    destinations_count = (
      SELECT COUNT(DISTINCT d.state)::integer
      FROM bookings b
      JOIN packages p ON p.id = b.package_id
      JOIN destinations d ON d.id = p.destination_id
      WHERE b.user_id = ls.user_id AND b.status = 'completed'
    ),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trg_recalc_leaderboard_on_booking()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE leaderboard_scores SET
    trips_completed = (
      SELECT COALESCE(SUM(GREATEST(COALESCE(b.guests, 1), 1)), 0)::integer
      FROM bookings b
      WHERE b.user_id = COALESCE(NEW.user_id, OLD.user_id) AND b.status = 'completed'
    ),
    destinations_count = (
      SELECT COUNT(DISTINCT d.state)::integer
      FROM bookings b
      JOIN packages p ON p.id = b.package_id
      JOIN destinations d ON d.id = p.destination_id
      WHERE b.user_id = COALESCE(NEW.user_id, OLD.user_id) AND b.status = 'completed'
    ),
    updated_at = now()
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT recalculate_leaderboard();
