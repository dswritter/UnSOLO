-- Companion trip credit: travellers who joined someone else's booking and had
-- their trip claim approved now count that trip toward trips_completed,
-- destinations_count and the "First Adventure" badge (previously only the
-- booker was credited). App code keeps this in sync going forward
-- (refreshTravelStatsForUser); this backfills existing approved claims.

WITH claimants AS (
  SELECT DISTINCT claimant_id AS user_id
  FROM public.trip_traveller_claims
  WHERE status = 'approved'
),
trips AS (
  SELECT b.user_id, b.id AS booking_id, p.destination_id
  FROM public.bookings b
  LEFT JOIN public.packages p ON p.id = b.package_id
  WHERE b.status = 'completed' AND b.user_id IN (SELECT user_id FROM claimants)
  UNION
  SELECT c.claimant_id, b.id, p.destination_id
  FROM public.trip_traveller_claims c
  JOIN public.bookings b ON b.id = c.booking_id AND b.status = 'completed'
  LEFT JOIN public.packages p ON p.id = b.package_id
  WHERE c.status = 'approved'
),
totals AS (
  SELECT user_id,
         COUNT(DISTINCT booking_id) AS trips_completed,
         COUNT(DISTINCT destination_id) AS destinations_count
  FROM trips
  GROUP BY user_id
)
INSERT INTO public.leaderboard_scores (user_id, trips_completed, destinations_count, updated_at)
SELECT user_id, trips_completed, destinations_count, now()
FROM totals
ON CONFLICT (user_id) DO UPDATE
  SET trips_completed = EXCLUDED.trips_completed,
      destinations_count = EXCLUDED.destinations_count,
      updated_at = now();

INSERT INTO public.user_achievements (user_id, achievement_key)
SELECT DISTINCT c.claimant_id, 'first_trip'
FROM public.trip_traveller_claims c
JOIN public.bookings b ON b.id = c.booking_id AND b.status = 'completed'
WHERE c.status = 'approved'
ON CONFLICT (user_id, achievement_key) DO NOTHING;
