-- Не дублировать факт встречи: если менеджер уже записал проведение по БИН в отчёт,
-- «Провести встречу» по крупному лиду только закрывает лид без второй строки.

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
    SELECT cm.id, cm.report_id
    INTO v_conducted_id, v_report_id
    FROM public.crm_conducted_meetings cm
    JOIN public.crm_reports r ON r.id = cm.report_id
    WHERE cm.deleted_at IS NULL
      AND r.manager_id = v_lead.assigned_manager_id
      AND v_bin_digits <> ''
      AND regexp_replace(coalesce(cm.bin, ''), '[^0-9]', '', 'g') = v_bin_digits
      AND cm.meeting_date = v_meeting_date
    ORDER BY
      CASE
        WHEN lower(replace(coalesce(cm.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%' THEN 0
        ELSE 1
      END,
      cm.sort_order
    LIMIT 1;

    IF v_conducted_id IS NULL THEN
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
    END IF;

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
    jsonb_build_object('conducted_id', v_conducted_id, 'reused_existing', v_conducted_id IS NOT NULL)
  );
END;
$$;

-- Убрать дубликат по Алматы Энерго: оставляем «Новая» с комментарием менеджера.
UPDATE public.crm_conducted_meetings
SET deleted_at = now()
WHERE id = '52e11064-baa0-4c85-818d-4e1b9cfdeaf7'
  AND deleted_at IS NULL
  AND result = 'Проведена (крупный лид)';
