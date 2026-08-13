-- Лид без назначенной встречи: менеджер «Взять в работу» → +квал, статус in_work («Передан»), карточка уходит.

ALTER TABLE public.crm_enterprise_leads
  DROP CONSTRAINT IF EXISTS crm_enterprise_leads_meeting_status_check;

ALTER TABLE public.crm_enterprise_leads
  ADD CONSTRAINT crm_enterprise_leads_meeting_status_check
  CHECK (meeting_status IS NULL OR meeting_status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'in_work'::text]));

-- Квал при назначении только если лид пришёл СО встречей.
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

  IF NOT coalesce(v_lead.qualification_counted, false)
     AND v_prev_manager IS NULL
     AND coalesce(v_lead.meeting_requested, false)
  THEN
    UPDATE public.crm_reports
    SET validated_total = coalesce(validated_total, 0) + 1
    WHERE id = v_report_id;
    v_count_qual := true;
  END IF;

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

CREATE OR REPLACE FUNCTION public.manager_take_enterprise_lead_in_work(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_report_id uuid;
  v_today date := (timezone('Asia/Almaty', now()))::date;
  v_count_qual boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
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
  IF v_lead.meeting_status IS NOT NULL THEN
    RAISE EXCEPTION 'Лид уже обработан' USING ERRCODE = '23514';
  END IF;
  IF coalesce(v_lead.meeting_requested, false) OR v_lead.assigned_meeting_id IS NOT NULL THEN
    RAISE EXCEPTION 'У лида назначена встреча — используйте «Провести встречу»' USING ERRCODE = '23514';
  END IF;
  IF v_lead.assigned_manager_id IS NULL THEN
    RAISE EXCEPTION 'Менеджер не назначен' USING ERRCODE = '23514';
  END IF;

  IF NOT coalesce(v_lead.qualification_counted, false) THEN
    v_report_id := public.ensure_crm_report_for_manager(v_lead.assigned_manager_id, v_today);
    UPDATE public.crm_reports
    SET validated_total = coalesce(validated_total, 0) + 1
    WHERE id = v_report_id;
    v_count_qual := true;
  END IF;

  UPDATE public.crm_enterprise_leads
  SET
    meeting_status = 'in_work',
    qualification_counted = coalesce(qualification_counted, false) OR v_count_qual,
    updated_at = now()
  WHERE id = p_lead_id;

  PERFORM public.log_crm_lead_event(
    p_lead_id,
    'in_work',
    jsonb_build_object('qualification_counted', v_count_qual)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manager_take_enterprise_lead_in_work(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_take_enterprise_lead_in_work(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_enterprise_leads(p_filter text DEFAULT 'pending')
RETURNS TABLE (
  id uuid,
  bin text,
  client_name text,
  creator_id uuid,
  creator_name text,
  distributor_id uuid,
  distributor_name text,
  assigned_manager_id uuid,
  assigned_manager_name text,
  routing_status text,
  meeting_status text,
  transferred_at timestamptz,
  transferred_on date,
  meeting_requested boolean,
  assigned_at timestamptz,
  returned_at timestamptz,
  assigned_meeting_id uuid,
  meeting_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filter text := lower(trim(coalesce(p_filter, 'pending')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.bin,
    c.name AS client_name,
    l.creator_id,
    trim(coalesce(cr.full_name, '')) AS creator_name,
    l.distributor_id,
    trim(coalesce(di.full_name, '')) AS distributor_name,
    l.assigned_manager_id,
    trim(coalesce(am.full_name, '')) AS assigned_manager_name,
    l.routing_status,
    l.meeting_status,
    l.transferred_at,
    coalesce(l.transferred_on, (timezone('Asia/Almaty', l.transferred_at))::date) AS transferred_on,
    coalesce(l.meeting_requested, false) AS meeting_requested,
    l.assigned_at,
    l.returned_at,
    l.assigned_meeting_id,
    m.meeting_date
  FROM public.crm_enterprise_leads l
  JOIN public.crm_clients c ON c.bin = l.bin
  LEFT JOIN public.profiles cr ON cr.id = l.creator_id
  LEFT JOIN public.profiles di ON di.id = l.distributor_id
  LEFT JOIN public.profiles am ON am.id = l.assigned_manager_id
  LEFT JOIN public.crm_assigned_meetings m ON m.id = l.assigned_meeting_id
  WHERE
    CASE
      WHEN public.is_admin() THEN
        CASE v_filter
          WHEN 'pending' THEN l.routing_status = 'pending_distribution'
          WHEN 'assigned' THEN l.routing_status = 'assigned_to_manager'
          WHEN 'returned' THEN l.routing_status = 'returned_to_smb'
          WHEN 'mine_assigned' THEN
            l.routing_status = 'assigned_to_manager'
            AND l.assigned_manager_id = auth.uid()
            AND coalesce(l.meeting_status, '') NOT IN ('completed', 'in_work')
          ELSE true
        END
      WHEN public.is_lead_digger() THEN
        l.creator_id = auth.uid()
        AND CASE v_filter
          WHEN 'returned' THEN l.routing_status = 'returned_to_smb'
          WHEN 'pending' THEN l.routing_status = 'pending_distribution'
          WHEN 'assigned' THEN l.routing_status = 'assigned_to_manager'
          ELSE l.routing_status IN ('pending_distribution', 'assigned_to_manager', 'returned_to_smb')
        END
      WHEN public.is_sales_manager() THEN
        l.assigned_manager_id = auth.uid()
        AND l.routing_status = 'assigned_to_manager'
        AND coalesce(l.meeting_status, '') NOT IN ('completed', 'in_work')
      ELSE false
    END
  ORDER BY l.transferred_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_enterprise_leads(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_enterprise_leads(text) TO authenticated;
