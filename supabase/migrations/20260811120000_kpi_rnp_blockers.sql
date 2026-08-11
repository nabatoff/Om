-- KPI modernization: stage_transitions, blockers, calls audit, updated save RPCs

ALTER TABLE public.crm_reports
  ADD COLUMN IF NOT EXISTS stage_transitions int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.crm_kpi_field_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.crm_reports(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text NOT NULL DEFAULT '',
  new_value text NOT NULL DEFAULT '',
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS crm_kpi_field_history_report_idx
  ON public.crm_kpi_field_history (report_id, changed_at DESC);

ALTER TABLE public.crm_kpi_field_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_kpi_field_history_select ON public.crm_kpi_field_history;
CREATE POLICY crm_kpi_field_history_select ON public.crm_kpi_field_history
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.crm_reports r
      WHERE r.id = report_id AND r.manager_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.crm_kpi_field_history FROM PUBLIC;
GRANT SELECT ON TABLE public.crm_kpi_field_history TO authenticated;
GRANT ALL ON TABLE public.crm_kpi_field_history TO service_role;

CREATE TABLE IF NOT EXISTS public.crm_manager_blockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bin text NOT NULL DEFAULT '',
  entity_name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_report_date date
);

CREATE INDEX IF NOT EXISTS crm_manager_blockers_manager_status_idx
  ON public.crm_manager_blockers (manager_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_manager_blockers_resolved_date_idx
  ON public.crm_manager_blockers (resolved_report_date, manager_id)
  WHERE status = 'resolved';

ALTER TABLE public.crm_manager_blockers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_manager_blockers_select ON public.crm_manager_blockers;
CREATE POLICY crm_manager_blockers_select ON public.crm_manager_blockers
  FOR SELECT TO authenticated
  USING (public.is_admin() OR manager_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS crm_manager_blockers_insert ON public.crm_manager_blockers;
CREATE POLICY crm_manager_blockers_insert ON public.crm_manager_blockers
  FOR INSERT TO authenticated
  WITH CHECK (manager_id = (SELECT auth.uid()) AND public.is_sales_manager());

DROP POLICY IF EXISTS crm_manager_blockers_update ON public.crm_manager_blockers;
CREATE POLICY crm_manager_blockers_update ON public.crm_manager_blockers
  FOR UPDATE TO authenticated
  USING (public.is_admin_write() OR manager_id = (SELECT auth.uid()))
  WITH CHECK (public.is_admin_write() OR manager_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.crm_manager_blockers FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_manager_blockers TO authenticated;
GRANT ALL ON TABLE public.crm_manager_blockers TO service_role;

CREATE OR REPLACE FUNCTION public.log_crm_kpi_field_change(
  p_report_id uuid,
  p_field text,
  p_old_value text,
  p_new_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_report_id IS NULL OR coalesce(p_field, '') = '' THEN
    RETURN;
  END IF;
  IF coalesce(p_old_value, '') IS NOT DISTINCT FROM coalesce(p_new_value, '') THEN
    RETURN;
  END IF;
  INSERT INTO public.crm_kpi_field_history (report_id, field, old_value, new_value, changed_by)
  VALUES (p_report_id, p_field, coalesce(p_old_value, ''), coalesce(p_new_value, ''), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.log_crm_kpi_field_change(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_crm_kpi_field_change(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_crm_kpi(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_active boolean := false;
  v_manager_name text := '';
  v_report_id uuid;
  v_input_report_id uuid := nullif(payload->>'reportId', '')::uuid;
  v_report_date date := (payload->>'reportDate')::date;
  v_processed int := coalesce((payload->>'processedTotal')::int, 0);
  v_new int := coalesce((payload->>'newInWork')::int, 0);
  v_calls int := coalesce((payload->>'callsTotal')::int, 0);
  v_validated int := coalesce((payload->>'validatedTotal')::int, 0);
  v_transitions int := coalesce((payload->>'stageTransitions')::int, 0);
  v_old_calls int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT (p.is_active IS NOT FALSE), trim(coalesce(p.full_name, ''))
  INTO v_is_active, v_manager_name
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF NOT coalesce(v_is_active, false) THEN
    RAISE EXCEPTION 'User is inactive' USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_manager_name, '') = '' THEN
    RAISE EXCEPTION 'Заполните ФИО в profiles.full_name' USING ERRCODE = '23514';
  END IF;

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
    ORDER BY (r.manager_id IS NULL), r.id DESC
    LIMIT 1;
  END IF;

  IF v_report_id IS NULL THEN
    INSERT INTO public.crm_reports (
      report_date, manager, manager_id,
      processed_total, new_in_work, calls_total, validated_total, stage_transitions
    )
    VALUES (
      v_report_date, v_manager_name, v_uid,
      v_processed, v_new, v_calls, v_validated, v_transitions
    )
    RETURNING id INTO v_report_id;
    IF v_calls <> 0 THEN
      PERFORM public.log_crm_kpi_field_change(v_report_id, 'calls_total', '0', v_calls::text);
    END IF;
  ELSE
    SELECT coalesce(r.calls_total, 0) INTO v_old_calls
    FROM public.crm_reports r
    WHERE r.id = v_report_id;

    UPDATE public.crm_reports
    SET
      report_date = v_report_date,
      manager = v_manager_name,
      manager_id = v_uid,
      processed_total = v_processed,
      new_in_work = v_new,
      calls_total = v_calls,
      validated_total = v_validated,
      stage_transitions = v_transitions
    WHERE id = v_report_id;

    PERFORM public.log_crm_kpi_field_change(
      v_report_id, 'calls_total', v_old_calls::text, v_calls::text
    );
  END IF;

  RETURN v_report_id;
END;
$$;

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
  v_old_calls int;
  v_new_calls int;
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
  v_new_calls := coalesce((v_stats->>'callsTotal')::int, 0);

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
    SELECT coalesce(r.calls_total, 0) INTO v_old_calls
    FROM public.crm_reports r
    WHERE r.id = v_report_id;

    INSERT INTO tmp_old_conducted_cp_paid (id, cp_paid)
    SELECT cm.id, coalesce(cm.cp_paid, false)
    FROM public.crm_conducted_meetings cm
    WHERE cm.report_id = v_report_id;
  END IF;

  IF v_report_id IS NULL THEN
    INSERT INTO public.crm_reports (
      report_date, manager, manager_id,
      processed_total, new_in_work, calls_total, validated_total, stage_transitions
    )
    VALUES (
      v_report_date, v_manager_name, v_uid,
      coalesce((v_stats->>'processedTotal')::int, 0),
      coalesce((v_stats->>'newInWork')::int, 0),
      v_new_calls,
      coalesce((v_stats->>'validatedTotal')::int, 0),
      coalesce((v_stats->>'stageTransitions')::int, 0)
    )
    RETURNING id INTO v_report_id;

    IF v_new_calls <> 0 THEN
      PERFORM public.log_crm_kpi_field_change(v_report_id, 'calls_total', '0', v_new_calls::text);
    END IF;
  ELSE
    UPDATE public.crm_reports SET
      report_date = v_report_date,
      manager = v_manager_name,
      manager_id = v_uid,
      processed_total = coalesce((v_stats->>'processedTotal')::int, 0),
      new_in_work = coalesce((v_stats->>'newInWork')::int, 0),
      calls_total = v_new_calls,
      validated_total = coalesce((v_stats->>'validatedTotal')::int, 0),
      stage_transitions = coalesce((v_stats->>'stageTransitions')::int, 0)
    WHERE id = v_report_id;

    PERFORM public.log_crm_kpi_field_change(
      v_report_id, 'calls_total', v_old_calls::text, v_new_calls::text
    );

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

CREATE OR REPLACE FUNCTION public.create_manager_blocker(
  p_bin text,
  p_entity_name text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_sales_manager() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_description), '') = '' THEN
    RAISE EXCEPTION 'Опишите проблему' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.crm_manager_blockers (manager_id, bin, entity_name, description)
  VALUES (
    v_uid,
    regexp_replace(coalesce(p_bin, ''), '[^0-9]', '', 'g'),
    coalesce(nullif(trim(p_entity_name), ''), ''),
    trim(p_description)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_manager_blocker(p_blocker_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (timezone('Asia/Almaty', now()))::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  UPDATE public.crm_manager_blockers b
  SET
    status = 'resolved',
    resolved_at = now(),
    resolved_report_date = v_today
  WHERE b.id = p_blocker_id
    AND b.status = 'active'
    AND (b.manager_id = v_uid OR public.is_admin_write());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Блокер не найден или уже снят' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_manager_blockers(p_active_only boolean DEFAULT true)
RETURNS TABLE (
  id uuid,
  manager_id uuid,
  manager_name text,
  bin text,
  entity_name text,
  description text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz,
  resolved_report_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.manager_id,
    p.full_name,
    b.bin,
    b.entity_name,
    b.description,
    b.status,
    b.created_at,
    b.resolved_at,
    b.resolved_report_date
  FROM public.crm_manager_blockers b
  JOIN public.profiles p ON p.id = b.manager_id
  WHERE (NOT p_active_only OR b.status = 'active')
    AND (public.is_admin() OR b.manager_id = v_uid)
  ORDER BY b.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_resolved_blockers(
  p_from date,
  p_to date,
  p_manager_id uuid DEFAULT NULL
)
RETURNS TABLE (
  manager_id uuid,
  manager_name text,
  report_date date,
  resolved_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    b.manager_id,
    p.full_name,
    b.resolved_report_date,
    count(*)::bigint
  FROM public.crm_manager_blockers b
  JOIN public.profiles p ON p.id = b.manager_id
  WHERE b.status = 'resolved'
    AND b.resolved_report_date IS NOT NULL
    AND (p_from IS NULL OR b.resolved_report_date >= p_from)
    AND (p_to IS NULL OR b.resolved_report_date <= p_to)
    AND (p_manager_id IS NULL OR b.manager_id = p_manager_id)
  GROUP BY b.manager_id, p.full_name, b.resolved_report_date
  ORDER BY b.resolved_report_date DESC, p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manager_blocker(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manager_blocker(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_manager_blocker(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_manager_blocker(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_manager_blockers(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_manager_blockers(boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.count_resolved_blockers(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_resolved_blockers(date, date, uuid) TO authenticated;
