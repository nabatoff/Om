-- Прогноз на неделю для Telegram-отчёта + суммы подтверждённых заказов (сегодня / пн–пт).

INSERT INTO public.crm_settings (key, value_numeric)
VALUES ('telegram_weekly_forecast_kzt', 0)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_crm_telegram_weekly_forecast()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
RETURN greatest(
  coalesce(
    (SELECT s.value_numeric FROM public.crm_settings s WHERE s.key = 'telegram_weekly_forecast_kzt' LIMIT 1),
    0
  ),
  0
);

CREATE OR REPLACE FUNCTION public.set_crm_telegram_weekly_forecast(p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $set_forecast$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Сумма не может быть отрицательной' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.crm_settings (key, value_numeric, updated_at)
  VALUES ('telegram_weekly_forecast_kzt', coalesce(p_amount, 0), now())
  ON CONFLICT (key) DO UPDATE
  SET value_numeric = EXCLUDED.value_numeric, updated_at = now();
END;
$set_forecast$;

CREATE OR REPLACE FUNCTION public.telegram_confirmed_orders_totals(p_tz text DEFAULT 'Asia/Almaty')
RETURNS TABLE(today_sum numeric, week_sum numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $tg_totals$
BEGIN
  RETURN QUERY
  WITH bounds AS (
    SELECT (timezone(coalesce(nullif(trim(p_tz), ''), 'Asia/Almaty'), now()))::date AS today_d
  ),
  week_bounds AS (
    SELECT
      b.today_d,
      (b.today_d - ((extract(dow FROM b.today_d)::int + 6) % 7))::date AS monday_d
    FROM bounds b
  ),
  ranked AS (
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
    WHERE r.report_date >= wb.monday_d
      AND r.report_date <= wb.monday_d + 4
  ),
  chosen AS (
    SELECT id, report_date
    FROM ranked
    WHERE rn = 1
  ),
  order_sums AS (
    SELECT
      c.report_date,
      sum(coalesce(co.total_amount, 0))::numeric AS day_sum
    FROM chosen c
    JOIN public.crm_confirmed_orders co ON co.report_id = c.id
    GROUP BY c.report_date
  ),
  wb AS (
    SELECT * FROM week_bounds
  )
  SELECT
    coalesce(
      (SELECT os.day_sum FROM order_sums os, wb WHERE os.report_date = wb.today_d),
      0
    )::numeric AS today_sum,
    coalesce((SELECT sum(os.day_sum) FROM order_sums os), 0)::numeric AS week_sum;
END;
$tg_totals$;

REVOKE ALL ON FUNCTION public.get_crm_telegram_weekly_forecast() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_crm_telegram_weekly_forecast() TO authenticated;

REVOKE ALL ON FUNCTION public.set_crm_telegram_weekly_forecast(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_crm_telegram_weekly_forecast(numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.telegram_confirmed_orders_totals(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.telegram_confirmed_orders_totals(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.telegram_confirmed_orders_totals(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_confirmed_orders_totals(text) TO service_role;
