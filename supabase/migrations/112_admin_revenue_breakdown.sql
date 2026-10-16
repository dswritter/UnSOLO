-- Admin Revenue page: aggregate in SQL instead of shipping every booking to the server render.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_revenue_breakdown(p_user_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH b AS (
    SELECT bk.user_id, bk.package_id,
      CASE WHEN coalesce(bk.deposit_paise, 0) > 0 THEN bk.deposit_paise ELSE coalesce(bk.total_amount_paise, 0) END AS amount,
      CASE WHEN bk.cancellation_status = 'approved' THEN coalesce(bk.refund_amount_paise, 0) ELSE 0 END AS refund
    FROM public.bookings bk
    WHERE bk.status IN ('confirmed', 'completed')
  ),
  pk AS (
    SELECT p.title, p.slug, sum(b.amount - b.refund)::bigint AS revenue, count(*)::integer AS bookings
    FROM b JOIN public.packages p ON p.id = b.package_id
    GROUP BY p.id
  ),
  us AS (
    SELECT pr.username, coalesce(pr.full_name, pr.username) AS name, sum(b.amount)::bigint AS spent, count(*)::integer AS bookings
    FROM b JOIN public.profiles pr ON pr.id = b.user_id
    GROUP BY pr.id
    ORDER BY spent DESC
    LIMIT greatest(coalesce(p_user_limit, 20), 1)
  )
  SELECT jsonb_build_object(
    'gross', coalesce((SELECT sum(amount) FROM b), 0),
    'refunds', coalesce((SELECT sum(refund) FROM b), 0),
    'packages', coalesce((SELECT jsonb_agg(to_jsonb(pk) ORDER BY pk.revenue DESC) FROM pk), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(to_jsonb(us) ORDER BY us.spent DESC) FROM us), '[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION public.admin_revenue_breakdown(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_breakdown(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
