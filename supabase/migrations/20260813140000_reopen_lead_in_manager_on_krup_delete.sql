-- Удаление проведённой «Крупный лид»: лид снова в «Мои лиды».
-- План встречи поднимаем из корзины. Статус не in_work (иначе карточка скрыта).

CREATE OR REPLACE FUNCTION public.sync_enterprise_lead_for_krup_meeting(
  p_bin text,
  p_manager_id uuid,
  p_hint_assigned_id uuid DEFAULT NULL,
  p_hint_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bin text := regexp_replace(coalesce(p_bin, ''), '[^0-9]', '', 'g');
  v_has_conducted boolean := false;
  v_had_scheduled boolean := false;
  v_assigned_id uuid;
  v_meeting_date date;
  v_digger_id uuid;
  v_lead public.crm_enterprise_leads%ROWTYPE;
  v_today date := (timezone('Asia/Almaty', now()))::date;
  v_report_id uuid;
  v_count_qual boolean := false;
  v_prev_routing text;
  v_prev_status text;
  v_new_status text;
BEGIN
  IF v_bin = '' OR length(v_bin) <> 12 OR p_manager_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.crm_clients c WHERE c.bin = v_bin) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.crm_conducted_meetings cm
    JOIN public.crm_reports r ON r.id = cm.report_id
    WHERE cm.deleted_at IS NULL
      AND r.manager_id = p_manager_id
      AND regexp_replace(coalesce(cm.bin, ''), '[^0-9]', '', 'g') = v_bin
      AND lower(replace(coalesce(cm.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%'
  ) INTO v_has_conducted;

  SELECT EXISTS (
    SELECT 1
    FROM public.crm_assigned_meetings m
    JOIN public.crm_reports r ON r.id = m.report_id
    WHERE r.manager_id = p_manager_id
      AND regexp_replace(coalesce(m.bin, ''), '[^0-9]', '', 'g') = v_bin
      AND lower(replace(coalesce(m.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%'
  ) INTO v_had_scheduled;

  SELECT m.id, m.meeting_date
  INTO v_assigned_id, v_meeting_date
  FROM public.crm_assigned_meetings m
  JOIN public.crm_reports r ON r.id = m.report_id
  WHERE m.deleted_at IS NULL
    AND r.manager_id = p_manager_id
    AND regexp_replace(coalesce(m.bin, ''), '[^0-9]', '', 'g') = v_bin
    AND lower(replace(coalesce(m.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%'
  ORDER BY m.meeting_date DESC NULLS LAST, m.sort_order DESC
  LIMIT 1;

  IF v_assigned_id IS NULL AND p_hint_assigned_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.crm_assigned_meetings m
      WHERE m.id = p_hint_assigned_id
        AND m.deleted_at IS NULL
        AND lower(replace(coalesce(m.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%'
    ) THEN
      v_assigned_id := p_hint_assigned_id;
      v_meeting_date := coalesce(v_meeting_date, p_hint_date);
      v_had_scheduled := true;
    END IF;
  END IF;

  -- Факта больше нет — вернуть последний план «Крупный лид» из корзины.
  IF NOT v_has_conducted AND v_assigned_id IS NULL THEN
    SELECT m.id, m.meeting_date
    INTO v_assigned_id, v_meeting_date
    FROM public.crm_assigned_meetings m
    JOIN public.crm_reports r ON r.id = m.report_id
    WHERE m.deleted_at IS NOT NULL
      AND r.manager_id = p_manager_id
      AND regexp_replace(coalesce(m.bin, ''), '[^0-9]', '', 'g') = v_bin
      AND lower(replace(coalesce(m.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%'
    ORDER BY m.deleted_at DESC NULLS LAST
    LIMIT 1;

    IF v_assigned_id IS NOT NULL THEN
      UPDATE public.crm_assigned_meetings
      SET deleted_at = NULL
      WHERE id = v_assigned_id;
      v_had_scheduled := true;
    END IF;
  END IF;

  SELECT l.* INTO v_lead
  FROM public.crm_enterprise_leads l
  WHERE l.bin = v_bin
    AND l.routing_status IN ('pending_distribution', 'assigned_to_manager')
  ORDER BY
    CASE
      WHEN l.assigned_manager_id IS NOT DISTINCT FROM p_manager_id THEN 0
      WHEN l.assigned_manager_id IS NULL THEN 1
      ELSE 2
    END,
    l.created_at DESC
  LIMIT 1;

  IF v_lead.id IS NULL AND v_assigned_id IS NULL AND NOT v_has_conducted THEN
    RETURN;
  END IF;

  v_meeting_date := coalesce(v_meeting_date, p_hint_date, v_today);

  SELECT c.digger_id INTO v_digger_id FROM public.crm_clients c WHERE c.bin = v_bin;

  UPDATE public.crm_clients
  SET
    business_scale = 'enterprise',
    manager_id = coalesce(manager_id, p_manager_id)
  WHERE bin = v_bin;

  IF v_lead.id IS NULL THEN
    v_new_status := CASE
      WHEN v_has_conducted THEN 'completed'
      ELSE NULL
    END;
    INSERT INTO public.crm_enterprise_leads (
      bin, creator_id, assigned_manager_id, routing_status, meeting_status,
      transferred_at, transferred_on, assigned_at, assigned_meeting_id,
      meeting_requested, qualification_counted
    ) VALUES (
      v_bin,
      coalesce(v_digger_id, p_manager_id),
      p_manager_id,
      'assigned_to_manager',
      v_new_status,
      now(),
      v_meeting_date,
      now(),
      v_assigned_id,
      v_assigned_id IS NOT NULL OR v_had_scheduled,
      true
    )
    RETURNING * INTO v_lead;

    INSERT INTO public.crm_lead_events (lead_id, actor_id, action, payload)
    VALUES (
      v_lead.id,
      auth.uid(),
      'meeting_sync',
      jsonb_build_object(
        'manager_id', p_manager_id,
        'meeting_status', v_new_status,
        'source', 'krup_meeting'
      )
    );
    RETURN;
  END IF;

  IF v_lead.assigned_manager_id IS NOT NULL
     AND v_lead.assigned_manager_id IS DISTINCT FROM p_manager_id
     AND v_lead.routing_status = 'assigned_to_manager' THEN
    RETURN;
  END IF;

  v_prev_routing := v_lead.routing_status;
  v_prev_status := v_lead.meeting_status;
  v_new_status := CASE
    WHEN v_has_conducted THEN 'completed'
    WHEN v_prev_status = 'cancelled' THEN 'cancelled'
    ELSE NULL
  END;

  IF v_prev_routing = 'pending_distribution' AND NOT coalesce(v_lead.qualification_counted, false) THEN
    v_report_id := public.ensure_crm_report_for_manager(p_manager_id, v_today);
    UPDATE public.crm_reports
    SET validated_total = coalesce(validated_total, 0) + 1
    WHERE id = v_report_id;
    v_count_qual := true;
  END IF;

  UPDATE public.crm_enterprise_leads
  SET
    assigned_manager_id = p_manager_id,
    routing_status = 'assigned_to_manager',
    assigned_at = coalesce(assigned_at, now()),
    assigned_meeting_id = v_assigned_id,
    meeting_status = v_new_status,
    meeting_requested = CASE
      WHEN v_assigned_id IS NOT NULL OR v_had_scheduled THEN true
      ELSE meeting_requested
    END,
    qualification_counted = coalesce(qualification_counted, false) OR v_count_qual,
    updated_at = now()
  WHERE id = v_lead.id;

  IF v_prev_routing IS DISTINCT FROM 'assigned_to_manager'
     OR v_prev_status IS DISTINCT FROM v_new_status
     OR v_count_qual THEN
    INSERT INTO public.crm_lead_events (lead_id, actor_id, action, payload)
    VALUES (
      v_lead.id,
      auth.uid(),
      'meeting_sync',
      jsonb_build_object(
        'manager_id', p_manager_id,
        'meeting_status', v_new_status,
        'qualification_counted', v_count_qual,
        'source', 'krup_meeting',
        'reopened', v_new_status IS NULL
      )
    );
  END IF;
END;
$$;
