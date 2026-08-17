-- Админ (admin_write) меняет статус крупного лида теми же побочными эффектами, что у менеджера.
-- completed → факт встречи; откат completed → мягкое удаление факта и возврат плана.

CREATE OR REPLACE FUNCTION public.admin_set_enterprise_lead_status(p_lead_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_current text;
  v_bin_digits text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin_write() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('waiting', 'in_work', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Статус: waiting, in_work, completed или cancelled' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_lead FROM public.crm_enterprise_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Лид не найден' USING ERRCODE = 'P0002';
  END IF;
  IF v_lead.routing_status <> 'assigned_to_manager' THEN
    RAISE EXCEPTION 'Сначала назначьте менеджера' USING ERRCODE = '23514';
  END IF;
  IF v_lead.assigned_manager_id IS NULL THEN
    RAISE EXCEPTION 'Менеджер не назначен' USING ERRCODE = '23514';
  END IF;

  v_current := coalesce(v_lead.meeting_status, 'waiting');
  IF v_current = v_status THEN
    RETURN;
  END IF;

  v_bin_digits := regexp_replace(coalesce(v_lead.bin, ''), '[^0-9]', '', 'g');

  IF v_current = 'completed' AND v_status <> 'completed' THEN
    UPDATE public.crm_conducted_meetings cm
    SET deleted_at = now()
    FROM public.crm_reports r
    WHERE cm.report_id = r.id
      AND cm.deleted_at IS NULL
      AND r.manager_id = v_lead.assigned_manager_id
      AND v_bin_digits <> ''
      AND regexp_replace(coalesce(cm.bin, ''), '[^0-9]', '', 'g') = v_bin_digits
      AND lower(replace(coalesce(cm.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%';

    PERFORM public.sync_enterprise_lead_for_krup_meeting(
      v_lead.bin,
      v_lead.assigned_manager_id,
      v_lead.assigned_meeting_id,
      NULL
    );

    SELECT * INTO v_lead FROM public.crm_enterprise_leads WHERE id = p_lead_id;
  END IF;

  IF v_status = 'completed' THEN
    PERFORM public.manager_set_lead_meeting_status(p_lead_id, 'completed');
    RETURN;
  END IF;

  IF v_status = 'cancelled' THEN
    UPDATE public.crm_enterprise_leads
    SET meeting_status = 'cancelled', updated_at = now()
    WHERE id = p_lead_id;
    PERFORM public.log_crm_lead_event(p_lead_id, 'cancelled', jsonb_build_object('by_admin', true));
    RETURN;
  END IF;

  IF v_status = 'in_work' THEN
    IF NOT coalesce(v_lead.meeting_requested, false)
       AND v_lead.assigned_meeting_id IS NULL
       AND v_lead.meeting_status IS NULL
    THEN
      PERFORM public.manager_take_enterprise_lead_in_work(p_lead_id);
      RETURN;
    END IF;

    UPDATE public.crm_enterprise_leads
    SET meeting_status = 'in_work', updated_at = now()
    WHERE id = p_lead_id;
    PERFORM public.log_crm_lead_event(p_lead_id, 'in_work', jsonb_build_object('by_admin', true));
    RETURN;
  END IF;

  UPDATE public.crm_enterprise_leads
  SET meeting_status = NULL, updated_at = now()
  WHERE id = p_lead_id;
  PERFORM public.log_crm_lead_event(p_lead_id, 'waiting', jsonb_build_object('by_admin', true, 'reopened', true));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_enterprise_lead_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_enterprise_lead_status(uuid, text) TO authenticated;
