-- Batch transfer to enterprise buffer for lead diggers (+ optional assigned meeting on digger report)

CREATE OR REPLACE FUNCTION public.ensure_crm_report_for_staff(p_staff_id uuid, p_report_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
  v_name text;
BEGIN
  SELECT trim(coalesce(p.full_name, '')) INTO v_name
  FROM public.profiles p
  WHERE p.id = p_staff_id
    AND p.role IN ('manager', 'lead_digger')
    AND coalesce(p.is_active, true);

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Сотрудник не найден' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.id INTO v_report_id
  FROM public.crm_reports r
  WHERE r.manager_id = p_staff_id AND r.report_date = p_report_date
  LIMIT 1;

  IF v_report_id IS NULL THEN
    INSERT INTO public.crm_reports (
      report_date, manager, manager_id,
      processed_total, new_in_work, calls_total, validated_total
    )
    VALUES (p_report_date, v_name, p_staff_id, 0, 0, 0, 0)
    RETURNING id INTO v_report_id;
  END IF;

  RETURN v_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_crm_report_for_staff(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_crm_report_for_staff(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.digger_transfer_enterprise_batch(
  p_report_date date,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_bin text;
  v_name text;
  v_meeting boolean;
  v_client record;
  v_owner_role text;
  v_existing uuid;
  v_lead_id uuid;
  v_report_id uuid;
  v_meeting_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_idx int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_lead_digger() OR public.is_admin_write()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_report_date IS NULL THEN
    RAISE EXCEPTION 'Дата отчёта обязательна' USING ERRCODE = '23514';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Нужен непустой список компаний' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Максимум 50 компаний за раз' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_idx := v_idx + 1;
    v_bin := regexp_replace(trim(coalesce(v_item->>'bin', '')), '[^0-9]', '', 'g');
    v_name := trim(coalesce(v_item->>'name', ''));
    v_meeting := coalesce((v_item->>'meeting_scheduled')::boolean, false);

    IF length(v_bin) <> 12 THEN
      RAISE EXCEPTION 'Строка %: БИН должен состоять ровно из 12 цифр', v_idx USING ERRCODE = '23514';
    END IF;
    IF v_name = '' THEN
      RAISE EXCEPTION 'Строка %: укажите название', v_idx USING ERRCODE = '23514';
    END IF;
    IF v_bin = ANY (v_seen) THEN
      RAISE EXCEPTION 'Строка %: дублирующий БИН %', v_idx, v_bin USING ERRCODE = '23505';
    END IF;
    v_seen := array_append(v_seen, v_bin);

    SELECT c.bin, c.name, c.manager_id, c.business_scale
    INTO v_client
    FROM public.crm_clients c
    WHERE c.bin = v_bin;

    IF NOT FOUND THEN
      INSERT INTO public.crm_clients (bin, name, manager_id, business_scale)
      VALUES (v_bin, v_name, v_uid, 'enterprise')
      RETURNING bin, name, manager_id, business_scale INTO v_client;
    ELSE
      IF v_client.manager_id IS NOT NULL THEN
        SELECT p.role INTO v_owner_role FROM public.profiles p WHERE p.id = v_client.manager_id;
        IF v_owner_role = 'manager' THEN
          RAISE EXCEPTION 'Строка %: компания % закреплена за менеджером крупного', v_idx, v_bin
            USING ERRCODE = '23514';
        END IF;
      END IF;

      IF public.is_lead_digger() AND NOT public.is_admin_write() THEN
        IF v_client.manager_id IS NOT NULL AND v_client.manager_id IS DISTINCT FROM v_uid THEN
          RAISE EXCEPTION 'Строка %: можно передавать только своих компаний', v_idx USING ERRCODE = '42501';
        END IF;
      END IF;

      UPDATE public.crm_clients
      SET
        name = v_name,
        manager_id = coalesce(manager_id, v_uid),
        business_scale = 'enterprise'
      WHERE bin = v_bin
      RETURNING bin, name, manager_id, business_scale INTO v_client;
    END IF;

    SELECT l.id INTO v_existing
    FROM public.crm_enterprise_leads l
    WHERE l.bin = v_bin
      AND l.routing_status IN ('pending_distribution', 'assigned_to_manager')
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      v_lead_id := v_existing;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'bin', v_bin,
        'name', v_name,
        'lead_id', v_lead_id,
        'created', false,
        'meeting_scheduled', false,
        'skipped_existing', true
      ));
      CONTINUE;
    END IF;

    INSERT INTO public.crm_enterprise_leads (
      bin, creator_id, routing_status, transferred_at
    )
    VALUES (
      v_bin,
      coalesce(v_client.manager_id, v_uid),
      'pending_distribution',
      now()
    )
    RETURNING id INTO v_lead_id;

    PERFORM public.log_crm_lead_event(
      v_lead_id,
      'transferred',
      jsonb_build_object('bin', v_bin, 'batch', true)
    );

    v_meeting_id := NULL;
    IF v_meeting THEN
      v_report_id := public.ensure_crm_report_for_staff(v_uid, p_report_date);

      SELECT m.id INTO v_meeting_id
      FROM public.crm_assigned_meetings m
      WHERE m.report_id = v_report_id
        AND m.bin = v_bin
        AND m.meeting_date = p_report_date
        AND m.deleted_at IS NULL
      LIMIT 1;

      IF v_meeting_id IS NULL THEN
        INSERT INTO public.crm_assigned_meetings (
          report_id, entity_name, bin, meeting_date, meeting_type, sort_order
        )
        VALUES (
          v_report_id,
          v_name,
          v_bin,
          p_report_date,
          'Новая',
          coalesce((SELECT max(m.sort_order) + 1 FROM public.crm_assigned_meetings m WHERE m.report_id = v_report_id), 0)
        )
        RETURNING id INTO v_meeting_id;
      END IF;
    END IF;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'bin', v_bin,
      'name', v_name,
      'lead_id', v_lead_id,
      'created', true,
      'meeting_scheduled', v_meeting,
      'meeting_id', v_meeting_id,
      'skipped_existing', false
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'items', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.digger_transfer_enterprise_batch(date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.digger_transfer_enterprise_batch(date, jsonb) TO authenticated;
