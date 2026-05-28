-- Backfill crm_clients.manager_id по историческим движениям клиента.
-- Источники: назначения/проведения встреч, подтверждённые заказы, ЦП без встречи.
-- Для старых отчётов без manager_id пробуем восстановить id по profiles.full_name = crm_reports.manager.

WITH report_manager AS (
  SELECT
    r.id AS report_id,
    COALESCE(
      r.manager_id,
      (
        SELECT p.id
        FROM public.profiles p
        WHERE trim(coalesce(p.full_name, '')) = trim(coalesce(r.manager, ''))
        ORDER BY p.created_at NULLS LAST, p.id
        LIMIT 1
      )
    ) AS manager_id,
    r.report_date
  FROM public.crm_reports r
),
activity_raw AS (
  SELECT am.bin, rm.manager_id, rm.report_date, 1::numeric AS weight
  FROM public.crm_assigned_meetings am
  JOIN report_manager rm ON rm.report_id = am.report_id
  WHERE rm.manager_id IS NOT NULL

  UNION ALL

  SELECT cm.bin, rm.manager_id, rm.report_date, 2::numeric AS weight
  FROM public.crm_conducted_meetings cm
  JOIN report_manager rm ON rm.report_id = cm.report_id
  WHERE rm.manager_id IS NOT NULL

  UNION ALL

  SELECT co.bin, rm.manager_id, rm.report_date, GREATEST(coalesce(co.order_count, 1), 1)::numeric * 3::numeric AS weight
  FROM public.crm_confirmed_orders co
  JOIN report_manager rm ON rm.report_id = co.report_id
  WHERE rm.manager_id IS NOT NULL

  UNION ALL

  SELECT scp.bin, scp.manager_id, scp.updated_at::date AS report_date, GREATEST(coalesce(scp.cp_quantity, 1), 1)::numeric * 1.5::numeric AS weight
  FROM public.crm_client_standalone_cp scp
  WHERE scp.manager_id IS NOT NULL
),
activity AS (
  SELECT
    ar.bin,
    ar.manager_id,
    SUM(ar.weight) AS score,
    MAX(ar.report_date) AS last_date
  FROM activity_raw ar
  GROUP BY ar.bin, ar.manager_id
),
ranked AS (
  SELECT
    a.bin,
    a.manager_id,
    ROW_NUMBER() OVER (
      PARTITION BY a.bin
      ORDER BY a.score DESC, a.last_date DESC, a.manager_id
    ) AS rn
  FROM activity a
)
UPDATE public.crm_clients c
SET manager_id = r.manager_id
FROM ranked r
WHERE r.rn = 1
  AND c.bin = r.bin
  AND c.manager_id IS DISTINCT FROM r.manager_id;
