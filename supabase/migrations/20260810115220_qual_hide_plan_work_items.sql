-- +1 qualification on first assign; hide planned Крупный лид after completed;
-- crm_manager_work_items + RPCs for Madina pilot / admin KPI period

ALTER TABLE public.crm_enterprise_leads
  ADD COLUMN IF NOT EXISTS qualification_counted boolean NOT NULL DEFAULT false;

UPDATE public.crm_enterprise_leads
SET qualification_counted = true
WHERE assigned_manager_id IS NOT NULL
  AND qualification_counted = false;

-- Assign: always ensure report; +1 validated_total on first assign (idempotent)
CREATE OR REPLACE FUNCTION public.admin_assign_enterprise_lead(p_lead_id uuid, p_manager_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_prev_manager uuid;
  v_report_id uuid;
  v_meeting_id uuid;
  v_client_name text;
  v_today date := (timezone('Asia/Almaty', now()))::date;
  v_count_qual boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin_write() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead FROM public.crm_enterprise_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Лид не найден' USING ERRCODE = 'P0002';
  END IF;
  IF v_lead.routing_status = 'returned_to_smb' THEN
    RAISE EXCEPTION 'Лид уже возвращён на СМБ' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_manager_id AND p.role = 'manager' AND coalesce(p.is_active, true)
  ) THEN
    RAISE EXCEPTION 'Менеджер не найден или неактивен' USING ERRCODE = 'P0002';
  END IF;

  v_prev_manager := v_lead.assigned_manager_id;
  SELECT c.name INTO v_client_name FROM public.crm_clients c WHERE c.bin = v_lead.bin;

  v_report_id := public.ensure_crm_report_for_manager(p_manager_id, v_today);

  IF NOT coalesce(v_lead.qualification_counted, false) AND v_prev_manager IS NULL THEN
    UPDATE public.crm_reports
    SET validated_total = coalesce(validated_total, 0) + 1
    WHERE id = v_report_id;
    v_count_qual := true;
  END IF;

  -- Drop stale auto-meeting if reassigning or meeting no longer requested
  IF v_lead.assigned_meeting_id IS NOT NULL THEN
    IF NOT coalesce(v_lead.meeting_requested, false)
      OR v_prev_manager IS DISTINCT FROM p_manager_id
    THEN
      UPDATE public.crm_enterprise_leads
      SET assigned_meeting_id = NULL
      WHERE id = p_lead_id;

      DELETE FROM public.crm_assigned_meetings WHERE id = v_lead.assigned_meeting_id;
      v_lead.assigned_meeting_id := NULL;
    END IF;
  END IF;

  v_meeting_id := NULL;
  IF coalesce(v_lead.meeting_requested, false) THEN
    IF v_lead.assigned_meeting_id IS NULL OR v_prev_manager IS DISTINCT FROM p_manager_id THEN
      INSERT INTO public.crm_assigned_meetings (
        report_id, entity_name, bin, meeting_date, meeting_type, sort_order
      )
      VALUES (
        v_report_id,
        coalesce(v_client_name, v_lead.bin),
        v_lead.bin,
        v_today,
        'Крупный лид',
        coalesce((SELECT max(m.sort_order) + 1 FROM public.crm_assigned_meetings m WHERE m.report_id = v_report_id), 0)
      )
      RETURNING id INTO v_meeting_id;
    ELSE
      v_meeting_id := v_lead.assigned_meeting_id;
      UPDATE public.crm_assigned_meetings
      SET
        meeting_date = v_today,
        meeting_type = 'Крупный лид',
        entity_name = coalesce(v_client_name, v_lead.bin),
        report_id = v_report_id
      WHERE id = v_meeting_id;
    END IF;
  END IF;

  UPDATE public.crm_clients
  SET
    manager_id = p_manager_id,
    digger_id = coalesce(digger_id, v_lead.creator_id),
    business_scale = 'enterprise'
  WHERE bin = v_lead.bin;

  UPDATE public.crm_enterprise_leads
  SET
    assigned_manager_id = p_manager_id,
    distributor_id = auth.uid(),
    routing_status = 'assigned_to_manager',
    assigned_at = coalesce(assigned_at, now()),
    assigned_meeting_id = v_meeting_id,
    qualification_counted = coalesce(qualification_counted, false) OR v_count_qual,
    meeting_status = CASE WHEN v_prev_manager IS DISTINCT FROM p_manager_id THEN NULL ELSE meeting_status END,
    updated_at = now()
  WHERE id = p_lead_id;

  PERFORM public.log_crm_lead_event(
    p_lead_id,
    CASE WHEN v_prev_manager IS NULL THEN 'assigned' ELSE 'reassigned' END,
    jsonb_build_object(
      'manager_id', p_manager_id,
      'prev_manager_id', v_prev_manager,
      'auto_meeting', coalesce(v_lead.meeting_requested, false),
      'qualification_counted', v_count_qual
    )
  );
END;
$$;

-- Completed: insert conducted + soft-delete manager planned Крупный лид by BIN
CREATE OR REPLACE FUNCTION public.manager_set_lead_meeting_status(p_lead_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_report_id uuid;
  v_conducted_id uuid;
  v_client_name text;
  v_meeting_date date;
  v_meeting_type text;
  v_bin_digits text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF v_status NOT IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Статус: completed или cancelled' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_lead FROM public.crm_enterprise_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Лид не найден' USING ERRCODE = 'P0002';
  END IF;
  IF v_lead.routing_status <> 'assigned_to_manager' THEN
    RAISE EXCEPTION 'Лид не у менеджера' USING ERRCODE = '23514';
  END IF;
  IF NOT public.is_admin_write() AND v_lead.assigned_manager_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT c.name INTO v_client_name FROM public.crm_clients c WHERE c.bin = v_lead.bin;
  v_bin_digits := regexp_replace(coalesce(v_lead.bin, ''), '[^0-9]', '', 'g');

  IF v_lead.assigned_meeting_id IS NOT NULL THEN
    SELECT m.meeting_date, m.meeting_type, m.report_id
    INTO v_meeting_date, v_meeting_type, v_report_id
    FROM public.crm_assigned_meetings m
    WHERE m.id = v_lead.assigned_meeting_id;
  END IF;

  v_meeting_date := coalesce(v_meeting_date, (timezone('Asia/Almaty', now()))::date);
  v_meeting_type := coalesce(nullif(trim(v_meeting_type), ''), 'Крупный лид');

  IF v_status = 'completed' THEN
    v_report_id := coalesce(
      v_report_id,
      public.ensure_crm_report_for_manager(v_lead.assigned_manager_id, v_meeting_date)
    );

    INSERT INTO public.crm_conducted_meetings (
      report_id, entity_name, bin, meeting_date, meeting_type, result, sort_order,
      cp_sent, cp_quantity, cp_paid
    )
    VALUES (
      v_report_id,
      coalesce(v_client_name, v_lead.bin),
      v_lead.bin,
      v_meeting_date,
      v_meeting_type,
      'Проведена (крупный лид)',
      coalesce((SELECT max(m.sort_order) + 1 FROM public.crm_conducted_meetings m WHERE m.report_id = v_report_id), 0),
      false, 0, false
    )
    RETURNING id INTO v_conducted_id;

    UPDATE public.crm_enterprise_leads
    SET assigned_meeting_id = NULL
    WHERE id = p_lead_id;

    UPDATE public.crm_assigned_meetings m
    SET deleted_at = now()
    FROM public.crm_reports r
    WHERE m.report_id = r.id
      AND r.manager_id = v_lead.assigned_manager_id
      AND m.deleted_at IS NULL
      AND (
        m.id = v_lead.assigned_meeting_id
        OR (
          v_bin_digits <> ''
          AND regexp_replace(coalesce(m.bin, ''), '[^0-9]', '', 'g') = v_bin_digits
          AND lower(replace(coalesce(m.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%'
        )
      );
  END IF;

  UPDATE public.crm_enterprise_leads
  SET meeting_status = v_status, updated_at = now()
  WHERE id = p_lead_id;

  PERFORM public.log_crm_lead_event(
    p_lead_id,
    v_status,
    jsonb_build_object('conducted_id', v_conducted_id)
  );
END;
$$;

CREATE TABLE IF NOT EXISTS public.crm_manager_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.crm_reports(id) ON DELETE CASCADE,
  bin text NOT NULL DEFAULT '',
  entity_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'in_work'
    CHECK (status IN ('in_work', 'waiting', 'blocked', 'done')),
  next_step text NOT NULL DEFAULT '',
  deadline date,
  blockers text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_manager_work_items_report_idx
  ON public.crm_manager_work_items (report_id, sort_order);

CREATE INDEX IF NOT EXISTS crm_manager_work_items_bin_idx
  ON public.crm_manager_work_items (bin);

CREATE INDEX IF NOT EXISTS crm_manager_work_items_updated_idx
  ON public.crm_manager_work_items (updated_at DESC);

ALTER TABLE public.crm_manager_work_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_manager_work_items_select ON public.crm_manager_work_items;
CREATE POLICY crm_manager_work_items_select ON public.crm_manager_work_items
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.crm_reports r
      WHERE r.id = report_id AND r.manager_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS crm_manager_work_items_insert ON public.crm_manager_work_items;
CREATE POLICY crm_manager_work_items_insert ON public.crm_manager_work_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_write()
    OR EXISTS (
      SELECT 1 FROM public.crm_reports r
      WHERE r.id = report_id AND r.manager_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS crm_manager_work_items_update ON public.crm_manager_work_items;
CREATE POLICY crm_manager_work_items_update ON public.crm_manager_work_items
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_write()
    OR EXISTS (
      SELECT 1 FROM public.crm_reports r
      WHERE r.id = report_id AND r.manager_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin_write()
    OR EXISTS (
      SELECT 1 FROM public.crm_reports r
      WHERE r.id = report_id AND r.manager_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS crm_manager_work_items_delete ON public.crm_manager_work_items;
CREATE POLICY crm_manager_work_items_delete ON public.crm_manager_work_items
  FOR DELETE TO authenticated
  USING (
    public.is_admin_write()
    OR EXISTS (
      SELECT 1 FROM public.crm_reports r
      WHERE r.id = report_id AND r.manager_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.crm_manager_work_items FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_manager_work_items TO authenticated;
GRANT ALL ON TABLE public.crm_manager_work_items TO service_role;

CREATE OR REPLACE FUNCTION public.save_crm_work_items(p_report_date date, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_report_id uuid;
  v_item jsonb;
  v_status text;
  v_bin text;
  v_order int := 0;
  v_distinct int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_sales_manager() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_report_date IS NULL THEN
    RAISE EXCEPTION 'Дата отчёта обязательна' USING ERRCODE = '23514';
  END IF;

  v_report_id := public.ensure_crm_report_for_manager(v_uid, p_report_date);

  DELETE FROM public.crm_manager_work_items WHERE report_id = v_report_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_status := lower(trim(coalesce(v_item->>'status', 'in_work')));
      IF v_status NOT IN ('in_work', 'waiting', 'blocked', 'done') THEN
        v_status := 'in_work';
      END IF;
      v_bin := regexp_replace(coalesce(v_item->>'bin', ''), '[^0-9]', '', 'g');
      INSERT INTO public.crm_manager_work_items (
        report_id, bin, entity_name, status, next_step, deadline, blockers, sort_order, updated_at
      )
      VALUES (
        v_report_id,
        v_bin,
        coalesce(nullif(trim(v_item->>'entity_name'), ''), ''),
        v_status,
        coalesce(v_item->>'next_step', ''),
        NULLIF(trim(coalesce(v_item->>'deadline', '')), '')::date,
        coalesce(v_item->>'blockers', ''),
        coalesce((v_item->>'sort_order')::int, v_order),
        now()
      );
      v_order := v_order + 1;
    END LOOP;
  END IF;

  SELECT count(DISTINCT nullif(bin, '')) INTO v_distinct
  FROM public.crm_manager_work_items
  WHERE report_id = v_report_id;

  UPDATE public.crm_reports
  SET processed_total = coalesce(v_distinct, 0)
  WHERE id = v_report_id;

  RETURN v_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_crm_work_items_for_date(p_report_date date)
RETURNS TABLE (
  id uuid,
  report_id uuid,
  bin text,
  entity_name text,
  status text,
  next_step text,
  deadline date,
  blockers text,
  sort_order int,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_report_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT r.id INTO v_report_id
  FROM public.crm_reports r
  WHERE r.report_date = p_report_date
    AND r.manager_id = v_uid
  LIMIT 1;

  IF v_report_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.report_id,
    w.bin,
    w.entity_name,
    w.status,
    w.next_step,
    w.deadline,
    w.blockers,
    w.sort_order,
    w.updated_at
  FROM public.crm_manager_work_items w
  WHERE w.report_id = v_report_id
  ORDER BY w.sort_order, w.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_manager_work_items(
  p_from date,
  p_to date,
  p_manager_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  report_id uuid,
  report_date date,
  manager_id uuid,
  manager_name text,
  bin text,
  entity_name text,
  status text,
  next_step text,
  deadline date,
  blockers text,
  sort_order int,
  updated_at timestamptz
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
    w.id,
    w.report_id,
    r.report_date,
    r.manager_id,
    r.manager,
    w.bin,
    w.entity_name,
    w.status,
    w.next_step,
    w.deadline,
    w.blockers,
    w.sort_order,
    w.updated_at
  FROM public.crm_manager_work_items w
  JOIN public.crm_reports r ON r.id = w.report_id
  WHERE (p_from IS NULL OR r.report_date >= p_from)
    AND (p_to IS NULL OR r.report_date <= p_to)
    AND (p_manager_id IS NULL OR r.manager_id = p_manager_id)
  ORDER BY r.report_date, r.manager, w.sort_order, w.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.save_crm_work_items(date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_crm_work_items(date, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.list_crm_work_items_for_date(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_crm_work_items_for_date(date) TO authenticated;

REVOKE ALL ON FUNCTION public.list_manager_work_items(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_manager_work_items(date, date, uuid) TO authenticated;
