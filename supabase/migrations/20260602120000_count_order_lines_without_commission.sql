-- Счётчик «заказов без комиссии» = сумма позиций amounts[] (Заказ №1, №2…), не строк crm_confirmed_orders.

CREATE OR REPLACE FUNCTION public.count_order_line_items(p_amounts numeric[], p_total numeric)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    (
      SELECT count(*)::integer
      FROM unnest(coalesce(p_amounts, ARRAY[]::numeric[])) AS amt
      WHERE coalesce(amt, 0) > 0
    ),
    0
  ) + CASE
    WHEN coalesce(
      (
        SELECT count(*)
        FROM unnest(coalesce(p_amounts, ARRAY[]::numeric[])) AS amt
        WHERE coalesce(amt, 0) > 0
      ),
      0
    ) = 0 AND coalesce(p_total, 0) > 0 THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.count_orders_without_commission()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(public.count_order_line_items(o.amounts, o.total_amount)), 0)::integer
  FROM public.crm_confirmed_orders o
  WHERE o.commission_amount IS NULL
    AND coalesce(o.total_amount, 0) > 0;
$$;
