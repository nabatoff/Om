-- Добавить month_sum: сумма подтверждённых заказов с 1-го числа месяца по дату отчёта.

DROP FUNCTION IF EXISTS public.telegram_confirmed_orders_totals(text, date);

CREATE OR REPLACE FUNCTION public.telegram_confirmed_orders_totals(
  p_tz text DEFAULT 'Asia/Almaty',
  p_date date DEFAULT NULL
)
RETURNS TABLE(today_sum numeric, week_sum numeric, month_sum numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $tg_totals$
BEGIN
  RETURN QUERY
  WITH bounds AS (
    SELECT coalesce(
      p_date,
      (timezone(coalesce(nullif(trim(p_tz), ''), 'Asia/Almaty'), now()))::date
    ) AS today_d
  ),
  week_bounds AS (
    SELECT
      b.today_d,
      (b.today_d - ((extract(dow FROM b.today_d)::int + 6) % 7))::date AS monday_d,
      greatest(
        date_trunc('month', b.today_d)::date,
        (b.today_d - ((extract(dow FROM b.today_d)::int + 6) % 7))::date
      ) AS period_start_d,
      least(
        b.today_d,
        (b.today_d - ((extract(dow FROM b.today_d)::int + 6) % 7))::date + 4
      ) AS period_end_d
    FROM bounds b
  ),
  month_bounds AS (
    SELECT
      b.today_d,
      date_trunc('month', b.today_d)::date AS month_start_d
    FROM bounds b
  ),
  week_ranked AS (
    SELECT
      r.id,
      r.report_date,
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
    CROSS JOIN week_bounds wb
    WHERE r.report_date >= wb.period_start_d
      AND r.report_date <= wb.period_end_d
  ),
  month_ranked AS (
    SELECT
      r.id,
      r.report_date,
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
    CROSS JOIN month_bounds mb
    WHERE r.report_date >= mb.month_start_d
      AND r.report_date <= mb.today_d
  ),
  week_chosen AS (
    SELECT id, report_date
    FROM week_ranked
    WHERE rn = 1
  ),
  month_chosen AS (
    SELECT id, report_date
    FROM month_ranked
    WHERE rn = 1
  ),
  week_order_sums AS (
    SELECT
      c.report_date,
      sum(coalesce(co.total_amount, 0))::numeric AS day_sum
    FROM week_chosen c
    JOIN public.crm_confirmed_orders co ON co.report_id = c.id
    GROUP BY c.report_date
  ),
  month_order_sums AS (
    SELECT
      c.report_date,
      sum(coalesce(co.total_amount, 0))::numeric AS day_sum
    FROM month_chosen c
    JOIN public.crm_confirmed_orders co ON co.report_id = c.id
    GROUP BY c.report_date
  ),
  wb AS (
    SELECT * FROM week_bounds
  )
  SELECT
    coalesce(
      (SELECT os.day_sum FROM week_order_sums os, wb WHERE os.report_date = wb.today_d),
      0
    )::numeric AS today_sum,
    coalesce((SELECT sum(os.day_sum) FROM week_order_sums os), 0)::numeric AS week_sum,
    coalesce((SELECT sum(os.day_sum) FROM month_order_sums os), 0)::numeric AS month_sum;
END;
$tg_totals$;

REVOKE ALL ON FUNCTION public.telegram_confirmed_orders_totals(text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.telegram_confirmed_orders_totals(text, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.telegram_confirmed_orders_totals(text, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_confirmed_orders_totals(text, date) TO service_role;
