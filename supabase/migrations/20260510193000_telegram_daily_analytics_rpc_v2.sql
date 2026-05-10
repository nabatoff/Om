-- Сводка для Telegram: новые поля (проведено новых, разбивка заказов),
-- ограничение EXECUTE только для service_role (Edge использует SERVICE_ROLE).

CREATE OR REPLACE FUNCTION public.telegram_daily_analytics_rows(p_date date)
 RETURNS TABLE(
   manager text,
   assigned_meetings integer,
   conducted_fact integer,
   conducted_new integer,
   confirmed_orders_sum numeric,
   confirmed_orders_breakdown jsonb
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ranked AS (
    SELECT
      r.id,
      trim(coalesce(r.manager, '')) AS manager,
      row_number() OVER (
        PARTITION BY trim(coalesce(r.manager, '')), r.report_date
        ORDER BY (
          coalesce(r.processed_total, 0) +
          coalesce(r.new_in_work, 0) +
          coalesce(r.calls_total, 0) +
          coalesce(r.validated_total, 0)
        ) DESC,
        r.id DESC
      ) AS rn
    FROM public.crm_reports r
    WHERE r.report_date = p_date
  ),
  chosen AS (
    SELECT id, manager
    FROM ranked
    WHERE rn = 1
  ),
  assigned_rows AS (
    SELECT
      c.manager,
      c.id AS report_id,
      am.entity_name,
      am.bin,
      am.meeting_type,
      am.meeting_date
    FROM chosen c
    JOIN public.crm_assigned_meetings am ON am.report_id = c.id
  ),
  conducted_rows AS (
    SELECT
      c.manager,
      c.id AS report_id,
      cm.entity_name,
      cm.bin,
      cm.meeting_type,
      cm.meeting_date
    FROM chosen c
    JOIN public.crm_conducted_meetings cm ON cm.report_id = c.id
  ),
  plan_fact AS (
    SELECT
      c.manager,
      coalesce((SELECT count(*)::int FROM assigned_rows a WHERE a.manager = c.manager), 0)
        AS assigned_meetings,
      coalesce((SELECT count(*)::int FROM conducted_rows d WHERE d.manager = c.manager), 0)
        AS conducted_fact,
      coalesce((
        SELECT sum(coalesce(co.total_amount, 0))
        FROM public.crm_confirmed_orders co
        WHERE co.report_id = c.id
      ), 0)::numeric AS confirmed_orders_sum,
      coalesce(
        (
          SELECT jsonb_agg(t.json_obj ORDER BY t.total_sum DESC)
          FROM (
            SELECT
              jsonb_build_object(
                'name', trim(coalesce(s.entity_name, '')),
                'bin', trim(coalesce(s.bin, '')),
                'total', s.total_sum
              ) AS json_obj,
              s.total_sum
            FROM (
              SELECT
                trim(coalesce(co.entity_name, '')) AS entity_name,
                trim(coalesce(co.bin, '')) AS bin,
                sum(coalesce(co.total_amount, 0))::numeric AS total_sum
              FROM public.crm_confirmed_orders co
              WHERE co.report_id = c.id
              GROUP BY trim(coalesce(co.entity_name, '')), trim(coalesce(co.bin, ''))
            ) s
          ) t
        ),
        '[]'::jsonb
      ) AS confirmed_orders_breakdown,
      c.id AS report_id
    FROM chosen c
  ),
  conducted_new_calc AS (
    SELECT
      ar.manager,
      count(*)::int AS conducted_new
    FROM assigned_rows ar
    WHERE lower(trim(translate(trim(coalesce(ar.meeting_type, '')), 'ёЁ', 'еЕ'))) LIKE 'нов%'
      AND EXISTS (
        SELECT 1
        FROM public.crm_reports r2
        JOIN public.crm_conducted_meetings cm2 ON cm2.report_id = r2.id
        WHERE trim(coalesce(r2.manager, '')) = ar.manager
          AND r2.report_date >= p_date
          AND trim(coalesce(cm2.bin, '')) = trim(coalesce(ar.bin, ''))
          AND lower(trim(coalesce(cm2.entity_name, ''))) = lower(trim(coalesce(ar.entity_name, '')))
          AND lower(trim(coalesce(cm2.meeting_type, ''))) = lower(trim(coalesce(ar.meeting_type, '')))
          AND cm2.meeting_date >= ar.meeting_date
      )
    GROUP BY ar.manager
  )
  SELECT
    pf.manager AS manager,
    pf.assigned_meetings AS assigned_meetings,
    pf.conducted_fact AS conducted_fact,
    coalesce(cn.conducted_new, 0)::integer AS conducted_new,
    pf.confirmed_orders_sum AS confirmed_orders_sum,
    pf.confirmed_orders_breakdown AS confirmed_orders_breakdown
  FROM plan_fact pf
  LEFT JOIN conducted_new_calc cn ON cn.manager = pf.manager
  ORDER BY pf.manager;
$function$;

REVOKE EXECUTE ON FUNCTION public.telegram_daily_analytics_rows(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.telegram_daily_analytics_rows(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.telegram_daily_analytics_rows(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_daily_analytics_rows(date) TO service_role;
