-- Админ: точечное редактирование / удаление подтверждённого заказа без перезаписи отчёта менеджера.

CREATE OR REPLACE FUNCTION public.admin_update_confirmed_order(p_order_id uuid, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mrp numeric;
  v_max_order numeric;
  v_line_amt numeric;
  v_line_idx integer;
  v_has_positive_line boolean;
  v_entity_name text := trim(coalesce(p_payload->>'entityName', ''));
  v_bin text := trim(coalesce(p_payload->>'bin', ''));
  v_via_entity_name text := trim(coalesce(p_payload->>'viaEntityName', ''));
  v_via_bin text := trim(coalesce(p_payload->>'viaBin', ''));
  v_order_count int := greatest(coalesce((p_payload->>'orderCount')::int, 0), 0);
  v_amounts numeric[] := coalesce(
    ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'amounts', '[]'::jsonb))::numeric),
    ARRAY[]::numeric[]
  );
  v_total_amount numeric := coalesce((p_payload->>'totalAmount')::numeric, 0);
  v_ktp boolean;
  v_comm numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.crm_confirmed_orders o WHERE o.id = p_order_id) THEN
    RAISE EXCEPTION 'Заказ не найден' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(p_payload->>'delete', 'false') = 'true' THEN
    DELETE FROM public.crm_confirmed_orders WHERE id = p_order_id;
    RETURN;
  END IF;

  IF v_entity_name = '' OR v_bin = '' THEN
    RAISE EXCEPTION 'Укажите контрагента и БИН' USING ERRCODE = '23514';
  END IF;

  v_mrp := public.get_crm_mrp();
  v_max_order := 4000 * v_mrp;

  v_line_idx := 0;
  v_has_positive_line := false;
  IF v_amounts IS NOT NULL THEN
    FOREACH v_line_amt IN ARRAY v_amounts LOOP
      IF coalesce(v_line_amt, 0) > 0 THEN
        v_has_positive_line := true;
        v_line_idx := v_line_idx + 1;
        IF v_line_amt > v_max_order THEN
          RAISE EXCEPTION 'Заказ №%: сумма не может превышать % ₸ (4000 МРП)', v_line_idx, v_max_order
            USING ERRCODE = '23514';
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF NOT v_has_positive_line AND v_total_amount > v_max_order THEN
    RAISE EXCEPTION 'Сумма заказа не может превышать % ₸ (4000 МРП)', v_max_order
      USING ERRCODE = '23514';
  END IF;

  v_ktp := public.crm_order_commission_is_ktp(v_bin, v_via_bin);
  v_comm := public.sum_order_line_commissions(v_amounts, v_total_amount, v_ktp, v_mrp);

  UPDATE public.crm_confirmed_orders
  SET
    entity_name = v_entity_name,
    bin = v_bin,
    via_entity_name = v_via_entity_name,
    via_bin = v_via_bin,
    order_count = v_order_count,
    amounts = v_amounts,
    total_amount = v_total_amount,
    mrp_kzt_applied = v_mrp,
    is_ktp_applied = v_ktp,
    commission_amount = v_comm
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_confirmed_order(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_confirmed_order(uuid, jsonb) TO authenticated;
