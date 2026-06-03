-- КТП для комиссии: если заполнен via_bin — по ЮЛ «заказ через», иначе по контрагенту (bin).

CREATE OR REPLACE FUNCTION public.crm_order_commission_is_ktp(p_bin text, p_via_bin text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  WITH v AS (
    SELECT regexp_replace(trim(coalesce(p_via_bin, '')), '[^0-9]', '', 'g') AS via_digits
  )
  SELECT coalesce(
    CASE
      WHEN (SELECT length(via_digits) FROM v) = 12 THEN (
        SELECT c.is_ktp
        FROM public.crm_clients c, v
        WHERE c.bin = v.via_digits
        LIMIT 1
      )
      ELSE (
        SELECT c.is_ktp
        FROM public.crm_clients c
        WHERE c.bin = regexp_replace(trim(coalesce(p_bin, '')), '[^0-9]', '', 'g')
        LIMIT 1
      )
    END,
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.backfill_order_commissions(p_overwrite boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mrp numeric;
  v_updated integer := 0;
  r record;
  v_comm numeric;
  v_ktp boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  v_mrp := public.get_crm_mrp();

  FOR r IN
    SELECT o.id, o.bin, o.via_bin, o.amounts, o.total_amount
    FROM public.crm_confirmed_orders o
    WHERE (coalesce(p_overwrite, false) OR o.commission_amount IS NULL)
      AND coalesce(o.total_amount, 0) > 0
  LOOP
    v_ktp := public.crm_order_commission_is_ktp(r.bin, r.via_bin);
    v_comm := public.sum_order_line_commissions(r.amounts, r.total_amount, v_ktp, v_mrp);

    UPDATE public.crm_confirmed_orders
    SET
      mrp_kzt_applied = v_mrp,
      is_ktp_applied = v_ktp,
      commission_amount = v_comm
    WHERE id = r.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;
