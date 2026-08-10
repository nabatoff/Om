-- Крупный лид на встрече → строка в «Переданные в круп» со статусом факта/плана

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
    END IF;
  END IF;

  IF v_assigned_id IS NULL AND NOT v_has_conducted THEN
    RETURN;
  END IF;

  v_meeting_date := coalesce(v_meeting_date, p_hint_date, v_today);

  SELECT c.digger_id INTO v_digger_id FROM public.crm_clients c WHERE c.bin = v_bin;

  UPDATE public.crm_clients
  SET
    business_scale = 'enterprise',
    manager_id = coalesce(manager_id, p_manager_id)
  WHERE bin = v_bin;

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

  IF v_lead.id IS NULL THEN
    v_new_status := CASE WHEN v_has_conducted THEN 'completed' ELSE NULL END;
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
      true,
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
    assigned_meeting_id = coalesce(v_assigned_id, assigned_meeting_id),
    meeting_requested = true,
    meeting_status = v_new_status,
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
        'source', 'krup_meeting'
      )
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_enterprise_lead_from_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_old_type text;
  v_new_type text;
  v_bin text;
  v_manager_id uuid;
  v_is_krup boolean := false;
  v_was_krup boolean := false;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  v_bin := regexp_replace(coalesce(v_row.bin, ''), '[^0-9]', '', 'g');
  v_new_type := lower(replace(coalesce(v_row.meeting_type, ''), 'ё', 'е'));
  v_is_krup := v_new_type LIKE '%крупн%';

  IF TG_OP = 'UPDATE' THEN
    v_old_type := lower(replace(coalesce(OLD.meeting_type, ''), 'ё', 'е'));
    v_was_krup := v_old_type LIKE '%крупн%';
  END IF;

  IF v_bin = '' OR length(v_bin) <> 12 THEN
    RETURN v_row;
  END IF;

  SELECT r.manager_id INTO v_manager_id
  FROM public.crm_reports r
  WHERE r.id = v_row.report_id;

  IF v_manager_id IS NULL THEN
    RETURN v_row;
  END IF;

  IF v_is_krup AND TG_OP <> 'DELETE' AND v_row.deleted_at IS NULL THEN
    PERFORM public.sync_enterprise_lead_for_krup_meeting(
      v_bin,
      v_manager_id,
      CASE WHEN TG_TABLE_NAME = 'crm_assigned_meetings' THEN v_row.id ELSE NULL END,
      v_row.meeting_date
    );
  ELSIF v_was_krup OR (TG_OP = 'DELETE' AND v_is_krup) OR (v_is_krup AND v_row.deleted_at IS NOT NULL) THEN
    PERFORM public.sync_enterprise_lead_for_krup_meeting(v_bin, v_manager_id, NULL, NULL);
  END IF;

  RETURN v_row;
END;
$$;

DROP TRIGGER IF EXISTS trg_assigned_sync_enterprise_lead ON public.crm_assigned_meetings;
CREATE TRIGGER trg_assigned_sync_enterprise_lead
  AFTER INSERT OR UPDATE OR DELETE
  ON public.crm_assigned_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_enterprise_lead_from_meeting();

DROP TRIGGER IF EXISTS trg_conducted_sync_enterprise_lead ON public.crm_conducted_meetings;
CREATE TRIGGER trg_conducted_sync_enterprise_lead
  AFTER INSERT OR UPDATE OR DELETE
  ON public.crm_conducted_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_enterprise_lead_from_meeting();

REVOKE ALL ON FUNCTION public.sync_enterprise_lead_for_krup_meeting(text, uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_sync_enterprise_lead_from_meeting() FROM PUBLIC;

-- Backfill already saved Крупный лид meetings
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT
      regexp_replace(coalesce(m.bin, ''), '[^0-9]', '', 'g') AS bin,
      r.manager_id,
      m.meeting_date
    FROM public.crm_assigned_meetings m
    JOIN public.crm_reports r ON r.id = m.report_id
    WHERE m.deleted_at IS NULL
      AND r.manager_id IS NOT NULL
      AND lower(replace(coalesce(m.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%'
      AND length(regexp_replace(coalesce(m.bin, ''), '[^0-9]', '', 'g')) = 12
    UNION
    SELECT DISTINCT
      regexp_replace(coalesce(m.bin, ''), '[^0-9]', '', 'g') AS bin,
      r.manager_id,
      m.meeting_date
    FROM public.crm_conducted_meetings m
    JOIN public.crm_reports r ON r.id = m.report_id
    WHERE m.deleted_at IS NULL
      AND r.manager_id IS NOT NULL
      AND lower(replace(coalesce(m.meeting_type, ''), 'ё', 'е')) LIKE '%крупн%'
      AND length(regexp_replace(coalesce(m.bin, ''), '[^0-9]', '', 'g')) = 12
  LOOP
    PERFORM public.sync_enterprise_lead_for_krup_meeting(rec.bin, rec.manager_id, NULL, rec.meeting_date);
  END LOOP;
END $$;
