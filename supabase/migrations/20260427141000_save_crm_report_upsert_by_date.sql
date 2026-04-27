CREATE OR REPLACE FUNCTION public.save_crm_report(payload jsonb)
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
  v_stats jsonb := coalesce(payload->'stats', '{}'::jsonb);
  v_assigned jsonb := coalesce(payload->'assignedMeetings', '[]'::jsonb);
  v_conducted jsonb := coalesce(payload->'conductedMeetings', '[]'::jsonb);
  v_orders jsonb := coalesce(payload->'confirmedOrders', '[]'::jsonb);
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
    WHERE r.manager_id = v_uid
      AND r.report_date = v_report_date
    ORDER BY r.created_at DESC NULLS LAST, r.id DESC
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
      coalesce((v_stats->>'processedTotal')::int, 0),
      coalesce((v_stats->>'newInWork')::int, 0),
      coalesce((v_stats->>'callsTotal')::int, 0),
      coalesce((v_stats->>'validatedTotal')::int, 0)
    )
    RETURNING id INTO v_report_id;
  ELSE
    UPDATE public.crm_reports
    SET
      report_date = v_report_date,
      manager = v_manager_name,
      manager_id = v_uid,
      processed_total = coalesce((v_stats->>'processedTotal')::int, 0),
      new_in_work = coalesce((v_stats->>'newInWork')::int, 0),
      calls_total = coalesce((v_stats->>'callsTotal')::int, 0),
      validated_total = coalesce((v_stats->>'validatedTotal')::int, 0)
    WHERE id = v_report_id;

    DELETE FROM public.crm_assigned_meetings WHERE report_id = v_report_id;
    DELETE FROM public.crm_conducted_meetings WHERE report_id = v_report_id;
    DELETE FROM public.crm_confirmed_orders WHERE report_id = v_report_id;
  END IF;

  INSERT INTO public.crm_assigned_meetings (
    report_id,
    entity_name,
    bin,
    meeting_date,
    meeting_type,
    sort_order
  )
  SELECT
    v_report_id,
    trim(coalesce(raw."entityName", '')) AS entity_name,
    trim(coalesce(raw.bin, '')) AS bin,
    raw.date AS meeting_date,
    trim(coalesce(raw.type, '')) AS meeting_type,
    row_number() OVER () - 1 AS sort_order
  FROM jsonb_to_recordset(v_assigned) AS raw(
    "entityName" text,
    bin text,
    date date,
    type text
  )
  WHERE trim(coalesce(raw."entityName", '')) <> ''
    AND trim(coalesce(raw.bin, '')) <> '';

  INSERT INTO public.crm_conducted_meetings (
    report_id,
    entity_name,
    bin,
    meeting_date,
    meeting_type,
    result,
    sort_order
  )
  SELECT
    v_report_id,
    trim(coalesce(raw."entityName", '')) AS entity_name,
    trim(coalesce(raw.bin, '')) AS bin,
    raw.date AS meeting_date,
    trim(coalesce(raw.type, '')) AS meeting_type,
    coalesce(raw.result, '') AS result,
    row_number() OVER () - 1 AS sort_order
  FROM jsonb_to_recordset(v_conducted) AS raw(
    "entityName" text,
    bin text,
    date date,
    type text,
    result text
  )
  WHERE trim(coalesce(raw."entityName", '')) <> ''
    AND trim(coalesce(raw.bin, '')) <> '';

  INSERT INTO public.crm_confirmed_orders (
    report_id,
    entity_name,
    bin,
    order_count,
    amounts,
    total_amount,
    sort_order
  )
  SELECT
    v_report_id,
    trim(coalesce(raw."entityName", '')) AS entity_name,
    trim(coalesce(raw.bin, '')) AS bin,
    coalesce(raw."orderCount", 0) AS order_count,
    coalesce(raw.amounts, ARRAY[]::numeric[]) AS amounts,
    coalesce(raw."totalAmount", 0) AS total_amount,
    row_number() OVER () - 1 AS sort_order
  FROM jsonb_to_recordset(v_orders) AS raw(
    "entityName" text,
    bin text,
    "orderCount" int,
    amounts numeric[],
    "totalAmount" numeric
  )
  WHERE trim(coalesce(raw."entityName", '')) <> ''
    AND trim(coalesce(raw.bin, '')) <> '';

  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_crm_report(jsonb) TO authenticated;
