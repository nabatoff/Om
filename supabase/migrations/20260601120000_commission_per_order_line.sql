-- Комиссия по каждой строке amounts[], итог = сумма; лимит 4000 МРП на каждую строку.

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

CREATE OR REPLACE FUNCTION public.sum_order_line_commissions(
  p_amounts numeric[],
  p_total numeric,
  p_is_ktp boolean,
  p_mrp numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_sum numeric := 0;
  v_amt numeric;
  v_has_line boolean := false;
BEGIN
  IF p_amounts IS NOT NULL THEN
    FOREACH v_amt IN ARRAY p_amounts LOOP
      IF coalesce(v_amt, 0) > 0 THEN
        v_has_line := true;
        v_sum := v_sum + public.calc_order_commission(v_amt, p_is_ktp, p_mrp);
      END IF;
    END LOOP;
  END IF;

  IF NOT v_has_line AND coalesce(p_total, 0) > 0 THEN
    RETURN public.calc_order_commission(p_total, p_is_ktp, p_mrp);
  END IF;

  RETURN coalesce(v_sum, 0);
END;
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
    SELECT o.id, o.bin, o.amounts, o.total_amount
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

-- save_crm_report: лимит и комиссия по каждой строке amounts[].
CREATE OR REPLACE FUNCTION public.save_crm_report(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_active boolean := false;
  v_is_admin boolean := false;
  v_manager_name text := '';
  v_report_id uuid;
  v_input_report_id uuid := nullif(payload->>'reportId', '')::uuid;
  v_report_date date := (payload->>'reportDate')::date;
  v_stats jsonb := coalesce(payload->'stats', '{}'::jsonb);
  v_assigned jsonb := coalesce(payload->'assignedMeetings', '[]'::jsonb);
  v_conducted jsonb := coalesce(payload->'conductedMeetings', '[]'::jsonb);
  v_orders jsonb := coalesce(payload->'confirmedOrders', '[]'::jsonb);
  v_mrp numeric;
  v_max_order numeric;
  o record;
  v_line_amt numeric;
  v_line_idx integer;
  v_has_positive_line boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT
    (p.is_active IS NOT FALSE),
    trim(coalesce(p.full_name, '')),
    public.is_admin()
  INTO v_is_active, v_manager_name, v_is_admin
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF NOT coalesce(v_is_active, false) THEN
    RAISE EXCEPTION 'User is inactive' USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_manager_name, '') = '' THEN
    RAISE EXCEPTION 'Заполните ФИО в profiles.full_name' USING ERRCODE = '23514';
  END IF;

  v_mrp := public.get_crm_mrp();
  v_max_order := 4000 * v_mrp;

  FOR o IN
    SELECT
      coalesce(raw.amounts, ARRAY[]::numeric[]) AS amounts,
      coalesce(raw."totalAmount", 0)::numeric AS total_amount
    FROM jsonb_to_recordset(v_orders) AS raw(
      "entityName" text,
      bin text,
      "orderCount" int,
      amounts numeric[],
      "totalAmount" numeric,
      "viaEntityName" text,
      "viaBin" text
    )
    WHERE trim(coalesce(raw."entityName", '')) <> ''
      AND trim(coalesce(raw.bin, '')) <> ''
  LOOP
    v_line_idx := 0;
    v_has_positive_line := false;
    IF o.amounts IS NOT NULL THEN
      FOREACH v_line_amt IN ARRAY o.amounts LOOP
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
    IF NOT v_has_positive_line AND o.total_amount > v_max_order THEN
      RAISE EXCEPTION 'Сумма заказа не может превышать % ₸ (4000 МРП)', v_max_order
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF v_input_report_id IS NOT NULL THEN
    SELECT r.id INTO v_report_id
    FROM public.crm_reports r
    WHERE r.id = v_input_report_id
      AND (public.is_admin() OR r.manager_id = v_uid)
    LIMIT 1;
  END IF;

  IF v_report_id IS NULL THEN
    SELECT r.id INTO v_report_id
    FROM public.crm_reports r
    WHERE r.report_date = v_report_date
      AND (
        r.manager_id = v_uid
        OR (r.manager_id IS NULL AND trim(coalesce(r.manager, '')) = v_manager_name)
      )
    ORDER BY (r.manager_id IS NULL),
      (r.processed_total + r.new_in_work + r.calls_total + r.validated_total) DESC,
      r.id DESC
    LIMIT 1;
  END IF;

  CREATE TEMP TABLE tmp_old_conducted_cp_paid (
    id uuid PRIMARY KEY,
    cp_paid boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;

  IF v_report_id IS NOT NULL THEN
    INSERT INTO tmp_old_conducted_cp_paid (id, cp_paid)
    SELECT cm.id, coalesce(cm.cp_paid, false)
    FROM public.crm_conducted_meetings cm
    WHERE cm.report_id = v_report_id;
  END IF;

  IF v_report_id IS NULL THEN
    INSERT INTO public.crm_reports (
      report_date, manager, manager_id,
      processed_total, new_in_work, calls_total, validated_total
    )
    VALUES (
      v_report_date, v_manager_name, v_uid,
      coalesce((v_stats->>'processedTotal')::int, 0),
      coalesce((v_stats->>'newInWork')::int, 0),
      coalesce((v_stats->>'callsTotal')::int, 0),
      coalesce((v_stats->>'validatedTotal')::int, 0)
    )
    RETURNING id INTO v_report_id;
  ELSE
    UPDATE public.crm_reports SET
      report_date = v_report_date,
      manager = v_manager_name,
      manager_id = v_uid,
      processed_total = coalesce((v_stats->>'processedTotal')::int, 0),
      new_in_work = coalesce((v_stats->>'newInWork')::int, 0),
      calls_total = coalesce((v_stats->>'callsTotal')::int, 0),
      validated_total = coalesce((v_stats->>'validatedTotal')::int, 0)
    WHERE id = v_report_id;
    DELETE FROM public.crm_assigned_meetings WHERE report_id = v_report_id;
    DELETE FROM public.crm_conducted_meetings WHERE report_id = v_report_id;
    DELETE FROM public.crm_confirmed_orders WHERE report_id = v_report_id;
  END IF;

  INSERT INTO public.crm_assigned_meetings (report_id, entity_name, bin, meeting_date, meeting_type, sort_order)
  SELECT v_report_id, trim(coalesce(raw."entityName", '')), trim(coalesce(raw.bin, '')),
    raw.date, trim(coalesce(raw.type, '')), row_number() OVER () - 1
  FROM jsonb_to_recordset(v_assigned) AS raw("entityName" text, bin text, date date, type text)
  WHERE trim(coalesce(raw."entityName", '')) <> '' AND trim(coalesce(raw.bin, '')) <> '';

  INSERT INTO public.crm_conducted_meetings (
    id, report_id, entity_name, bin, meeting_date, meeting_type, result,
    sort_order, cp_sent, cp_quantity, cp_paid
  )
  SELECT
    coalesce(raw.id, gen_random_uuid()), v_report_id,
    trim(coalesce(raw."entityName", '')), trim(coalesce(raw.bin, '')),
    raw.date, trim(coalesce(raw.type, '')), coalesce(raw.result, ''),
    row_number() OVER () - 1,
    coalesce(raw."cpSent", false),
    CASE WHEN coalesce(raw."cpSent", false) THEN greatest(coalesce(raw."cpQuantity", 0), 0) ELSE 0 END,
    CASE
      WHEN NOT coalesce(raw."cpSent", false) THEN false
      WHEN v_is_admin THEN coalesce(raw."cpPaid", false)
      ELSE coalesce((SELECT t.cp_paid FROM tmp_old_conducted_cp_paid t WHERE t.id = raw.id), false)
    END
  FROM jsonb_to_recordset(v_conducted) AS raw(
    id uuid, "entityName" text, bin text, date date, type text, result text,
    "cpSent" boolean, "cpQuantity" int, "cpPaid" boolean
  )
  WHERE trim(coalesce(raw."entityName", '')) <> '' AND trim(coalesce(raw.bin, '')) <> '';

  INSERT INTO public.crm_confirmed_orders (
    report_id, entity_name, bin, order_count, amounts, total_amount, sort_order,
    via_entity_name, via_bin, mrp_kzt_applied, is_ktp_applied, commission_amount
  )
  SELECT
    v_report_id,
    trim(coalesce(raw."entityName", '')),
    trim(coalesce(raw.bin, '')),
    coalesce(raw."orderCount", 0),
    coalesce(raw.amounts, ARRAY[]::numeric[]),
    coalesce(raw."totalAmount", 0),
    row_number() OVER () - 1,
    trim(coalesce(raw."viaEntityName", '')),
    trim(coalesce(raw."viaBin", '')),
    v_mrp,
    public.crm_order_commission_is_ktp(trim(coalesce(raw.bin, '')), trim(coalesce(raw."viaBin", ''))),
    public.sum_order_line_commissions(
      coalesce(raw.amounts, ARRAY[]::numeric[]),
      coalesce(raw."totalAmount", 0)::numeric,
      public.crm_order_commission_is_ktp(trim(coalesce(raw.bin, '')), trim(coalesce(raw."viaBin", ''))),
      v_mrp
    )
  FROM jsonb_to_recordset(v_orders) AS raw(
    "entityName" text, bin text, "orderCount" int, amounts numeric[],
    "totalAmount" numeric, "viaEntityName" text, "viaBin" text
  )
  WHERE trim(coalesce(raw."entityName", '')) <> '' AND trim(coalesce(raw.bin, '')) <> '';

  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_crm_report(jsonb) TO authenticated;
