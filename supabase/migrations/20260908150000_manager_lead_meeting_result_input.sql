-- При «Провести встречу» по лиду от лидоруба итог всегда жёстко записывался как
-- «Проведена (крупный лид)» — менеджер не мог вписать свой реальный итог. Добавляем
-- необязательный p_result: если менеджер его передал (непустой текст), используем его,
-- иначе остаётся старое поведение по умолчанию.
DROP FUNCTION IF EXISTS public.manager_set_lead_meeting_status(uuid, text);

CREATE FUNCTION public.manager_set_lead_meeting_status(p_lead_id uuid, p_status text, p_result text DEFAULT NULL)
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
  v_result text;
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

  IF v_lead.assigned_meeting_id IS NOT NULL THEN
    SELECT m.meeting_date, m.meeting_type, m.report_id
    INTO v_meeting_date, v_meeting_type, v_report_id
    FROM public.crm_assigned_meetings m
    WHERE m.id = v_lead.assigned_meeting_id;
  END IF;

  v_meeting_date := coalesce(v_meeting_date, (timezone('Asia/Almaty', now()))::date);
  v_meeting_type := coalesce(nullif(trim(v_meeting_type), ''), 'Крупный лид');
  v_result := coalesce(nullif(trim(p_result), ''), 'Проведена (крупный лид)');

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
      v_result,
      coalesce((SELECT max(m.sort_order) + 1 FROM public.crm_conducted_meetings m WHERE m.report_id = v_report_id), 0),
      false, 0, false
    )
    RETURNING id INTO v_conducted_id;
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

REVOKE ALL ON FUNCTION public.manager_set_lead_meeting_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_set_lead_meeting_status(uuid, text, text) TO authenticated;
