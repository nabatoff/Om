-- После смены КТП у контрагента пересчитать комиссии по заказам, где КТП брался с этого БИН.

CREATE OR REPLACE FUNCTION public.recalc_order_commissions_for_client_bin(p_bin text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_bin text := regexp_replace(trim(coalesce(p_bin, '')), '[^0-9]', '', 'g');
  v_mrp numeric;
  v_updated integer := 0;
  r record;
  v_ktp boolean;
  v_comm numeric;
  v_via_digits text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(v_client_bin) <> 12 THEN
    RAISE EXCEPTION 'БИН должен состоять ровно из 12 цифр' USING ERRCODE = '23514';
  END IF;

  v_mrp := public.get_crm_mrp();

  FOR r IN
    SELECT o.id, o.bin, o.via_bin, o.amounts, o.total_amount
    FROM public.crm_confirmed_orders o
    WHERE coalesce(o.total_amount, 0) > 0
  LOOP
    v_via_digits := regexp_replace(trim(coalesce(r.via_bin, '')), '[^0-9]', '', 'g');

    IF NOT (
      (length(v_via_digits) = 12 AND v_via_digits = v_client_bin)
      OR (length(v_via_digits) <> 12 AND regexp_replace(trim(coalesce(r.bin, '')), '[^0-9]', '', 'g') = v_client_bin)
    ) THEN
      CONTINUE;
    END IF;

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

REVOKE ALL ON FUNCTION public.recalc_order_commissions_for_client_bin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalc_order_commissions_for_client_bin(text) TO authenticated;
