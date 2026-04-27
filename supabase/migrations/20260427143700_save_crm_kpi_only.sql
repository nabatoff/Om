CREATE OR REPLACE FUNCTION public.save_crm_kpi(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_active boolean := false;
  v_manager_name text := '';
  v_report_id uuid;
  v_input_report_id uuid := nullif(payload->>'reportId', '')::uuid;
  v_report_date date := (payload->>'reportDate')::date;
  v_processed int := coalesce((payload->>'processedTotal')::int, 0);
  v_new int := coalesce((payload->>'newInWork')::int, 0);
  v_calls int := coalesce((payload->>'callsTotal')::int, 0);
  v_validated int := coalesce((payload->>'validatedTotal')::int, 0);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT (p.is_active IS NOT FALSE), trim(coalesce(p.full_name, ''))
  INTO v_is_active, v_manager_name
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF NOT coalesce(v_is_active, false) THEN
    RAISE EXCEPTION 'User is inactive' USING ERRCODE = '42501';
  END IF;

  IF coalesce(v_manager_name, '') = '' THEN
    RAISE EXCEPTION 'Заполните ФИО в profiles.full_name' USING ERRCODE = '23514';
  END IF;

  IF v_input_report_id IS NOT NULL THEN
    SELECT r.id
      INTO v_report_id
    FROM public.crm_reports r
    WHERE r.id = v_input_report_id
      AND (is_admin() OR r.manager_id = v_uid)
    LIMIT 1;
  END IF;

  IF v_report_id IS NULL THEN
    SELECT r.id
      INTO v_report_id
    FROM public.crm_reports r
    WHERE r.report_date = v_report_date
      AND (
        r.manager_id = v_uid
        OR (r.manager_id IS NULL AND trim(coalesce(r.manager, '')) = v_manager_name)
      )
    ORDER BY (r.manager_id IS NULL), r.id DESC
    LIMIT 1;
  END IF;

  IF v_report_id IS NULL THEN
    INSERT INTO public.crm_reports (
      report_date,
      manager,
      manager_id,
      processed_total,
      new_in_work,
      calls_total,
      validated_total
    )
    VALUES (
      v_report_date,
      v_manager_name,
      v_uid,
      v_processed,
      v_new,
      v_calls,
      v_validated
    )
    RETURNING id INTO v_report_id;
  ELSE
    UPDATE public.crm_reports
    SET
      report_date = v_report_date,
      manager = v_manager_name,
      manager_id = v_uid,
      processed_total = v_processed,
      new_in_work = v_new,
      calls_total = v_calls,
      validated_total = v_validated
    WHERE id = v_report_id;
  END IF;

  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_crm_kpi(jsonb) TO authenticated;
