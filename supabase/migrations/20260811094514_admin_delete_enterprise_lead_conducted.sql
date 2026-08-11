-- admin_delete_enterprise_lead: also soft-delete conducted «Крупный лид» by BIN + manager

CREATE OR REPLACE FUNCTION public.admin_delete_enterprise_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_meeting_id uuid;
  v_extra uuid;
  v_bin_digits text;
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

  v_bin_digits := regexp_replace(coalesce(v_lead.bin, ''), '[^0-9]', '', 'g');

  IF v_lead.routing_status = 'returned_to_smb' THEN
    FOR v_extra IN
      SELECT l.id
      FROM public.crm_enterprise_leads l
      WHERE l.bin = v_lead.bin
        AND l.routing_status = 'returned_to_smb'
        AND l.id IS DISTINCT FROM p_lead_id
    LOOP
      PERFORM public.log_crm_lead_event(
        v_extra,
        'admin_deleted',
        jsonb_build_object('bin', v_lead.bin, 'cascade_same_bin', true)
      );
      DELETE FROM public.crm_enterprise_leads WHERE id = v_extra;
    END LOOP;
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

  IF v_lead.creator_id IS NOT NULL THEN
    DELETE FROM public.crm_assigned_meetings m
    USING public.crm_reports r
    WHERE m.report_id = r.id
      AND r.manager_id = v_lead.creator_id
      AND m.bin = v_lead.bin
      AND m.deleted_at IS NULL;
  END IF;

  IF v_lead.assigned_manager_id IS NOT NULL THEN
    DELETE FROM public.crm_assigned_meetings m
    USING public.crm_reports r
    WHERE m.report_id = r.id
      AND r.manager_id = v_lead.assigned_manager_id
      AND m.bin = v_lead.bin
      AND m.deleted_at IS NULL
      AND m.meeting_type IN ('Крупный лид', 'Новая');

    IF v_bin_digits <> '' THEN
      UPDATE public.crm_conducted_meetings cm
      SET
        deleted_at = now(),
        deleted_by = auth.uid()
      FROM public.crm_reports r
      WHERE cm.report_id = r.id
        AND r.manager_id = v_lead.assigned_manager_id
        AND cm.deleted_at IS NULL
        AND regexp_replace(coalesce(cm.bin, ''), '[^0-9]', '', 'g') = v_bin_digits
        AND lower(replace(coalesce(cm.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%';
    END IF;
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
