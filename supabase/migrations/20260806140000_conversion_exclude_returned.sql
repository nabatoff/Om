-- Доходимость лидорубов: возвраты на СМБ не считаются «передано»
CREATE OR REPLACE FUNCTION public.lead_digger_conversion_stats()
RETURNS TABLE (
  creator_id uuid,
  creator_name text,
  transferred_count bigint,
  completed_count bigint,
  conversion numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.creator_id,
    trim(coalesce(p.full_name, '')),
    count(*)::bigint AS transferred_count,
    count(*) FILTER (WHERE l.meeting_status = 'completed')::bigint AS completed_count,
    CASE
      WHEN count(*) = 0 THEN 0
      ELSE round(
        (count(*) FILTER (WHERE l.meeting_status = 'completed')::numeric / count(*)::numeric) * 100,
        1
      )
    END AS conversion
  FROM public.crm_enterprise_leads l
  LEFT JOIN public.profiles p ON p.id = l.creator_id
  WHERE public.is_admin()
    AND l.routing_status IN ('pending_distribution', 'assigned_to_manager')
  GROUP BY l.creator_id, p.full_name
  ORDER BY count(*) DESC;
$$;
