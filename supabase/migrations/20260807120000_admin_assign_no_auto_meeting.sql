-- Assign from buffer: only attach manager to lead/client, do NOT auto-create meeting

CREATE OR REPLACE FUNCTION public.admin_assign_enterprise_lead(p_lead_id uuid, p_manager_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_prev_manager uuid;
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

  -- Clean leftover auto-meeting from old assign flow (if any)
  IF v_lead.assigned_meeting_id IS NOT NULL THEN
    UPDATE public.crm_enterprise_leads
    SET assigned_meeting_id = NULL
    WHERE id = p_lead_id;

    DELETE FROM public.crm_assigned_meetings WHERE id = v_lead.assigned_meeting_id;
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
    assigned_meeting_id = NULL,
    meeting_status = CASE WHEN v_prev_manager IS DISTINCT FROM p_manager_id THEN NULL ELSE meeting_status END,
    updated_at = now()
  WHERE id = p_lead_id;

  PERFORM public.log_crm_lead_event(
    p_lead_id,
    CASE WHEN v_prev_manager IS NULL THEN 'assigned' ELSE 'reassigned' END,
    jsonb_build_object(
      'manager_id', p_manager_id,
      'prev_manager_id', v_prev_manager,
      'auto_meeting', false
    )
  );
END;
$$;
