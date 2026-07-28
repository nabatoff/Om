-- Валидация via_entity_name без via_bin; пересчёт комиссий только за июль 2026; RPC по месяцу.

CREATE OR REPLACE FUNCTION public.crm_validate_order_via(p_via_entity_name text, p_via_bin text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF trim(coalesce(p_via_entity_name, '')) <> ''
     AND length(regexp_replace(trim(coalesce(p_via_bin, '')), '[^0-9]', '', 'g')) <> 12
  THEN
    RAISE EXCEPTION
      'Если указано юрлицо — выберите его из справочника (БИН 12 цифр). Иначе комиссия посчитается по контрагенту.'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_confirmed_orders_validate_via()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.crm_validate_order_via(NEW.via_entity_name, NEW.via_bin);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_confirmed_orders_validate_via ON public.crm_confirmed_orders;

CREATE TRIGGER trg_crm_confirmed_orders_validate_via
  BEFORE INSERT OR UPDATE OF via_entity_name, via_bin ON public.crm_confirmed_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_confirmed_orders_validate_via();

-- admin_update: явная проверка до UPDATE
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

  PERFORM public.crm_validate_order_via(v_via_entity_name, v_via_bin);

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

-- Пересчёт комиссий за конкретный календарный месяц (report_date)
CREATE OR REPLACE FUNCTION public.recalc_order_commissions_for_month(p_year int, p_month int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mrp numeric;
  v_updated integer := 0;
  v_from date;
  v_to date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_year IS NULL OR p_month IS NULL OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Некорректный год или месяц' USING ERRCODE = '22023';
  END IF;

  v_from := make_date(p_year, p_month, 1);
  v_to := (v_from + interval '1 month')::date;
  v_mrp := public.get_crm_mrp();

  UPDATE public.crm_confirmed_orders o
  SET
    mrp_kzt_applied = v_mrp,
    is_ktp_applied = public.crm_order_commission_is_ktp(o.bin, o.via_bin),
    commission_amount = public.sum_order_line_commissions(
      o.amounts,
      o.total_amount,
      public.crm_order_commission_is_ktp(o.bin, o.via_bin),
      v_mrp
    )
  FROM public.crm_reports r
  WHERE o.report_id = r.id
    AND r.report_date >= v_from
    AND r.report_date < v_to
    AND coalesce(o.total_amount, 0) > 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_order_commissions_for_month(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalc_order_commissions_for_month(int, int) TO authenticated;

-- Одноразовый пересчёт: только июль 2026 (без auth — миграция)
DO $$
DECLARE
  v_mrp numeric;
  v_updated integer;
BEGIN
  v_mrp := public.get_crm_mrp();

  UPDATE public.crm_confirmed_orders o
  SET
    mrp_kzt_applied = v_mrp,
    is_ktp_applied = public.crm_order_commission_is_ktp(o.bin, o.via_bin),
    commission_amount = public.sum_order_line_commissions(
      o.amounts,
      o.total_amount,
      public.crm_order_commission_is_ktp(o.bin, o.via_bin),
      v_mrp
    )
  FROM public.crm_reports r
  WHERE o.report_id = r.id
    AND r.report_date >= DATE '2026-07-01'
    AND r.report_date < DATE '2026-08-01'
    AND coalesce(o.total_amount, 0) > 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'July 2026 commission recalc: % rows updated', v_updated;
END;
$$;

-- Убрать legacy overload без via (считал только по bin)
DROP FUNCTION IF EXISTS public.backfill_order_commissions();
