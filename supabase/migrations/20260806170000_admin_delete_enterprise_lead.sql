-- Admin can delete any enterprise lead; cascade meetings for digger + assigned manager

CREATE OR REPLACE FUNCTION public.admin_delete_enterprise_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_meeting_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin_write() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead
  FROM public.crm_enterprise_leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Лид не найден' USING ERRCODE = 'P0002';
  END IF;

  v_meeting_id := v_lead.assigned_meeting_id;

  PERFORM public.log_crm_lead_event(
    p_lead_id,
    'admin_deleted',
    jsonb_build_object(
      'bin', v_lead.bin,
      'routing_status', v_lead.routing_status,
      'creator_id', v_lead.creator_id,
      'assigned_manager_id', v_lead.assigned_manager_id
    )
  );

  UPDATE public.crm_enterprise_leads
  SET assigned_meeting_id = NULL, updated_at = now()
  WHERE id = p_lead_id;

  IF v_meeting_id IS NOT NULL THEN
    DELETE FROM public.crm_assigned_meetings WHERE id = v_meeting_id;
  END IF;

  -- Digger plan meetings for this BIN
  IF v_lead.creator_id IS NOT NULL THEN
    DELETE FROM public.crm_assigned_meetings m
    USING public.crm_reports r
    WHERE m.report_id = r.id
      AND r.manager_id = v_lead.creator_id
      AND m.bin = v_lead.bin
      AND m.deleted_at IS NULL;
  END IF;

  -- Manager plan meetings for this BIN (enterprise assign)
  IF v_lead.assigned_manager_id IS NOT NULL THEN
    DELETE FROM public.crm_assigned_meetings m
    USING public.crm_reports r
    WHERE m.report_id = r.id
      AND r.manager_id = v_lead.assigned_manager_id
      AND m.bin = v_lead.bin
      AND m.deleted_at IS NULL
      AND m.meeting_type IN ('Крупный лид', 'Новая');
  END IF;

  DELETE FROM public.crm_enterprise_leads WHERE id = p_lead_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_enterprise_leads l
    WHERE l.bin = v_lead.bin
      AND l.routing_status IN ('pending_distribution', 'assigned_to_manager')
  ) THEN
    UPDATE public.crm_clients
    SET business_scale = 'smb'
    WHERE bin = v_lead.bin
      AND business_scale = 'enterprise';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_returned_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.admin_delete_enterprise_lead(p_lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_enterprise_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_enterprise_lead(uuid) TO authenticated;
